import copy
from typing import Any

import pytest
from pydantic import ValidationError

from headcrawl.models import DungeonSpec

SHA = "a" * 40


def _room(rid: str, wing: str = "w0") -> dict[str, Any]:
    return {
        "id": rid,
        "path": f"{rid}.py",
        "name": f"{rid}.py",
        "language": "python",
        "wing": wing,
        "kind": "hall",
        "loc": 10,
        "size": 1,
        "functions": 0,
        "churn": 0,
        "heat": 0.5,
        "enemies": [],
        "loot": [],
    }


def _spec() -> dict[str, Any]:
    return {
        "generator": "test",
        "seed": SHA,
        "repo": {"name": "r", "head": SHA, "committed_at": 0, "commits_scanned": 0, "languages": []},
        "totals": {"files": 2, "rooms": 2, "functions": 0, "enemies": 1, "loot": 0, "loc": 20, "skipped": 0},
        "floors": [
            {
                "id": "f0",
                "index": 0,
                "name": "src",
                "path": "src",
                "wings": [{"id": "w0", "path": ".", "name": "src"}],
                "rooms": [_room("r0"), _room("r1")],
                "edges": [{"a": "r0", "b": "r1", "kind": "import", "weight": 1}],
                "entry": "r0",
                "lair": "r1",
                "boss": {
                    "id": "b0",
                    "name": "f",
                    "title": "t",
                    "signature": "f()",
                    "line": 1,
                    "hp": 30,
                    "damage": 3,
                    "speed": 100,
                    "xp": 10,
                    "ccn": 1,
                    "churn": 0,
                    "taunts": ["hi"],
                    "final": True,
                },
            }
        ],
    }


def test_valid_spec() -> None:
    DungeonSpec.model_validate(_spec())


@pytest.mark.parametrize(
    "breaker",
    [
        lambda s: s["floors"][0].update(edges=[]),
        lambda s: s["floors"][0].update(entry="r9"),
        lambda s: s["floors"][0]["rooms"][1].update(id="r0"),
        lambda s: s["floors"][0]["rooms"][0].update(wing="w7"),
        lambda s: s["floors"][0]["edges"][0].update(b="r0"),
        lambda s: s["floors"][0]["boss"].update(final=False),
        lambda s: s["floors"][0]["boss"].update(hp=0),
        lambda s: s["floors"][0].update(index=1),
        lambda s: s.update(seed="not-a-sha"),
        lambda s: s.update(extra_field=1),
        lambda s: s["floors"][0]["rooms"][0].update(id="R0; drop"),
    ],
)
def test_invalid_specs_are_rejected(breaker: Any) -> None:
    spec = copy.deepcopy(_spec())
    breaker(spec)
    with pytest.raises(ValidationError):
        DungeonSpec.model_validate(spec)
