#!/usr/bin/env python3
"""
MCP server exposing RAG search over stdio.
Tool: rag_search(query, top_k=5, path_prefix=None)
Register in ~/.codex/config.toml as a stdio MCP.
"""
import sys
import json
import os
from pathlib import Path
import chromadb
from sentence_transformers import SentenceTransformer

VAULT = Path(r"G:\Obsidian Vault")
DB_DIR = VAULT / ".codex-rag" / "data" / "chroma"
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
COLLECTION = "vault"

_model = None
_coll = None


def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def get_coll():
    global _coll
    if _coll is None:
        client = chromadb.PersistentClient(path=str(DB_DIR))
        _coll = client.get_collection(COLLECTION)
    return _coll


def search(query: str, top_k: int = 5, path_prefix: str | None = None) -> list[dict]:
    model = get_model()
    coll = get_coll()
    q_emb = model.encode([query]).tolist()
    where = {"path": {"$contains": path_prefix}} if path_prefix else None
    res = coll.query(query_embeddings=q_emb, n_results=top_k, where=where)
    out = []
    for i in range(len(res["ids"][0])):
        out.append({
            "path": res["metadatas"][0][i]["path"],
            "chunk": res["metadatas"][0][i]["chunk"],
            "score": round(1.0 - res["distances"][0][i], 4),
            "text": res["documents"][0][i][:600],
        })
    return out


def send(msg):
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    send({"jsonrpc": "2.0", "method": "ready"})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        method = req.get("method")
        params = req.get("params", {})
        rid = req.get("id")
        try:
            if method == "initialize":
                send({"jsonrpc": "2.0", "id": rid, "result": {
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {"name": "obsidian-rag", "version": "0.1.0"},
                    "capabilities": {"tools": {}},
                }})
            elif method == "tools/list":
                send({"jsonrpc": "2.0", "id": rid, "result": {"tools": [{
                    "name": "rag_search",
                    "description": "Semantic search over the Obsidian vault (G:\\Obsidian Vault). Use for open-ended questions, recalling prior notes by concept rather than exact keyword.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "natural language query, 中文 or English"},
                            "top_k": {"type": "integer", "default": 5, "minimum": 1, "maximum": 20},
                            "path_prefix": {"type": "string", "description": "optional filter, e.g. 'Projects/' or 'Knowledge/'"},
                        },
                        "required": ["query"],
                    },
                }]}})
            elif method == "tools/call":
                args = params.get("arguments", {})
                name = params.get("name")
                if name == "rag_search":
                    res = search(
                        args["query"],
                        top_k=args.get("top_k", 5),
                        path_prefix=args.get("path_prefix"),
                    )
                    text = "\n\n".join(
                        f"[{r['path']} #{r['chunk']+1} score={r['score']}]\n{r['text']}"
                        for r in res
                    ) or "(no results)"
                    send({"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": text}]}})
                else:
                    send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"unknown tool: {name}"}})
            else:
                send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"unknown method: {method}"}})
        except Exception as e:
            send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32603, "message": str(e)}})


if __name__ == "__main__":
    main()