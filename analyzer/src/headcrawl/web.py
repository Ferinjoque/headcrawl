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
    picked: list[str] = []
    total = 0
    for e in sorted(entries, key=lambda e: str(e.get("path", ""))):
        path, size = str(e.get("path", "")), int(e.get("size") or 0)
        if not path or size <= 0 or size > BROWSER.max_file_bytes or not wanted(path):
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
    spec = analyze(
        Path(root),
        name=name,
        url=url,
        limits=BROWSER,
        head=head,
        history=history,
        window=HISTORY_WINDOW if history else 0,
        blame=_blame(blame_json),
        subjects=_subjects(subjects_json),
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


def _blame(raw_json: str) -> dict[str, dict[int, int]]:
    """{path: {line: year}}, everything checked: it comes from the network."""
    raw = json.loads(raw_json)
    out: dict[str, dict[int, int]] = {}
    if not isinstance(raw, dict):
        return out
    for path, lines in raw.items():
        if not isinstance(lines, dict):
            continue
        years = {}
        for line, year in lines.items():
            if str(line).isdigit() and isinstance(year, int) and 1970 <= year <= 2200:
                years[int(line)] = year
        out[str(path)] = years
    return out


def _subjects(raw_json: str) -> dict[str, str]:
    raw = json.loads(raw_json)
    if not isinstance(raw, dict):
        return {}
    # Only the subject line; the body can be pages long.
    return {str(k): v.split("\n", 1)[0][:300] for k, v in raw.items() if isinstance(v, str)}
