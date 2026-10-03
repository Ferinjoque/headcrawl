"""Entry points for the browser build (Pyodide, no git, no network).

The page fetches the file list and the files from GitHub itself, asks
choose() which ones are worth downloading, writes them into Pyodide's file
system and calls dungeon(). Everything here returns plain JSON strings.
"""

import json
import time
from pathlib import Path

from . import gitio
from .build import analyze
from .deps import MANIFESTS
from .limits import Limits
from .walk import wanted

# Smaller than the CLI: every file is a separate download in the browser.
BROWSER = Limits(max_files=500, max_read_bytes=6 * 1024 * 1024, max_seconds=120)
# The GitHub commits API gives at most 100 per page; that is our history window.
HISTORY_WINDOW = 100


def choose(tree_json: str) -> str:
    """tree_json: [{"path": str, "size": int}, ...] from the GitHub tree API.
    Returns the paths to download, smallest set that still covers the repo."""
    entries = json.loads(tree_json)
    # Dependency manifests at the root, for the vendor. Small and few.
    picked: list[str] = [
        str(e["path"]) for e in entries if e.get("path") in MANIFESTS and 0 < int(e.get("size") or 0) <= 256 * 1024
    ]
    total = 0
    for e in sorted(entries, key=lambda e: str(e.get("path", ""))):
        path, size = str(e.get("path", "")), int(e.get("size") or 0)
        if not path or size <= 0 or size > BROWSER.max_file_bytes or not wanted(path) or path in picked:
            continue
        if total + size > BROWSER.max_read_bytes or len(picked) >= BROWSER.max_files:
            break
        picked.append(path)
        total += size
    return json.dumps(picked)


def dungeon(
    root: str,
    name: str,
    url: str,
    sha: str,
    committed: str,
    history_json: str = "{}",
    blame_json: str = "{}",
    subjects_json: str = "{}",
) -> str:
    """committed: ISO 8601 time of the HEAD commit, as GitHub reports it.
    history_json: {"path": commits touching it among the last HISTORY_WINDOW}."""
    when = int(time.mktime(time.strptime(committed[:19], "%Y-%m-%dT%H:%M:%S"))) if committed else 0
    head = gitio.Head(sha=sha, time=max(0, when), branch=None)
    raw = json.loads(history_json)
    history = {str(k): max(0, min(int(v), HISTORY_WINDOW)) for k, v in raw.items()} if isinstance(raw, dict) else {}
    years, authors = _blame(blame_json)
    spec = analyze(
        Path(root),
        name=name,
        url=url,
        limits=BROWSER,
        head=head,
        history=history,
        window=HISTORY_WINDOW if history else 0,
        blame=years,
        subjects=_subjects(subjects_json),
        authors=authors,
    )
    return spec.model_dump_json(exclude_none=True)


def candidates(spec_json: str, per_floor: int = 2) -> str:
    """Files worth asking GitHub about: on each floor, the boss's file and the
    next hottest one. Their history can change which of them hosts the boss."""
    spec = json.loads(spec_json)
    out: list[str] = []
    for floor in spec["floors"]:
        rooms = [r for r in floor["rooms"] if r["kind"] != "shrine"]
        rooms.sort(key=lambda r: (r["id"] != floor["lair"], -r["heat"], r["path"]))
        out.extend(r["path"] for r in rooms[:per_floor])
    return json.dumps(out)


def loot_lines(spec_json: str) -> str:
    """{path: [line, ...]} for every piece of loot, so the page can ask GitHub's
    blame for just those lines."""
    spec = json.loads(spec_json)
    out: dict[str, list[int]] = {}
    for floor in spec["floors"]:
        for room in floor["rooms"]:
            if room["loot"]:
                out[room["path"]] = sorted({item["line"] for item in room["loot"]})
    return json.dumps(out)


def _blame(raw_json: str) -> tuple[dict[str, dict[int, int]], dict[str, dict[int, str]]]:
    """{path: {line: year or {"year": y, "author": name}}} into years and
    authors, everything checked: it comes from the network."""
    raw = json.loads(raw_json)
    years_out: dict[str, dict[int, int]] = {}
    authors_out: dict[str, dict[int, str]] = {}
    if not isinstance(raw, dict):
        return years_out, authors_out
    for path, lines in raw.items():
        if not isinstance(lines, dict):
            continue
        years: dict[int, int] = {}
        authors: dict[int, str] = {}
        for line, value in lines.items():
            if not str(line).isdigit():
                continue
            year = value.get("year") if isinstance(value, dict) else value
            if not isinstance(year, int) or not 1970 <= year <= 2200:
                continue
            years[int(line)] = year
            author = value.get("author") if isinstance(value, dict) else None
            if isinstance(author, str) and author.strip():
                authors[int(line)] = author[:100]
        years_out[str(path)] = years
        authors_out[str(path)] = authors
    return years_out, authors_out


def _subjects(raw_json: str) -> dict[str, str]:
    raw = json.loads(raw_json)
    if not isinstance(raw, dict):
        return {}
    # Only the subject line; the body can be pages long.
    return {str(k): v.split("\n", 1)[0][:300] for k, v in raw.items() if isinstance(v, str)}
