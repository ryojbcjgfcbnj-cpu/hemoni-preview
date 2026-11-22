"""Rank new evidence from a question and a JSON list of named candidates."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from ranker import BM25, Encoder, rank
from dataset import write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--model", type=Path)
    parser.add_argument("--export-embed-input", type=Path)
    parser.add_argument("--embeddings", type=Path)
    args = parser.parse_args()
    prompt = json.loads(args.input.read_text(encoding="utf-8"))
    query, candidates = prompt["query"], prompt["candidates"]
    if not isinstance(query, str) or not query.strip() or not candidates:
        raise ValueError("Provide a question and at least one candidate.")
    if len({item["id"] for item in candidates}) != len(candidates):
        raise ValueError("Candidate IDs must be unique.")
    embed_input = [{"id": "demo", "query": query,
                    "candidates": [item["text"] for item in candidates]}]
    if args.export_embed_input:
        write_json(args.export_embed_input, embed_input)
        return
    path = args.model or Path("run/qwen_ranker.npz" if args.embeddings
                              else "run/evidence_ranker.npz")
    with np.load(path, allow_pickle=False) as model:
        weights = model["weights"]
        if args.embeddings:
            embedded = json.loads(args.embeddings.read_text(encoding="utf-8"))
            data = (json.dumps(embed_input, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            if (embedded["input_sha256"] != hashlib.sha256(data).hexdigest()
                    or model["model_name"].item() != embedded["model"]
                    or model["template"].item() != embedded["template"]):
                raise ValueError("Embeddings do not match this input or checkpoint.")
            vectors = np.asarray(embedded["pairs"]["demo"], dtype=float)
            matrix = vectors / np.linalg.norm(vectors, axis=1, keepdims=True)
        else:
            corpus = json.loads(model["corpus"].item())
            bm25 = BM25.__new__(BM25)
            bm25.average, bm25.idf = corpus["average"], corpus["idf"]
            matrix = Encoder(bm25).transform(query, candidates)
    order, scores = rank(weights, matrix, candidates)
    source = {item["id"]: item["text"] for item in candidates}
    output = [{"rank": index, "id": key, "score": round(scores[key], 6), "text": source[key]}
              for index, key in enumerate(order, start=1)]
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
