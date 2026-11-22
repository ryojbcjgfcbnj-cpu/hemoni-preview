"""Build candidate lists and pair labels from citation-replacement events."""

import argparse
import csv
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8", newline="\n")


def _make_row(document, family, split, task_number, task, evidence, easy):
    sample_id = f"{document}-{task_number}"
    # Same permutation for both tasks in a document. Position cannot distinguish
    # the correct source across these opposing questions.
    candidates = list(evidence.items())
    random.Random(document).shuffle(candidates)
    replacement = {
        "operation": "replace_citation",
        "sequence": 1,
        "before": task["before"],
        "after": task["after"],
    }
    return {
        "id": sample_id, "document": document, "family": family,
        "split": split, "origin": task["origin"], "query": task["query"],
        "candidates": [{"id": key, "text": text} for key, text in candidates],
        "edit": replacement, "easy": list(easy),
    }


def load_rows():
    with (ROOT / "data/benchmark.tsv").open(encoding="utf-8", newline="") as file:
        documents = list(csv.DictReader(file, delimiter="\t"))
    rows = []
    for family in sorted({doc["family"] for doc in documents}):
        members = [doc for doc in documents if doc["family"] == family]
        for doc in members:
            split = doc["split"]
            if split not in {"train", "validation", "test"}:
                raise ValueError(f"Invalid document split: {split}")
            evidence = {"e1": doc["positive_a"], "e2": doc["positive_b"],
                        "e3": doc["easy_a"], "e4": doc["easy_b"]}
            for number, (key, before, after) in enumerate(
                (("query_a", "e2", "e1"), ("query_b", "e1", "e2")), start=1
            ):
                task = {"query": doc[key], "before": before, "after": after,
                        "origin": "benchmark_edit"}
                rows.append(_make_row(doc["document"], family, split, number, task,
                                      evidence, ("e3", "e4")))

    anchor = json.loads((ROOT / "data/source_check.json").read_text(encoding="utf-8"))
    for number, task in enumerate(anchor["tasks"], start=1):
        rows.append(_make_row(anchor["document"], anchor["family"], "source_check",
                              number, task, anchor["evidence"], ()))
    validate(rows)
    return rows


def validate(rows):
    by_document = {}
    ids = set()
    for row in rows:
        assert row["id"] not in ids and row["query"].strip()
        ids.add(row["id"])
        evidence = {item["id"]: item["text"] for item in row["candidates"]}
        assert len(evidence) == len(set(evidence.values())) == 4
        assert all(text.strip() for text in evidence.values())
        before, after = row["edit"]["before"], row["edit"]["after"]
        assert before in evidence and after in evidence and before != after
        assert not {before, after}.intersection(row["easy"])
        assert set(row["easy"]) <= evidence.keys()
        assert by_document.setdefault(row["document"], row["split"]) == row["split"]
        assert (row["split"] == "source_check") == (row["origin"] != "benchmark_edit")


def public_input(row):
    return {"id": row["id"], "query": row["query"],
            "candidates": [candidate["text"] for candidate in row["candidates"]]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--all", action="store_true", help="Include train and validation inputs.")
    args = parser.parse_args()
    write_json(args.output, [public_input(row) for row in load_rows()
                             if args.all or row["split"] in {"test", "source_check"}])
