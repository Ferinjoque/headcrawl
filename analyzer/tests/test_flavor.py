import json
from pathlib import Path
from typing import Any

import pytest

from headcrawl import flavor
from headcrawl.build import analyze

from .conftest import SAMPLE, MakeRepo


def _spec(make_repo: MakeRepo):  # type: ignore[no-untyped-def]
    return analyze(make_repo(SAMPLE))


def _reply(answer: dict[str, Any]) -> dict[str, Any]:
    return {"message": {"content": json.dumps(answer)}}


def test_flavor_uses_the_model_and_caches(make_repo: MakeRepo, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    spec = _spec(make_repo)
    calls: list[dict[str, Any]] = []

    def fake(host: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
        calls.append(payload)
        name = spec.floors[len(calls) - 1].boss.name
        taunts = [f"{name} has outlived three rewrites.", "\x1b[31mred alert now please", "Life is code, friend."]
        return _reply({"title": "the Unkillable‮", "taunts": taunts})

    monkeypatch.setattr(flavor, "_ask", fake)
    out = flavor.add_flavor(spec, "test-model", tmp_path)
    boss = out.floors[-1].boss
    assert boss.title == "the Unkillable"
    assert boss.taunts[0].endswith("has outlived three rewrites.")
    assert not any("Life is code" in t for t in boss.taunts)
    assert "\x1b" not in "".join(boss.taunts)
    assert len(calls) == len(spec.floors)
    assert calls[0]["format"]["required"] == ["title", "taunts"]

    again = flavor.add_flavor(spec, "test-model", tmp_path)
    assert again == out
    assert len(calls) == len(spec.floors)


def test_flavor_falls_back_on_any_failure(make_repo: MakeRepo, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    spec = _spec(make_repo)

    def down(host: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
        raise OSError("connection refused")

    monkeypatch.setattr(flavor, "_ask", down)
    assert flavor.add_flavor(spec, "m", tmp_path) == spec

    monkeypatch.setattr(flavor, "_ask", lambda *a: {"message": {"content": "not json at all"}})
    assert flavor.add_flavor(spec, "m", tmp_path) == spec

    junk = {"title": "​​​", "taunts": ["x"]}
    monkeypatch.setattr(flavor, "_ask", lambda *a: _reply(junk))
    assert flavor.add_flavor(spec, "m", tmp_path) == spec

    generic = {"title": "the Wise", "taunts": ["Debugging is an art form, not a science."]}
    monkeypatch.setattr(flavor, "_ask", lambda *a: _reply(generic))
    assert flavor.add_flavor(spec, "m", tmp_path) == spec

    placeholder = {"title": "the Sample Title", "taunts": ["Sample taunt 1 for run here"]}
    monkeypatch.setattr(flavor, "_ask", lambda *a: _reply(placeholder))
    assert flavor.add_flavor(spec, "m", tmp_path) == spec


def test_flavor_refuses_remote_hosts(make_repo: MakeRepo, tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        flavor.add_flavor(_spec(make_repo), "m", tmp_path, host="https://api.example.com")
