"""Dead code, import cycles, dependencies, blame authors and boss history."""

import json
from pathlib import Path

from headcrawl.build import analyze
from headcrawl.deps import dependencies
from headcrawl.graph import cycle_members
from headcrawl.models import Archetype, Ecosystem
from headcrawl.web import _blame, choose

from .conftest import MakeRepo, write_files


def test_cycles_group_files_on_one_loop() -> None:
    two = cycle_members({("a", "b"), ("b", "a"), ("b", "c"), ("c", "d"), ("d", "c")})
    assert two["a"] == two["b"] != two["c"] == two["d"]
    assert set(cycle_members({("a", "b"), ("b", "c"), ("c", "a"), ("c", "d")})) == {"a", "b", "c"}
    assert cycle_members({("a", "b"), ("b", "c")}) == {}
    # Long chains must not hit the recursion limit.
    chain = {(f"n{i}", f"n{i + 1}") for i in range(5000)} | {("n5000", "n0")}
    assert len(cycle_members(chain)) == 5001


def test_dependencies_from_every_manifest(tmp_path: Path) -> None:
    write_files(
        tmp_path,
        {
            "package.json": json.dumps({"dependencies": {"express": "^4", "lodash": "*"}}),
            "pyproject.toml": '[project]\ndependencies = ["requests>=2", "click"]\n'
            "[tool.poetry.dependencies]\npython = '^3.12'\nrich = '*'\n",
            "requirements.txt": "# pinned\nRequests==2.0\n-e .\nflask[async]>=3\n",
            "go.mod": "module x\n\nrequire (\n\tgithub.com/spf13/cobra v1.8.0\n"
            "\tgolang.org/x/sys v0.1.0 // indirect\n)\n",
            "Cargo.toml": '[dependencies]\nserde = "1"\n',
            "Gemfile": "source 'https://rubygems.org'\ngem 'rails', '~> 7'\n",
            "composer.json": json.dumps({"require": {"php": ">=8", "ext-json": "*", "slim/slim": "^4"}}),
        },
    )
    deps = dependencies(tmp_path)
    names = [d.name for d in deps]
    assert names[:2] == ["express", "lodash"]
    # Same package from two Python files counts once, whatever the case.
    assert names.count("requests") + names.count("Requests") == 1
    for want in ["click", "rich", "flask", "github.com/spf13/cobra", "serde", "rails", "slim/slim"]:
        assert want in names
    assert "golang.org/x/sys" not in names
    assert "php" not in names and "python" not in names
    assert {d.ecosystem for d in deps} == set(Ecosystem)


def test_broken_manifests_are_skipped(tmp_path: Path) -> None:
    write_files(tmp_path, {"package.json": "{nope", "Cargo.toml": "[[[", "pyproject.toml": "x = "})
    assert dependencies(tmp_path) == []
    write_files(tmp_path, {"package.json": json.dumps({"dependencies": {f"p{i}": "1" for i in range(99)}})})
    assert len(dependencies(tmp_path)) == 40


def test_dead_functions_become_ghosts_and_cycles_become_loops(make_repo: MakeRepo) -> None:
    root = make_repo(
        {
            # used_thing is the busiest function, so it is the boss, not an enemy.
            "pkg/a.py": "from pkg import b\n\ndef used_thing(x):\n    for i in x:\n        if i:\n"
            "            while i:\n                if i > 2:\n                    return b.other(i)\n    return 0\n\n"
            "def forgotten_helper(y):\n    if y:\n        return 1\n    return 2\n",
            "pkg/b.py": "from pkg import a\n\ndef other(x):\n    return a.used_thing(x)\n",
            "tests/test_a.py": "from pkg.a import used_thing\n\ndef test_it():\n    assert used_thing(1)\n",
            "requirements.txt": "requests\n",
        }
    )
    spec = analyze(root)
    enemies = {e.name: e for f in spec.floors for r in f.rooms for e in r.enemies}
    assert enemies["forgotten_helper"].archetype is Archetype.GHOST
    assert enemies.get("other") is None or enemies["other"].archetype is not Archetype.GHOST
    loops = [e for f in spec.floors for e in f.edges if e.loop]
    assert loops and all(e.kind == "import" for e in loops)
    assert [d.name for d in spec.repo.dependencies] == ["requests"]


def test_blame_authors_and_boss_history(make_repo: MakeRepo) -> None:
    old = "def boss(a):\n    if a:\n        return 1\n    return 2\n"
    new = (
        "def boss(a, b):\n    # TODO: split this up\n    if a:\n        return 1\n    elif b:\n        return 2\n"
        "    for x in a:\n        if x:\n            return 3\n    return 4\n"
    )
    root = make_repo({"src/boss.py": old}, {"src/boss.py": new}, {"src/boss.py": new + "\n"}, years=[2019, 2022, 2023])
    spec = analyze(root)
    floor = spec.floors[-1]
    loot = [item for r in floor.rooms for item in r.loot]
    assert loot and loot[0].author == "t"
    past = floor.boss.past
    assert past is not None and past.year == 2022 and past.ccn >= 4


def test_no_history_means_no_past(make_repo: MakeRepo) -> None:
    root = make_repo({"src/boss.py": "def boss(a):\n    if a:\n        return 1\n    return 2\n"}, git=False)
    assert analyze(root).floors[-1].boss.past is None


def test_browser_blame_and_manifests() -> None:
    years, authors = _blame(
        json.dumps({"a.py": {"3": 2020, "4": {"year": 2021, "author": "Ada"}, "5": {"year": 1}, "x": 2020}, "b": []})
    )
    assert years == {"a.py": {3: 2020, 4: 2021}}
    assert authors == {"a.py": {4: "Ada"}}
    tree = [{"path": "package.json", "size": 300}, {"path": "src/x.js", "size": 10}, {"path": "a/go.mod", "size": 5}]
    picked = json.loads(choose(json.dumps(tree)))
    assert picked == ["package.json", "src/x.js"]


def test_local_folder_without_git(tmp_path: Path) -> None:
    from headcrawl.web import local_dungeon

    write_files(tmp_path, {"src/a.py": "def a(x):\n    if x:\n        return 1\n    return 2\n"})
    spec = json.loads(local_dungeon(str(tmp_path), "my folder"))
    assert spec["repo"]["name"] == "my folder"
    assert len(spec["seed"]) == 40


def test_deeply_nested_manifest_does_not_sink_the_build(tmp_path: Path) -> None:
    write_files(tmp_path, {"package.json": "[" * 100_000, "Cargo.toml": '[dependencies]\nserde = "1"\n'})
    assert [d.name for d in dependencies(tmp_path)] == ["serde"]


def test_decorated_and_partial_builds_have_no_false_ghosts(tmp_path: Path) -> None:
    write_files(
        tmp_path,
        {
            "app/routes.py": "@app.get('/x')\ndef serve_index(req):\n    if req:\n        return 1\n    return 2\n\n"
            "def lonely_helper(q):\n    if q:\n        return 3\n    return 4\n",
        },
    )
    ghosts = {
        e.name for f in analyze(tmp_path).floors for r in f.rooms for e in r.enemies if e.archetype is Archetype.GHOST
    }
    assert "serve_index" not in ghosts
    partial = analyze(tmp_path, complete=False)
    assert not [e for f in partial.floors for r in f.rooms for e in r.enemies if e.archetype is Archetype.GHOST]
