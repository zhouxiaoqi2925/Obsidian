#!/usr/bin/env python3
"""
Long-running vault watcher (Python watchdog, debounced, self-ignoring).
Detects .md create/change/delete/move and appends a line to
G:\\Obsidian Vault\\Sessions\\Codex-AutoLog-YYYY-MM-DD.md

Ignores:
  - .obsidian/, .git/, .codex-rag/, .claudian/, .claude/, .backup-logs/
  - Sessions/Codex-AutoLog-*.md (own output, prevent loop)
  - Sessions/Codex-Session-*.md (own output if Codex writes to vault)

Writes use a .tmp file then atomic replace to avoid watcher detecting partial writes.

Start: pythonw scripts/watcher.py
Stop:  taskkill /IM pythonw.exe /F  (and grep ps for "watcher.py")
"""
import os
import sys
import time
import threading
from pathlib import Path
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

VAULT = Path(r"G:\Obsidian Vault")
LOG_DIR = VAULT / "Sessions"
INNER_LOG = VAULT / ".codex-rag" / "logs" / "watcher.log"
IGNORE_DIRS = (".obsidian", ".git", ".codex-rag", ".claudian", ".claude", ".backup-logs")
IGNORE_FILE_PREFIXES = (
    "Sessions/Codex-AutoLog-",
    "Sessions/Codex-Session-",  # Codex 桌面端自己的会话纪要
)
DEBOUNCE_SECS = 3


def log(msg: str):
    INNER_LOG.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    INNER_LOG.open("a", encoding="utf-8").write(f"[{ts}] {msg}\n")
    print(f"[{ts}] {msg}", flush=True)


def auto_log_path() -> Path:
    return LOG_DIR / f"Codex-AutoLog-{datetime.now().strftime('%Y-%m-%d')}.md"


def ensure_autolog() -> Path:
    p = auto_log_path()
    if not p.exists():
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        today = datetime.now().strftime("%Y-%m-%d")
        header = (
            f"---\n"
            f"date: {today}\n"
            f"type: auto-log\n"
            f"generated_by: watcher.py (Codex Desktop \u7b2c\u4e8c\u5927\u8111)\n"
            f"tags: [auto-log, watcher, codex]\n"
            f"---\n\n"
            f"# Codex AutoLog \u00b7 {today}\n\n"
            f"> \u7531 .codex-rag\\watcher.py \u81ea\u52a8\u5199\u5165\u3002\n"
            f"> \u6bcf\u6b21\u542f\u52a8 Codex \u684c\u9762\u7aef\u4f1a\u8bdd,\u5148 rg \u627e\u672c\u6587\u4ef6\u3002\n\n"
            f"---\n\n"
        )
        atomic_write(p, header)
    return p


def atomic_write(p: Path, content: str):
    """Write content to a .tmp file then rename (avoids partial-write events)."""
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, p)


def append_line(p: Path, line: str):
    """Append a line atomically."""
    existing = p.read_text(encoding="utf-8") if p.exists() else ""
    atomic_write(p, existing + line)


def should_ignore(rel: str) -> bool:
    rel_posix = rel.replace("\\", "/")
    if rel_posix.startswith(IGNORE_FILE_PREFIXES):
        return True
    parts = Path(rel_posix).parts
    for part in parts[:-1]:
        if part in IGNORE_DIRS:
            return True
    return False


class DebouncedHandler(FileSystemEventHandler):
    def __init__(self):
        self._last: dict[str, tuple[str, float]] = {}
        self._lock = threading.Lock()

    def _record(self, kind: str, rel: str):
        rel_posix = rel.replace("\\", "/")
        if should_ignore(rel_posix):
            return
        now = time.time()
        with self._lock:
            prev = self._last.get(rel_posix)
            if prev and prev[0] == kind and (now - prev[1]) < DEBOUNCE_SECS:
                return
            self._last[rel_posix] = (kind, now)
        p = ensure_autolog()
        ts = datetime.now().strftime("%H:%M:%S")
        append_line(p, f"- ``{ts}`` **{kind}** \u2192 ``{rel_posix}``\n")

    def on_created(self, event):
        if event.is_directory or not event.src_path.endswith(".md"):
            return
        rel = Path(event.src_path).relative_to(VAULT).as_posix()
        self._record("created", rel)

    def on_modified(self, event):
        if event.is_directory or not event.src_path.endswith(".md"):
            return
        rel = Path(event.src_path).relative_to(VAULT).as_posix()
        self._record("modified", rel)

    def on_deleted(self, event):
        if event.is_directory or not event.src_path.endswith(".md"):
            return
        rel = Path(event.src_path).relative_to(VAULT).as_posix()
        self._record("deleted", rel)

    def on_moved(self, event):
        if event.is_directory:
            return
        if event.src_path.endswith(".md"):
            rel = Path(event.src_path).relative_to(VAULT).as_posix()
            self._record("deleted", rel)
        if event.dest_path.endswith(".md"):
            rel = Path(event.dest_path).relative_to(VAULT).as_posix()
            self._record("created", rel)


def main():
    log("== watcher starting (python watchdog, debounced, self-ignoring) ==")
    handler = DebouncedHandler()
    observer = Observer()
    observer.schedule(handler, str(VAULT), recursive=True)
    observer.start()
    log(f"watcher active on {VAULT} (pid {os.getpid()}, debounce={DEBOUNCE_SECS}s)")

    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        log("watcher stopping (KeyboardInterrupt)")
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()