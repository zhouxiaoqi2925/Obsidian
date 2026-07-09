#!/usr/bin/env python3
"""
Obsidian Vault RAG indexer.
Builds a ChromaDB index over the vault, using a multilingual sentence-transformer
embedding model. Supports full and incremental re-indexing.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

VAULT = Path(r"G:\Obsidian Vault")
RAG_DIR = VAULT / ".codex-rag"
DB_DIR = RAG_DIR / "data" / "chroma"
LOG_DIR = RAG_DIR / "logs"
STATE_FILE = RAG_DIR / ".state" / "indexed.json"

COLLECTION_NAME = "vault"
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
CHUNK_SIZE = 800   # chars per chunk
CHUNK_OVERLAP = 100

# ---------- helpers ----------

def setup_dirs():
    DB_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)


def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    (LOG_DIR / "index.log").open("a", encoding="utf-8").write(line + "\n")


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def iter_vault_files():
    for p in VAULT.rglob("*.md"):
        rel = p.relative_to(VAULT)
        # skip .obsidian / .git / .codex-rag itself
        parts = rel.parts
        if any(part.startswith(".") for part in parts[:-1]) or parts[0] in (".codex-rag",):
            continue
        yield p, rel


def read_note(path: Path) -> str:
    for enc in ("utf-8", "utf-8-sig", "gb18030"):
        try:
            return path.read_text(encoding=enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return ""


def strip_frontmatter(text: str) -> str:
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            return text[end + 5:]
    return text


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP):
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunk = text[start:end]
        # try to break at paragraph boundary
        if end < len(text):
            last_p = chunk.rfind("\n\n")
            if last_p > size // 2:
                end = start + last_p
                chunk = text[start:end]
        chunks.append(chunk.strip())
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if len(c) > 30]


def file_hash(path: Path) -> str:
    h = hashlib.sha1()
    h.update(path.read_bytes())
    return h.hexdigest()[:16]


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="full rebuild")
    ap.add_argument("--incremental", action="store_true", help="only changed files (default)")
    ap.add_argument("--model", default=MODEL_NAME)
    args = ap.parse_args()

    setup_dirs()
    log(f"== index start (full={args.full}, model={args.model}) ==")

    state = load_state()
    if args.full:
        state = {}

    log("loading embedding model...")
    model = SentenceTransformer(args.model)
    dim = model.get_sentence_embedding_dimension()
    log(f"model dim: {dim}")

    client = chromadb.PersistentClient(path=str(DB_DIR))
    coll = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    if args.full:
        # delete all existing
        existing = coll.get()
        if existing["ids"]:
            coll.delete(ids=existing["ids"])
            log(f"deleted {len(existing['ids'])} existing chunks (full rebuild)")

    indexed = 0
    skipped = 0
    errors = 0
    for path, rel in iter_vault_files():
        h = file_hash(path)
        key = str(rel).replace("\\", "/")
        if not args.full and state.get(key) == h:
            skipped += 1
            continue
        try:
            raw = read_note(path)
            body = strip_frontmatter(raw)
            chunks = chunk_text(body)
            if not chunks:
                state[key] = h
                continue
            ids = [f"{key}::{i}::{h}" for i in range(len(chunks))]
            embeddings = model.encode(chunks, show_progress_bar=False).tolist()
            metadatas = [
                {
                    "path": key,
                    "chunk": i,
                    "total_chunks": len(chunks),
                    "mtime": path.stat().st_mtime,
                    "size": path.stat().st_size,
                }
                for i in range(len(chunks))
            ]
            # delete old chunks for this file
            old = coll.get(where={"path": key})["ids"]
            if old:
                coll.delete(ids=old)
            coll.add(ids=ids, embeddings=embeddings, documents=chunks, metadatas=metadatas)
            state[key] = h
            indexed += 1
        except Exception as e:
            errors += 1
            log(f"  ERR {key}: {e}")
        if indexed % 50 == 0 and indexed > 0:
            log(f"  progress: {indexed} files indexed, {skipped} skipped, {errors} errors")
            save_state(state)

    save_state(state)
    total = coll.count()
    log(f"== done: {indexed} new/updated, {skipped} skipped, {errors} errors, {total} chunks in DB ==")


if __name__ == "__main__":
    main()