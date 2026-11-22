"""Train and compare retrieval baselines and pairwise evidence ranking."""

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix, vstack

from dataset import load_rows, public_input, write_json
from ranker import Encoder, fit_ranker, rank, verify_gradient

REGULARIZATION = (0.002, 0.01, 0.05, 0.2, 1.0)


def make_differences(rows, matrices, use_edit):
    differences = []
    for row in rows:
        ids = [item["id"] for item in row["candidates"]]
        matrix = matrices[row["id"]]
        after = matrix[ids.index(row["edit"]["after"])]
        primary, secondary = row["easy"]
        # Balance which easy negative survives without relying on document order.
        if hashlib.sha256(row["id"].encode("utf-8")).digest()[0] % 2:
            primary, secondary = secondary, primary
        other = row["edit"]["before"] if use_edit else secondary
        differences.extend(after - matrix[ids.index(key)] for key in (primary, other))
    return vstack(differences, format="csr")


def select_fit(train, validation, matrices, use_edit):
    differences = make_differences(train, matrices, use_edit)
    trials = []
    for strength in REGULARIZATION:
        weights, info = fit_ranker(differences, strength)
        reciprocal_ranks = []
        for row in validation:
            order, _ = rank(weights, matrices[row["id"]], row["candidates"])
            reciprocal_ranks.append(1 / (order.index(row["edit"]["after"]) + 1))
        trials.append((weights, dict(info, validation_mrr=float(np.mean(reciprocal_ranks)))))
    best_weights, best_info = max(trials, key=lambda trial: (
        trial[1]["validation_mrr"], trial[1]["regularization"]))
    return best_weights, {"selected": best_info, "grid": [info for _, info in trials]}, trials


def read_judge(path, rows):
    if path is None:
        return {}, None
    result = json.loads(path.read_text(encoding="utf-8"))
    expected = (json.dumps([public_input(row) for row in rows], ensure_ascii=False, indent=2)
                + "\n").encode("utf-8")
    hashes = {hashlib.sha256(content).hexdigest()
              for content in (expected, expected.replace(b"\n", b"\r\n"))}
    if result["input_sha256"] not in hashes:
        raise ValueError("The judge result does not match this evaluation input.")
    choices = {item["id"]: item["index"] for item in result["selections"]}
    if len(choices) != len(result["selections"]) or set(choices) != {row["id"] for row in rows}:
        raise ValueError("Incomplete judge results or duplicate sample ID.")
    if not all(type(index) is int and 0 <= index < 4 for index in choices.values()):
        raise ValueError("Judge selected an invalid candidate.")
    return choices, {key: value for key, value in result.items() if key != "selections"}


def read_embeddings(path, rows):
    expected = (json.dumps([public_input(row) for row in rows], ensure_ascii=False, indent=2)
                + "\n").encode("utf-8")
    result = json.loads(path.read_text(encoding="utf-8"))
    if hashlib.sha256(expected).hexdigest() != result["input_sha256"]:
        raise ValueError("The embedding cache does not match the input.")
    ids = {row["id"] for row in rows}
    if set(result["pairs"]) != ids:
        raise ValueError("The embedding cache is incomplete.")
    features = {}
    dimension = None
    for key, vectors in result["pairs"].items():
        matrix = np.asarray(vectors, dtype=np.float64)
        if matrix.ndim != 2 or matrix.shape[0] != 4 or not np.isfinite(matrix).all():
            raise ValueError(f"Invalid embedding matrix for {key}")
        if dimension is None:
            dimension = matrix.shape[1]
        if matrix.shape[1] != dimension or np.any(np.linalg.norm(matrix, axis=1) == 0):
            raise ValueError(f"Invalid embedding dimension or norm for {key}")
        features[key] = csr_matrix(matrix / np.linalg.norm(matrix, axis=1, keepdims=True))
    return features, {key: value for key, value in result.items() if key != "pairs"}


def evaluate(rows, encoder, models, judge):
    predictions = []
    for row in rows:
        query, candidates = row["query"], row["candidates"]
        scores = {item["id"]: encoder.bm25.score(query, item["text"]) for item in candidates}
        ranks = {"bm25": {"order": sorted(scores, key=scores.get, reverse=True), "scores": scores}}
        for method, (params, features) in models.items():
            order, scores = rank(params, features[row["id"]], candidates)
            ranks[method] = {"order": order, "scores": scores}
        if judge:
            ranks["llm"] = {"order": [candidates[judge[row["id"]]]["id"]]}
        predictions.append(dict(row, ranks=ranks))
    return predictions


def summarize(rows, methods):
    summary = {}
    for method in methods:
        by_document = defaultdict(list)
        reciprocal = []
        wins = 0
        chose_hard = 0
        for row in rows:
            order = row["ranks"][method]["order"]
            gold, hard = row["edit"]["after"], row["edit"]["before"]
            by_document[row["document"]].append(order[0] == gold)
            chose_hard += int(order[0] == hard)
            if method != "llm":
                reciprocal.append(1 / (order.index(gold) + 1))
                scores = row["ranks"][method]["scores"]
                wins += int(scores[gold] > scores[hard])
        summary[method] = {
            "top1_correct": sum(sum(group) for group in by_document.values()),
            "queries": len(rows), "chose_edited_away_evidence": chose_hard,
            "both_correct": sum(all(group) for group in by_document.values()),
            "documents": len(by_document),
            "mrr": float(np.mean(reciprocal)) if reciprocal else None,
            "hard_pair_strict_wins": wins if reciprocal else None,
        }
    return summary


def paired_interval(rows, reference, proposed):
    by_document = defaultdict(list)
    for row in rows:
        target = row["edit"]["after"]
        proposed_hit = row["ranks"][proposed]["order"][0] == target
        reference_hit = row["ranks"][reference]["order"][0] == target
        by_document[row["document"]].append(int(proposed_hit) - int(reference_hit))
    document_deltas = np.array([np.mean(deltas) for deltas in by_document.values()])
    rng = np.random.default_rng(11)
    replicates = rng.choice(document_deltas, size=(4000, len(document_deltas)))
    return {"mean_delta": float(document_deltas.mean()), "documents": len(document_deltas),
            "bootstrap_95_percent": np.quantile(replicates.mean(axis=1), [0.025, 0.975]).tolist()}


def save_model(path, encoder, weights):
    corpus = json.dumps({"average": encoder.bm25.average, "idf": encoder.bm25.idf},
                        ensure_ascii=False)
    np.savez_compressed(path, weights=weights, corpus=corpus)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("run"))
    parser.add_argument("--judge", type=Path)
    parser.add_argument("--embeddings", type=Path)
    args = parser.parse_args()
    verify_gradient()
    rows = load_rows()
    by_split = {name: [row for row in rows if row["split"] == name]
                for name in ("train", "validation", "test", "source_check")}
    judge_rows = [row for row in rows if row["split"] in {"test", "source_check"}]
    choices, judge_metadata = read_judge(args.judge, judge_rows)
    encoder = Encoder.fit(by_split["train"])
    matrices = {row["id"]: encoder.transform(row["query"], row["candidates"]) for row in rows}
    feature_sets = {"": matrices}
    embedding_metadata = None
    if args.embeddings:
        feature_sets["qwen_"], embedding_metadata = read_embeddings(args.embeddings, rows)
    models, model_info, trials = {}, {}, {}
    for prefix, features in feature_sets.items():
        for variant in ("easy_only", "edit_hard"):
            name = prefix + variant
            weights, model_info[name], trials[name] = select_fit(
                by_split["train"], by_split["validation"], features, variant == "edit_hard")
            models[name] = (weights, features)
    predictions = evaluate(judge_rows, encoder, models, choices)
    methods = ("bm25", *models, *(("llm",) if choices else ()))
    test = [row for row in predictions if row["split"] == "test"]
    source = [row for row in predictions if row["split"] == "source_check"]
    metrics = {
        "splits": {name: {"queries": len(group), "documents": len({r["document"] for r in group})}
                   for name, group in by_split.items()},
        "test_families": dict(Counter(row["family"] for row in test)),
        "training": model_info, "judge": judge_metadata, "embeddings": embedding_metadata,
        "benchmark_test": summarize(test, methods), "source_check": summarize(source, methods),
        "paired_difference": {
            f"{candidate}_vs_{reference}": paired_interval(test, reference, candidate)
            for reference, candidate in (("bm25", "edit_hard"), ("easy_only", "edit_hard"),
                                         ("bm25", "qwen_edit_hard"),
                                         ("qwen_easy_only", "qwen_edit_hard"),
                                         ("llm", "qwen_edit_hard"))
            if reference in methods and candidate in methods
        },
        "checks": {"finite_difference_gradient": "passed", "document_split": "passed"},
    }
    if args.embeddings:
        # Choose a common penalty using both models' validation MRR. This gives a
        # second ablation with the same penalty as well as the same number of pairs.
        variants = ("qwen_easy_only", "qwen_edit_hard")
        grid_index = max(range(len(REGULARIZATION)), key=lambda index: (
            sum(trials[name][index][1]["validation_mrr"] for name in variants),
            REGULARIZATION[index]))
        controlled = {name: (trials[name][grid_index][0], models[name][1]) for name in variants}
        controlled_predictions = evaluate(by_split["test"], encoder, controlled, {})
        metrics["common_regularization_ablation"] = {
            "regularization": REGULARIZATION[grid_index],
            "benchmark_test": summarize(controlled_predictions, variants),
            "paired_difference": paired_interval(controlled_predictions, *variants),
        }
        write_json(args.out / "controlled-predictions.json", controlled_predictions)
    write_json(args.out / "metrics.json", metrics)
    write_json(args.out / "predictions.json", predictions)
    write_json(args.out / "dataset.json", rows)
    save_model(args.out / "evidence_ranker.npz", encoder, models["edit_hard"][0])
    if args.embeddings:
        np.savez_compressed(args.out / "qwen_ranker.npz", weights=models["qwen_edit_hard"][0],
                            model_name=embedding_metadata["model"],
                            template=embedding_metadata["template"])
    print(json.dumps(metrics["benchmark_test"], indent=2))


if __name__ == "__main__":
    main()
