"""Boss titles and taunts from a local Ollama model. Entirely optional.

The model only ever sees text and only ever returns text that goes through
the same cleaning as everything else. Any failure (no Ollama, slow model, bad
JSON, a model that ignores the prompt) leaves the template lines in place.
Answers are cached by a hash of what was asked, so rebuilding a dungeon is
free and stays the same.

What made small models behave, tried on qwen2.5 7b and gemma4 8b:
- Two worked examples as earlier chat turns. Instructions alone got generic
  fortune-cookie lines; with examples nearly every answer used the facts.
- The facts as a short key: value block, nothing else in the user turn.
- JSON schema in `format`, thinking off.
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
DEFAULT_MODEL = "qwen2.5:7b"
PROMPT_VERSION = 2


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

SYSTEM = (
    "You write boss taunts for a roguelike where the dungeon is a code repository. Each boss is a real "
    "function. Lines are dry and a bit funny, like a tired senior engineer. Every taunt must name the "
    "function, the file, or one of the numbers. No emojis, no exclamation marks. Reply with JSON only."
)

EXAMPLES: list[tuple[str, dict[str, Any]]] = [
    (
        "function: parse_args\nsignature: parse_args(argv, env, defaults, strict)\nfile: cli/args.py\n"
        "branches: 23\nrecent commits touching the file: 41\nfinal boss: no",
        {
            "title": "the Flag Hoarder",
            "taunts": [
                "parse_args has 23 ways to say no. Pick one.",
                "Forty-one commits and args.py still won't let go of me.",
                "Four parameters in, and you still forgot the --strict.",
            ],
        },
    ),
    (
        "function: render\nsignature: render(ctx)\nfile: src/view/page.ts\nbranches: 9\n"
        "recent commits touching the file: 3\nfinal boss: yes",
        {
            "title": "the Last Repaint",
            "taunts": [
                "Every frame in page.ts goes through render. So do you.",
                "Nine branches, and every one of them ends with you on the floor.",
            ],
        },
    ),
]


def _facts_block(floor: Floor, boss: Boss) -> str:
    room = next(r for r in floor.rooms if r.id == floor.lair)
    todo = next((loot.text for r in floor.rooms for loot in r.loot if loot.text), "")
    lines = [
        f"function: {boss.name}",
        f"signature: {boss.signature}",
        f"file: {room.path}",
        f"branches: {boss.ccn}",
        f"recent commits touching the file: {boss.churn}",
        f"final boss: {'yes' if boss.final else 'no'}",
    ]
    if todo:
        lines.append(f"a comment on this floor: {todo}")
    return "\n".join(lines)


def _messages(floor: Floor, boss: Boss) -> list[dict[str, str]]:
    msgs = [{"role": "system", "content": SYSTEM}]
    for facts, answer in EXAMPLES:
        msgs.append({"role": "user", "content": facts})
        msgs.append({"role": "assistant", "content": json.dumps(answer)})
    msgs.append({"role": "user", "content": _facts_block(floor, boss)})
    return msgs


def _ask(host: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    req = urllib.request.Request(  # noqa: S310 - host is checked to be local before this runs
        f"{host}/api/chat",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310
        data: dict[str, Any] = json.loads(res.read(1_000_000))
        return data


def _payload(model: str, messages: list[dict[str, str]], seed: int, fmt: Any = SCHEMA) -> dict[str, Any]:
    return {
        "model": model,
        "messages": messages,
        "format": fmt,
        "stream": False,
        "think": False,
        "options": {"temperature": 0.7, "seed": seed},
    }


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


def model_follows_prompts(model: str, host: str, timeout: float = 120) -> bool:
    """A tiny canary. Some model and Ollama version pairs ship a broken chat
    template and answer every prompt with noise. Better to find out once."""
    word = "lantern"
    payload = _payload(
        model,
        [{"role": "user", "content": f'Reply with JSON {{"echo": "{word}"}} and nothing else.'}],
        seed=1,
        fmt={"type": "object", "properties": {"echo": {"type": "string"}}, "required": ["echo"]},
    )
    try:
        reply = _ask(host, payload, timeout).get("message") or {}
        return word in str(json.loads(str(reply.get("content", "{}"))).get("echo", "")).lower()
    except (OSError, ValueError):
        return False


def flavor_boss(
    spec: DungeonSpec,
    floor: Floor,
    model: str,
    cache_dir: Path,
    host: str = "http://127.0.0.1:11434",
    timeout: float = 180,
) -> Boss:
    boss = floor.boss
    messages = _messages(floor, boss)
    key = hashlib.sha256(f"v{PROMPT_VERSION}\n{model}\n{json.dumps(messages)}".encode()).hexdigest()[:24]
    cached = cache_dir / f"{key}.json"
    facts = _facts(floor, boss)
    answer = _lines(cached.read_text("utf-8"), facts) if cached.is_file() else None
    if answer is None:
        base_seed = int(spec.seed[:8], 16)
        # A second try with another seed rescues most of the rejects.
        for attempt in range(2):
            try:
                reply = _ask(host, _payload(model, messages, base_seed + attempt), timeout).get("message") or {}
            except (OSError, ValueError) as exc:
                print(f"headcrawl: no flavor for {boss.name}: {exc}", file=sys.stderr)
                return boss
            answer = _lines(str(reply.get("content", "")), facts)
            if answer:
                break
        if answer is None:
            return boss
        cache_dir.mkdir(parents=True, exist_ok=True)
        cached.write_text(answer.model_dump_json(), encoding="utf-8")
    taunts = [*answer.taunts[:3], *boss.taunts][:6]
    return boss.model_copy(update={"title": answer.title, "taunts": taunts})


def add_flavor(
    spec: DungeonSpec, model: str, cache_dir: Path, host: str = "http://127.0.0.1:11434", check: bool = True
) -> DungeonSpec:
    if urlparse(host).hostname not in LOCAL_HOSTS:
        raise ValueError("flavor only talks to a model on this machine")
    if check and not model_follows_prompts(model, host):
        print(
            f"headcrawl: {model} did not follow a simple prompt, so no flavor text this time. "
            f"Try `ollama pull {DEFAULT_MODEL}`, or update Ollama if the model is newer than it.",
            file=sys.stderr,
        )
        return spec
    floors = [f.model_copy(update={"boss": flavor_boss(spec, f, model, cache_dir, host)}) for f in spec.floors]
    return DungeonSpec.model_validate({**spec.model_dump(), "floors": [f.model_dump() for f in floors]})
