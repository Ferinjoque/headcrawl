import json
from pathlib import Path

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from headcrawl import stats
from headcrawl.build import AnalysisError, analyze
from headcrawl.cli import main
from headcrawl.limits import Limits
from headcrawl.metrics import FunctionMetric
from headcrawl.models import Archetype, DungeonSpec, RoomKind

from .conftest import SAMPLE, MakeRepo, write_files


def _all_rooms(spec: DungeonSpec):  # type: ignore[no-untyped-def]
    return [r for f in spec.floors for r in f.rooms]


def test_sample_repo(make_repo: MakeRepo) -> None:
    root = make_repo(SAMPLE, {"app/main.py": SAMPLE["app/main.py"] + "\n# more\n"})
    spec = analyze(root, name="sample")

    assert spec.seed == spec.repo.head
    assert spec.repo.name == "sample" and spec.repo.branch == "main"
    assert spec.floors[-1].boss.final and not any(f.boss.final for f in spec.floors[:-1])
    assert sum(len(f.rooms) for f in spec.floors) == 7

    rooms = {r.path: r for r in _all_rooms(spec)}
    assert set(rooms) == {
        "app/main.py",
        "app/util.py",
        "app/core/engine.py",
        "web/index.js",
        "web/api.js",
        "web/lib/x.js",
        "tests/test_main.py",
    }
    assert rooms["app/main.py"].blurb == "Entry point for the sample app."
    assert rooms["app/main.py"].churn == 2

    loot = {item.tag: item for r in rooms.values() for item in r.loot}
    assert set(loot) == {"TODO", "FIXME", "HACK"}
    assert loot["TODO"].text == "handle errors here"

    names = {e.name for r in rooms.values() for e in r.enemies} | {f.boss.name for f in spec.floors}
    assert {"run", "helper", "start", "boot", "y"} <= names

    run_fn = (
        next(f.boss for f in spec.floors if f.boss.name == "run")
        if any(f.boss.name == "run" for f in spec.floors)
        else next(e for r in rooms.values() for e in r.enemies if e.name == "run")
    )
    assert run_fn.ccn >= 5

    for f in spec.floors:
        assert f.boss.code, f.boss.name
        assert f.boss.name.split(".")[-1].split("::")[-1] in f.boss.code[0] or f.boss.code[0].startswith(("def", "function", "fn"))


def test_same_repo_same_dungeon(make_repo: MakeRepo) -> None:
    root = make_repo(SAMPLE)
    assert analyze(root).model_dump_json() == analyze(root).model_dump_json()


def test_not_a_git_repo_still_works(make_repo: MakeRepo) -> None:
    root = make_repo(SAMPLE, git=False)
    spec = analyze(root)
    assert spec.repo.committed_at == 0 and len(spec.seed) == 40
    assert all(r.churn == 0 for r in _all_rooms(spec))


def test_empty_repo_fails_cleanly(make_repo: MakeRepo) -> None:
    root = make_repo({"README.md": "hi\n"})
    with pytest.raises(AnalysisError):
        analyze(root)


def test_caps_are_respected(make_repo: MakeRepo) -> None:
    files = {f"d{i}/m{j}.py": f"def f{j}(a):\n    return a\n" * 1 for i in range(12) for j in range(6)}
    big = {"big.py": "".join(f"def g{k}(x):\n    if x:\n        return {k}\n    return 0\n\n" for k in range(30))}
    root = make_repo(files | big)
    limits = Limits(max_floors=4, max_rooms_per_floor=5, max_enemies_per_room=3)
    spec = analyze(root, limits=limits)
    assert len(spec.floors) <= 4
    for f in spec.floors:
        assert len(f.rooms) <= 5
        assert all(len(r.enemies) <= 3 for r in f.rooms)
    assert spec.totals.skipped > 0


def test_hostile_names_are_cleaned(make_repo: MakeRepo) -> None:
    evil = "x\u202e\x1b[31m<img src=x onerror=alert(1)>"
    src = f"def f():\n    # TODO: {evil}{'A' * 400}\n    return 1\n"
    root = make_repo({"pkg/a.py": src, "pkg/b.py": "x = 1\n", "pkg/c.py": "y = 1\n"})
    spec = analyze(root)
    (item,) = [i for r in _all_rooms(spec) for i in r.loot]
    assert "\x1b" not in item.text and "\u202e" not in item.text
    assert len(item.text) <= 120


source_body = st.lists(
    st.tuples(st.integers(0, 5), st.integers(0, 4), st.sampled_from(["", "# TODO: x", "# HACK"])),
    min_size=0,
    max_size=5,
)


def _python_source(funcs: list[tuple[int, int, str]]) -> str:
    out = []
    for i, (params, depth, tag) in enumerate(funcs):
        args = ", ".join(f"a{k}" for k in range(params))
        out.append(f"def fn{i}({args}):")
        if tag:
            out.append(f"    {tag}")
        indent = "    "
        for d in range(depth):
            out.append(f"{indent}if a{d % max(params, 1)} if {params} else True:")
            indent += "    "
        out.append(f"{indent}return {i}")
        out.append("")
    return "\n".join(out) or "x = 1\n"


@settings(max_examples=15, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    st.dictionaries(
        st.from_regex(r"(src|lib|tests|cli)(/[a-c]){0,2}/[a-e]{1,3}", fullmatch=True),
        source_body,
        min_size=1,
        max_size=25,
    )
)
def test_random_repos_make_valid_dungeons(make_repo: MakeRepo, files: dict[str, list]) -> None:  # type: ignore[type-arg]
    root = make_repo({f"{p}.py": _python_source(body) for p, body in files.items()}, git=False)
    spec = analyze(root)
    again = DungeonSpec.model_validate_json(spec.model_dump_json())
    assert again == spec
    assert spec.model_dump_json() == analyze(root).model_dump_json()
    for floor in spec.floors:
        assert floor.boss.hp > 0
        for room in floor.rooms:
            assert all(e.hp > 0 and e.damage > 0 and e.speed > 0 for e in room.enemies)
            if room.kind is RoomKind.SHRINE:
                assert room.enemies == []


def _fn(**kw: int) -> FunctionMetric:
    base = dict(ccn=1, nloc=3, params=0, nesting=0, start_line=1, end_line=3)
    base.update(kw)
    return FunctionMetric(name="f", long_name="f()", **base)


@pytest.mark.parametrize(
    ("kw", "arch"),
    [
        ({"ccn": 20}, Archetype.TANGLE),
        ({"nesting": 5, "ccn": 6}, Archetype.NEST),
        ({"params": 7, "ccn": 4}, Archetype.HYDRA),
        ({"nloc": 120, "ccn": 5}, Archetype.WALL),
        ({}, Archetype.IMP),
        ({"ccn": 6, "nloc": 20}, Archetype.BUG),
    ],
)
def test_archetypes(kw: dict[str, int], arch: Archetype) -> None:
    assert stats.archetype(_fn(**kw)) is arch


@given(st.integers(1, 10_000), st.integers(0, 50), st.integers(0, 40), st.integers(0, 5000))
def test_stat_curves_stay_in_range(ccn: int, nesting: int, params: int, nloc: int) -> None:
    f = _fn(ccn=ccn, nesting=nesting, params=params, nloc=nloc)
    assert 4 <= stats.enemy_hp(f) <= 80
    assert 1 <= stats.enemy_damage(f) <= 9
    assert 60 <= stats.enemy_speed(f) <= 160
    for depth in (0, 3, 7):
        hp, dmg, speed, xp = stats.boss_stats(f, nloc, depth, final=depth == 7)
        assert hp >= 20 and dmg >= 2 and 70 <= speed <= 180 and xp >= 10


def test_room_size_and_titles() -> None:
    assert [stats.room_size(n) for n in (0, 10, 40, 200, 900, 50_000)] == [1, 1, 1, 4, 5, 5]
    assert stats.boss_title(0, False) == "the Untouched"
    assert stats.boss_title(25, False) == "the Often Rewritten"
    assert stats.boss_title(0, True) == "Keeper of HEAD"


def test_cli_analyze_and_schema(make_repo: MakeRepo, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = make_repo(SAMPLE)
    out = tmp_path / "out" / "d.json"
    assert main(["analyze", str(root), "-o", str(out), "--compact"]) == 0
    spec = DungeonSpec.model_validate_json(out.read_text())
    assert spec.totals.rooms > 0
    assert "floors" in capsys.readouterr().err

    schema_out = tmp_path / "schema.json"
    assert main(["schema", "-o", str(schema_out)]) == 0
    schema = json.loads(schema_out.read_text())
    assert schema["title"] == "DungeonSpec" and "Floor" in schema["$defs"]


def test_cli_reports_errors(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    write_files(tmp_path / "empty", {"a.txt": "x"})
    assert main(["analyze", str(tmp_path / "empty")]) == 1
    assert main(["analyze", "file:///etc/passwd"]) == 1
    assert "headcrawl:" in capsys.readouterr().err


def test_local_vs_remote_targets(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from headcrawl.cli import is_local

    (tmp_path / "owner" / "repo").mkdir(parents=True)
    monkeypatch.chdir(tmp_path)
    assert not is_local("owner/repo")
    assert is_local("./owner/repo")
    assert is_local(str(tmp_path))
    assert not is_local("missing/dir/here")


def test_invisible_names_and_empty_history(make_repo: MakeRepo, tmp_path: Path) -> None:
    root = make_repo({"​/a.py": "def f():\n    return 1\n", "b/b.py": "x = 1\n", "b/c.py": "y = 2\n"}, git=False)
    spec = analyze(root)
    assert all(w.name for f in spec.floors for w in f.wings)
    import subprocess

    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)
    assert analyze(root).repo.committed_at == 0


def test_subfolder_keeps_churn(make_repo: MakeRepo) -> None:
    root = make_repo({"pkg/a.py": "x = 1\n", "pkg/b.py": "y = 1\n", "pkg/c.py": "z = 1\n"}, {"pkg/a.py": "x = 2\n"})
    spec = analyze(root / "pkg")
    churn = {r.path: r.churn for f in spec.floors for r in f.rooms}
    assert churn["a.py"] == 2


def test_cli_validate(make_repo: MakeRepo, tmp_path: Path) -> None:
    out = tmp_path / "d.json"
    assert main(["analyze", str(make_repo(SAMPLE)), "-o", str(out)]) == 0
    assert main(["validate", str(out)]) == 0
    bad = tmp_path / "bad.json"
    bad.write_text('{"floors": []}', encoding="utf-8")
    assert main(["validate", str(bad)]) == 1
    assert main(["validate", str(tmp_path / "missing.json")]) == 1


def test_old_todos_and_last_commit(make_repo: MakeRepo) -> None:
    first = {
        "pkg/a.py": "def f(x):\n    # TODO: ancient wisdom\n    if x:\n        return 1\n    return 2\n",
        "pkg/b.py": "y = 1\n",
        "pkg/c.py": "z = 1\n",
    }
    later = {"pkg/a.py": first["pkg/a.py"] + "\n# TODO: fresh idea\n", "pkg/b.py": "y = 2\n"}
    root = make_repo(first, later, years=[2018, 2024])
    spec = analyze(root)
    loot = {item.text: item for f in spec.floors for r in f.rooms for item in r.loot}
    assert loot["ancient wisdom"].year == 2018
    assert loot["fresh idea"].year == 2024
    assert loot["ancient wisdom"].power > loot["fresh idea"].power
    lair = next(r for f in spec.floors for r in f.rooms if r.id == f.lair)
    assert lair.last_commit and lair.last_commit.startswith("c")
    assert all(r.last_commit is None for f in spec.floors for r in f.rooms if r.id != f.lair)


def test_web_entry_points(make_repo: MakeRepo) -> None:
    import json as _json

    from headcrawl import web

    tree = [
        {"path": "app/main.py", "size": 500},
        {"path": "node_modules/x/index.js", "size": 10},
        {"path": "README.md", "size": 10},
        {"path": "big.py", "size": 10_000_000},
    ]
    assert _json.loads(web.choose(_json.dumps(tree))) == ["app/main.py"]
    root = make_repo(SAMPLE, git=False)
    out = _json.loads(web.dungeon(str(root), "o/r", "https://github.com/o/r", "f" * 40, "2024-05-01T10:00:00Z"))
    assert out["seed"] == "f" * 40 and out["repo"]["committed_at"] > 0


def test_web_history_moves_the_boss(make_repo: MakeRepo) -> None:
    import json as _json

    from headcrawl import web

    files = {
        "pkg/a.py": "def a(x):\n    if x:\n        return 1\n    return 2\n",
        "pkg/b.py": "def b(x):\n    if x:\n        return 1\n    return 2\n",
        "pkg/c.py": "y = 1\n",
    }
    root = make_repo(files, git=False)
    plain = _json.loads(web.dungeon(str(root), "o/r", "", "f" * 40, ""))
    picks = _json.loads(web.candidates(_json.dumps(plain)))
    assert set(picks) <= {"pkg/a.py", "pkg/b.py", "pkg/c.py"} and len(picks) == 2
    lair_path = lambda s: next(r["path"] for f in s["floors"] for r in f["rooms"] if r["id"] == f["lair"])  # noqa: E731
    other = "pkg/b.py" if lair_path(plain) == "pkg/a.py" else "pkg/a.py"
    hot = _json.loads(web.dungeon(str(root), "o/r", "", "f" * 40, "", _json.dumps({other: 40, "x/../y": 999})))
    assert lair_path(hot) == other
    assert hot["repo"]["commits_scanned"] == 100
    boss = hot["floors"][-1]["boss"]
    assert boss["churn"] == 40


def test_web_blame_and_subjects_from_outside(make_repo: MakeRepo) -> None:
    import json as _json

    from headcrawl import web

    files = {
        "pkg/a.py": "def a(x):\n    # TODO: old idea\n    if x:\n        return 1\n    return 2\n",
        "pkg/b.py": "y = 1\n",
        "pkg/c.py": "z = 1\n",
    }
    root = make_repo(files, git=False)
    plain = _json.loads(web.dungeon(str(root), "o/r", "", "f" * 40, "2026-01-01T00:00:00Z"))
    lines = _json.loads(web.loot_lines(_json.dumps(plain)))
    assert lines == {"pkg/a.py": [2]}
    blame = _json.dumps({"pkg/a.py": {"2": 2015, "x": 1999, "3": "nope"}, "bad": [1]})
    subjects = _json.dumps({"pkg/a.py": "fix the thing\nwith details", "pkg/b.py": 5})
    out = _json.loads(web.dungeon(str(root), "o/r", "", "f" * 40, "2026-01-01T00:00:00Z", "{}", blame, subjects))
    loot = [item for f in out["floors"] for r in f["rooms"] for item in r["loot"]]
    assert loot[0]["year"] == 2015 and not loot[0].get("year_or_older")
    old_power = [item for f in plain["floors"] for r in f["rooms"] for item in r["loot"]][0]["power"]
    assert loot[0]["power"] == old_power  # years are text only without a checkout
    lair = next(r for f in out["floors"] for r in f["rooms"] if r["id"] == f["lair"])
    if lair["path"] == "pkg/a.py":
        assert lair["last_commit"] == "fix the thing"
