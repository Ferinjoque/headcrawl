"""Boss titles and taunts from a local Ollama model. Entirely optional.

The model only ever sees text and only ever returns text that goes through
the same cleaning as everything else. Any failure (no Ollama, slow model, bad
JSON) leaves the template lines in place. Answers are cached by a hash of
what was asked, so rebuilding a dungeon is free and stays the same.
"""

import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, Field, ValidationError

from .models import Boss, DungeonSpec, Floor
from .text import clean

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


class _Answer(BaseModel):
    title: str = Field(min_length=3, max_length=60)
    taunts: list[str] = Field(min_length=1, max_length=4)


# Hand written: pydantic's schema carries "title" keys that some models copy
# straight into the answer.
SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "taunts": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 4},
    },
    "required": ["title", "taunts"],
}

_JUNK = re.compile(r"lorem|ipsum|sample|placeholder|example|taunt\s*\d|title\s*\d|\w+-\w+-\w+", re.I)


def _prompt(spec: DungeonSpec, floor: Floor, boss: Boss) -> str:
    room = next(r for r in floor.rooms if r.id == floor.lair)
    todo = next((loot.text for r in floor.rooms for loot in r.loot), "")
    return (
        "You write lines for a boss in a roguelike where the dungeon is a code repository.\n"
        "The boss is a real function. Keep it dry and a little funny, like a tired senior engineer. "
        "No emojis, no hashtags, no exclamation marks.\n"
        f"Repository: {spec.repo.name}\n"
        f"File: {room.path}\n"
        f"Function: {boss.signature}\n"
        f"Branches (cyclomatic complexity): {boss.ccn}\n"
        f"Commits that touched the file recently: {boss.churn}\n"
        f"Last boss of the dungeon: {'yes' if boss.final else 'no'}\n"
        + (f"A comment found on this floor: {todo}\n" if todo else "")
        + "Return a short title (2 to 5 words, starting with 'the') and 2 to 4 taunts under 90 characters each, "
        f"spoken by {boss.name} to the player. Each taunt must mention the function, the file, "
        "or one of the numbers above. Style example, do not copy it: "
        '{"title": "the Twice Reverted", "taunts": ["Every fix you push, I push back.", '
        '"I was supposed to be temporary. That was four years ago."]}'
    )


def _ask(host: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    req = urllib.request.Request(  # noqa: S310 - host is checked to be local before this runs
        f"{host}/api/chat",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310
        data: dict[str, Any] = json.loads(res.read(1_000_000))
        return data


def _facts(floor: Floor, boss: Boss) -> list[str]:
    room = next(r for r in floor.rooms if r.id == floor.lair)
    words = {boss.name.lower(), room.name.rsplit(".", 1)[0].lower(), str(boss.ccn), str(boss.churn)}
    words |= {part for part in boss.name.lower().replace(".", "_").split("_") if len(part) > 3}
    return sorted(w for w in words if w)


def _lines(raw: str, facts: list[str]) -> _Answer | None:
    try:
        answer = _Answer.model_validate_json(raw)
    except ValidationError:
        return None
    title = clean(answer.title, 40)
    taunts = [t for t in (clean(t, 120) for t in answer.taunts) if 3 <= len(t.split()) <= 18 and not _JUNK.search(t)]
    # Small models drift into generic fortune-cookie lines. Keep only lines
    # that talk about this function; the code-based templates beat the rest.
    taunts = [t for t in taunts if any(f in t.lower() for f in facts)]
    if not title.lower().startswith("the ") or _JUNK.search(title) or not taunts:
        return None
    return _Answer(title=title, taunts=taunts)


def flavor_boss(
    spec: DungeonSpec,
    floor: Floor,
    model: str,
    cache_dir: Path,
    host: str = "http://127.0.0.1:11434",
    timeout: float = 120,
) -> Boss:
    boss = floor.boss
    prompt = _prompt(spec, floor, boss)
    key = hashlib.sha256(f"{model}\n{prompt}".encode()).hexdigest()[:24]
    cached = cache_dir / f"{key}.json"
    facts = _facts(floor, boss)
    answer = _lines(cached.read_text("utf-8"), facts) if cached.is_file() else None
    if answer is None:
        system = "You write short in-character lines for bosses in a roguelike. Answer only with the JSON asked for."
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "format": SCHEMA,
            "stream": False,
            "think": False,
            "options": {"temperature": 0.7, "seed": int(spec.seed[:8], 16)},
        }
        try:
            reply = _ask(host, payload, timeout).get("message") or {}
            answer = _lines(str(reply.get("content", "")), facts)
        except (OSError, ValueError) as exc:
            print(f"headcrawl: no flavor for {boss.name}: {exc}", file=sys.stderr)
            return boss
        if answer is None:
            return boss
        cache_dir.mkdir(parents=True, exist_ok=True)
        cached.write_text(answer.model_dump_json(), encoding="utf-8")
    taunts = [*answer.taunts[:3], *boss.taunts][:6]
    return boss.model_copy(update={"title": answer.title, "taunts": taunts})


def add_flavor(spec: DungeonSpec, model: str, cache_dir: Path, host: str = "http://127.0.0.1:11434") -> DungeonSpec:
    if urlparse(host).hostname not in LOCAL_HOSTS:
        raise ValueError("flavor only talks to a model on this machine")
    floors = [f.model_copy(update={"boss": flavor_boss(spec, f, model, cache_dir, host)}) for f in spec.floors]
    return DungeonSpec.model_validate({**spec.model_dump(), "floors": [f.model_dump() for f in floors]})
