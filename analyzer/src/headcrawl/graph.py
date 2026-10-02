"""Corridors for one floor: a spanning tree that always connects every room,
plus a few extra import edges so the map has loops."""

import math
from dataclasses import dataclass
from pathlib import PurePosixPath


@dataclass(frozen=True)
class Link:
    a: str
    b: str
    kind: str  # "import" or "passage"
    weight: int


class _Sets:
    def __init__(self, items: list[str]):
        self.parent = {i: i for i in items}

    def find(self, x: str) -> str:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> bool:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if rb < ra:
            ra, rb = rb, ra
        self.parent[rb] = ra
        return True


def _closeness(a: str, b: str) -> tuple[int, int, str, str]:
    pa, pb = PurePosixPath(a).parts, PurePosixPath(b).parts
    common = 0
    for x, y in zip(pa, pb, strict=False):
        if x != y:
            break
        common += 1
    return (-common, abs(len(pa) - len(pb)), a, b)


def corridors(paths: list[str], imports: dict[tuple[str, str], int], extra_ratio: float) -> list[Link]:
    """paths are the rooms on the floor, imports maps sorted (a, b) to count."""
    paths = sorted(paths)
    sets = _Sets(paths)
    links: list[Link] = []
    ranked = sorted(imports.items(), key=lambda kv: (-kv[1], kv[0]))
    leftovers = []
    for (a, b), w in ranked:
        if sets.union(a, b):
            links.append(Link(a, b, "import", w))
        else:
            leftovers.append(Link(a, b, "import", w))

    # Rooms nobody imports still need a way in. Join each loose group to the
    # room closest to it in the directory tree.
    groups: dict[str, list[str]] = {}
    for p in paths:
        groups.setdefault(sets.find(p), []).append(p)
    ordered = sorted(groups.values(), key=lambda g: g[0])
    joined = list(ordered[0]) if ordered else []
    for group in ordered[1:]:
        a, b = min(((x, y) for x in group for y in joined), key=lambda xy: _closeness(*xy))
        sets.union(a, b)
        lo, hi = sorted((a, b))
        links.append(Link(lo, hi, "passage", 1))
        joined.extend(group)

    budget = math.ceil(len(paths) * extra_ratio)
    links.extend(leftovers[:budget])
    return links
