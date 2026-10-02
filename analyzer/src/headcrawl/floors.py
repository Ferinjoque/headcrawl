"""Split the repo into floors and order them top to bottom.

Top floors hold code that imports a lot (entry points, tests). Bottom floors
hold code that everything else imports. Walking down means walking into the
core of the project.
"""

import posixpath
from collections import Counter
from dataclasses import dataclass
from pathlib import PurePosixPath

from .languages import is_test_path

ROOT = "(root)"
TESTS = "tests"
EXTRAS = "examples"

# Code that orbits the project rather than being it. Gets one floor at most.
SIDE_DIRS = {
    "examples",
    "example",
    "samples",
    "sample",
    "demo",
    "demos",
    "benchmarks",
    "benchmark",
    "bench",
    "benches",
    "scripts",
    "tools",
    "fuzz",
    "contrib",
    "misc",
    "playground",
    "_examples",
}


@dataclass(frozen=True)
class Group:
    name: str
    prefix: str
    paths: tuple[str, ...]
    tests: bool = False
    parts: tuple[str, ...] = ()

    @property
    def label_parts(self) -> tuple[str, ...]:
        return self.parts or (self.name,)


def is_side_path(path: str) -> bool:
    return any(part.lower() in SIDE_DIRS for part in PurePosixPath(path).parts[:-1])


def _common_dir(paths: list[str]) -> str:
    dirs = [PurePosixPath(p).parts[:-1] for p in paths]
    if not dirs:
        return ""
    common: list[str] = []
    for parts in zip(*dirs, strict=False):
        if len(set(parts)) != 1:
            break
        common.append(parts[0])
    return "/".join(common)


def _key(path: str, prefix: str) -> str:
    rel = path[len(prefix) + 1 :] if prefix else path
    parts = PurePosixPath(rel).parts
    return parts[0] if len(parts) > 1 else ""


def _split(paths: list[str], prefix: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for p in paths:
        out.setdefault(_key(p, prefix), []).append(p)
    return out


def _join(prefix: str, key: str) -> str:
    return posixpath.join(prefix, key) if prefix else key


def group_floors(paths: list[str], max_floors: int, max_rooms: int, min_rooms: int = 3) -> list[Group]:
    paths = sorted(paths)

    # Tests share one floor, and so do examples, scripts and benchmarks.
    # Left alone they can take half the dungeon away from the real code.
    side_floors = []
    for name, keep, is_tests in ((TESTS, is_test_path, True), (EXTRAS, is_side_path, False)):
        bucket = [p for p in paths if keep(p)]
        rest = [p for p in paths if not keep(p)]
        if len(bucket) >= min_rooms and len(rest) >= min_rooms and max_floors > 1:
            side_floors.append(Group(name=name, prefix=_common_dir(bucket), paths=tuple(bucket), tests=is_tests))
            paths, max_floors = rest, max_floors - 1

    base = _common_dir(paths)
    groups = [
        Group(name=k or PurePosixPath(base).name or ROOT, prefix=_join(base, k) if k else base, paths=tuple(v))
        for k, v in sorted(_split(paths, base).items())
    ]
    groups = _split_big(groups, max_rooms, enough=max_floors * 2)
    groups = _fold(groups, max_floors, min_rooms)
    return _unique_names(sorted([*groups, *side_floors], key=lambda g: (g.name, g.prefix)))


def _unique_names(groups: list[Group]) -> list[Group]:
    """Loose files in src/ and a src/src/ folder would both be called "src"."""
    seen: Counter[str] = Counter(g.name for g in groups)
    out = []
    for g in groups:
        if seen[g.name] > 1:
            g = Group(name=g.prefix or ROOT, prefix=g.prefix, paths=g.paths, tests=g.tests, parts=g.parts)
        out.append(g)
    taken: Counter[str] = Counter()
    final = []
    for g in out:
        taken[g.name] += 1
        if taken[g.name] > 1:
            g = Group(name=f"{g.name} ({taken[g.name]})", prefix=g.prefix, paths=g.paths, tests=g.tests, parts=g.parts)
        final.append(g)
    return final


def _split_big(groups: list[Group], max_rooms: int, enough: int) -> list[Group]:
    """Break oversized groups into their subdirectories. May overshoot the
    floor count; _fold brings it back down."""
    for _ in range(enough * 2):
        if len(groups) >= enough:
            break
        options = [
            (g, parts)
            for g in groups
            if len(g.paths) > max_rooms and len(parts := _split(list(g.paths), g.prefix)) >= 2
        ]
        if not options:
            break
        big, parts = max(options, key=lambda gp: (len(gp[0].paths), gp[0].name))
        groups = [g for g in groups if g is not big]
        for k, v in sorted(parts.items()):
            name = f"{big.name}/{k}" if k else big.name
            groups.append(Group(name=name, prefix=_join(big.prefix, k) if k else big.prefix, paths=tuple(v)))
    return groups


def _fold(groups: list[Group], max_floors: int, min_rooms: int) -> list[Group]:
    """Merge the two smallest groups until the count fits and none is tiny."""
    while len(groups) > max_floors or (len(groups) > 1 and min(len(g.paths) for g in groups) < min_rooms):
        groups = sorted(groups, key=lambda g: (len(g.paths), g.name))
        groups = [_merge(groups[0], groups[1]), *groups[2:]]
    return groups


def _merge(a: Group, b: Group) -> Group:
    parts = tuple(sorted({*a.label_parts, *b.label_parts}))
    name = " + ".join(parts)
    if len(parts) > 2 or len(name) > 40:
        name = f"{parts[0]} + {len(parts) - 1} more"
    return Group(
        name=name,
        prefix=_common_dir([*a.paths, *b.paths]),
        paths=tuple(sorted(a.paths + b.paths)),
        parts=parts,
    )


def order_floors(groups: list[Group], edges: set[tuple[str, str]]) -> list[Group]:
    """edges are directed (importer, imported)."""
    owner = {p: g.name for g in groups for p in g.paths}
    incoming: Counter[str] = Counter()
    outgoing: Counter[str] = Counter()
    for src, dst in edges:
        gs, gd = owner.get(src), owner.get(dst)
        if gs and gd and gs != gd:
            outgoing[gs] += 1
            incoming[gd] += 1

    def rank(g: Group) -> tuple[int, float, str]:
        flow = (incoming[g.name] - outgoing[g.name]) / max(1, len(g.paths))
        return (0 if g.tests else 1, flow, g.name)

    return sorted(groups, key=rank)


def wing_of(path: str, prefix: str) -> str:
    rel = path[len(prefix) + 1 :] if prefix and path.startswith(prefix + "/") else path
    parent = posixpath.dirname(rel)
    return parent or "."
