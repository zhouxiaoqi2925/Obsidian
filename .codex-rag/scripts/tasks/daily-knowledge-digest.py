from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
import re


VAULT = Path(r"G:\Obsidian Vault")
DASHBOARD = VAULT / "Dashboard"
TODAY = datetime.now().strftime("%Y-%m-%d")
SINCE = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
OUT_FILE = DASHBOARD / f"knowledge-digest-{TODAY}.md"
EXCLUDED_ROOTS = {
    ".obsidian",
    ".git",
    ".codex-rag",
    ".claude",
    ".claudian",
    ".backup-logs",
    "Excalidraw",
    "Templater",
    "copilot",
}
WIKI_LINK_RE = re.compile(r"\[\[[^\]]+\]\]")


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore")


def tag_summary(lines: list[str]) -> str:
    if not lines or lines[0].strip() != "---":
        return "-"
    tags: list[str] = []
    for line in lines[1:]:
        stripped = line.strip()
        if stripped == "---":
            break
        if stripped.startswith("tags:"):
            value = stripped[5:].strip().strip("[]")
            for part in value.split(","):
                tag = part.strip().strip("'\"")
                if tag:
                    tags.append(tag)
        elif stripped.startswith("- "):
            tag = stripped[2:].strip().strip("'\"")
            if tag:
                tags.append(tag)
    return ", ".join(dict.fromkeys(tags)) if tags else "-"


def preview(lines: list[str]) -> str:
    results: list[str] = []
    index = 0
    if lines and lines[0].strip() == "---":
        index = 1
        while index < len(lines) and lines[index].strip() != "---":
            index += 1
        index += 1

    for line in lines[index:]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#") or stripped.startswith("```") or stripped.startswith("!["):
            continue
        results.append(stripped)
        if len(results) == 3:
            break
    return " / ".join(results) if results else "(no plain-text preview)"


def collect_items() -> list[dict]:
    items: list[dict] = []
    for path in sorted(VAULT.rglob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True):
        relative = path.relative_to(VAULT)
        root = relative.parts[0] if relative.parts else ""
        if root in EXCLUDED_ROOTS:
            continue
        modified = datetime.fromtimestamp(path.stat().st_mtime)
        if modified < SINCE:
            continue
        text = read_text(path)
        lines = text.splitlines()
        items.append(
            {
                "root": root,
                "relative": str(relative).replace("\\", "/"),
                "updated": modified.strftime("%Y-%m-%d %H:%M"),
                "size": path.stat().st_size,
                "tags": tag_summary(lines),
                "links": len(WIKI_LINK_RE.findall(text)),
                "preview": preview(lines),
            }
        )
    return items


def render(items: list[dict]) -> str:
    counts: dict[str, int] = {}
    for item in items:
        counts[item["root"]] = counts.get(item["root"], 0) + 1

    lines = [
        "---",
        f"date: {TODAY}",
        "type: knowledge-digest",
        "generated_by: daily-knowledge-digest.py",
        "tags: [knowledge, digest, codex, dashboard]",
        "---",
        "",
        f"# Daily Knowledge Digest - {TODAY}",
        "",
        f"> Covers notes updated since {SINCE.strftime('%Y-%m-%d %H:%M')}.",
        "> This report lists source notes only and does not rewrite them.",
        "",
        "## Summary",
        "",
        f"- Notes captured: **{len(items)}**",
        "- Capture window: last 24 hours",
        "",
        "## By Area",
        "",
    ]

    if counts:
        for root, count in sorted(counts.items(), key=lambda x: (-x[1], x[0])):
            lines.append(f"- `{root}`: {count}")
    else:
        lines.append("- No updated notes found in tracked areas.")

    lines.extend(["", "## Detailed List", ""])

    if items:
        for item in items:
            lines.extend(
                [
                    f"### {item['relative']}",
                    f"- Updated: `{item['updated']}`",
                    f"- Tags: {item['tags']}",
                    f"- Wiki links: {item['links']}",
                    f"- Size: {item['size']} bytes",
                    f"- Preview: {item['preview']}",
                    "",
                ]
            )
    else:
        lines.extend(["No notes matched the last-24-hours capture window.", ""])

    return "\n".join(lines)


def main() -> None:
    DASHBOARD.mkdir(parents=True, exist_ok=True)
    items = collect_items()
    OUT_FILE.write_text(render(items), encoding="utf-8")
    print(f"wrote {OUT_FILE} with {len(items)} notes")


if __name__ == "__main__":
    main()
