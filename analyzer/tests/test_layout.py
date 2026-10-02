"""floors and corridors, mostly as properties."""

from hypothesis import given, settings
from hypothesis import strategies as st

from headcrawl.floors import ROOT, group_floors, order_floors, wing_of
from headcrawl.graph import corridors
from headcrawl.models import _connected

segment = st.sampled_from(["src", "lib", "core", "api", "ui", "util", "tests", "cmd", "pkg", "x"])
paths_st = st.lists(
    st.builds(
        lambda dirs, name: "/".join([*dirs, f"{name}.py"]),
        st.lists(segment, max_size=3),
        st.text("abcdefgh", min_size=1, max_size=4),
    ),
    min_size=1,
    max_size=60,
    unique=True,
)


@given(paths_st, st.integers(1, 8), st.integers(2, 20))
def test_floors_cover_every_file_once(paths: list[str], max_floors: int, max_rooms: int) -> None:
    groups = group_floors(paths, max_floors, max_rooms)
    seen = [p for g in groups for p in g.paths]
    assert sorted(seen) == sorted(paths)
    assert 1 <= len(groups) <= max_floors
    assert len({g.name for g in groups}) == len(groups)
    if len(groups) > 1:
        assert min(len(g.paths) for g in groups) >= 3


@given(paths_st)
def test_floors_are_deterministic(paths: list[str]) -> None:
    a = group_floors(paths, 8, 18)
    b = group_floors(list(reversed(paths)), 8, 18)
    assert a == b


def test_floor_split_and_order() -> None:
    paths = (
        [f"src/core/m{i}.py" for i in range(10)]
        + [f"src/api/h{i}.py" for i in range(5)]
        + [f"tests/t{i}.py" for i in range(4)]
    )
    groups = group_floors(paths, 8, 18)
    assert [g.name for g in groups] == ["api", "core", "tests"]
    assert [g.name for g in group_floors(paths, 2, 18)] == ["api + core", "tests"]
    edges = {("src/api/h0.py", "src/core/m0.py"), ("src/api/h1.py", "src/core/m1.py"), ("tests/t0.py", "src/api/h0.py")}
    assert [g.name for g in order_floors(groups, edges)] == ["tests", "api", "core"]


def test_side_dirs_share_a_floor() -> None:
    paths = [f"lib/m{i}.py" for i in range(4)] + [f"examples/e{i}/main.py" for i in range(9)]
    paths += [f"scripts/s{i}.py" for i in range(3)]
    groups = group_floors(paths, 8, 18)
    assert sorted(g.name for g in groups) == ["examples", "lib"]
    assert len(next(g for g in groups if g.name == "examples").paths) == 12


def test_merged_names_stay_short() -> None:
    paths = [f"d{i}/f{j}.py" for i in range(12) for j in range(3)]
    for g in group_floors(paths, 3, 18):
        assert len(g.name) <= 40


def test_root_files_get_their_own_floor() -> None:
    paths = ["a.py", "b.py", "c.py", "lib/x.py", "lib/y.py", "lib/z.py"]
    assert {g.name for g in group_floors(paths, 8, 18)} == {ROOT, "lib"}


def test_wing_of() -> None:
    assert wing_of("src/core/a/b.py", "src/core") == "a"
    assert wing_of("src/core/b.py", "src/core") == "."
    assert wing_of("other/b.py", "src/core") == "other"


@settings(max_examples=200)
@given(
    st.lists(st.text("abcdef/", min_size=1, max_size=8), min_size=1, max_size=25, unique=True),
    st.data(),
    st.floats(0, 1),
)
def test_corridors_connect_everything(paths: list[str], data: st.DataObject, ratio: float) -> None:
    pairs = st.tuples(st.sampled_from(paths), st.sampled_from(paths)).filter(lambda ab: ab[0] != ab[1])
    raw = data.draw(st.lists(pairs, max_size=40))
    imports: dict[tuple[str, str], int] = {}
    for a, b in raw:
        key = (min(a, b), max(a, b))
        imports[key] = imports.get(key, 0) + 1

    links = corridors(paths, imports, ratio)
    assert _connected(set(paths), [(link.a, link.b) for link in links])
    assert all(link.a in paths and link.b in paths and link.a != link.b for link in links)
    assert len({(link.a, link.b) for link in links}) == len(links)
    assert len(links) <= len(paths) - 1 + int(len(paths) * ratio) + 1
    assert corridors(list(reversed(paths)), imports, ratio) == links
