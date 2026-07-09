#!/usr/bin/env python3
"""
RAG search CLI. Used by both humans and Codex (via Bash invocation).
"""
import argparse
import json
import sys
from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer

VAULT = Path(r"G:\Obsidian Vault")
DB_DIR = VAULT / ".codex-rag" / "data" / "chroma"
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
COLLECTION = "vault"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("query", nargs="+", help="search query (中文 or English)")
    ap.add_argument("-n", "--top-k", type=int, default=5)
    ap.add_argument("--path-prefix", default=None, help="filter by path prefix, e.g. Projects/")
    ap.add_argument("--json", action="store_true", help="machine-readable JSON output")
    args = ap.parse_args()

    query = " ".join(args.query)
    model = SentenceTransformer(MODEL_NAME)
    client = chromadb.PersistentClient(path=str(DB_DIR))
    coll = client.get_collection(COLLECTION)

    q_emb = model.encode([query]).tolist()
    where = {"path": {"$contains": args.path_prefix}} if args.path_prefix else None
    res = coll.query(query_embeddings=q_emb, n_results=args.top_k, where=where)

    if args.json:
        out = {
            "query": query,
            "results": [
                {
                    "id": res["ids"][0][i],
                    "path": res["metadatas"][0][i]["path"],
                    "chunk": res["metadatas"][0][i]["chunk"],
                    "distance": res["distances"][0][i],
                    "text": res["documents"][0][i],
                }
                for i in range(len(res["ids"][0]))
            ],
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return

    print(f"\n🔍 query: {query}\n")
    for i in range(len(res["ids"][0])):
        m = res["metadatas"][0][i]
        d = res["distances"][0][i]
        score = 1.0 - d
        text = res["documents"][0][i]
        text = text[:300] + ("..." if len(text) > 300 else "")
        print(f"── [{i+1}] {m['path']}  (chunk {m['chunk']+1}/{m['total_chunks']}, score={score:.3f})")
        print(text)
        print()


if __name__ == "__main__":
    main()