"""DungeonSpec: the JSON contract between the analyzer and the game.

schema/dungeon.schema.json is generated from these models. Change them, then
run `headcrawl schema` and regenerate the TypeScript types.
"""

from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

SCHEMA_VERSION = 1

# Hard caps the game relies on. The analyzer's Limits stay at or below these.
MAX_FLOORS = 16
MAX_ROOMS = 40
MAX_ENEMIES = 12
MAX_LOOT = 8

Id = Annotated[str, StringConstraints(pattern=r"^[a-z][0-9]+$", max_length=12)]
Sha = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{40}$")]
Name = Annotated[str, StringConstraints(min_length=1, max_length=80)]
Line = Annotated[str, StringConstraints(max_length=200)]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Archetype(StrEnum):
    TANGLE = "tangle"
    NEST = "nest"
    HYDRA = "hydra"
    WALL = "wall"
    IMP = "imp"
    BUG = "bug"
    # Nothing in the repo mentions it, tests included: dead code.
    GHOST = "ghost"


class LootKind(StrEnum):
    POTION = "potion"
    BLADE = "blade"
    SCROLL = "scroll"
    CURSE = "curse"


class RoomKind(StrEnum):
    HALL = "hall"
    SHRINE = "shrine"
    LAIR = "lair"


class EdgeKind(StrEnum):
    IMPORT = "import"
    PASSAGE = "passage"


class Enemy(_Model):
    id: Id
    name: Name
    signature: Line
    archetype: Archetype
    hp: int = Field(ge=1, le=999)
    damage: int = Field(ge=1, le=99)
    speed: int = Field(ge=25, le=400)
    xp: int = Field(ge=1, le=1_000_000)
    line: int = Field(ge=1, le=10_000_000)
    ccn: int = Field(ge=1, le=100_000)
    nesting: int = Field(ge=0, le=1000)
    params: int = Field(ge=0, le=1000)
    nloc: int = Field(ge=0, le=10_000_000)
    # Marked deprecated in the code (@deprecated, #[deprecated], Deprecated: ...).
    deprecated: bool = False


class Loot(_Model):
    id: Id
    kind: LootKind
    tag: str = Field(pattern=r"^(TODO|FIXME|HACK|XXX)$")
    text: Line
    line: int = Field(ge=1, le=10_000_000)
    power: int = Field(ge=1, le=20)
    year: int | None = Field(default=None, ge=1970, le=2200)
    year_or_older: bool = False
    author: Name | None = None


class BossPast(_Model):
    """The boss function as it was about a year before HEAD."""

    year: int = Field(ge=1970, le=2200)
    ccn: int = Field(ge=1, le=100_000)
    nloc: int = Field(ge=0, le=10_000_000)


class Boss(_Model):
    id: Id
    name: Name
    title: Name
    signature: Line
    line: int = Field(ge=1, le=10_000_000)
    hp: int = Field(ge=1, le=9999)
    damage: int = Field(ge=1, le=99)
    speed: int = Field(ge=25, le=400)
    xp: int = Field(ge=1, le=1_000_000)
    ccn: int = Field(ge=1, le=100_000)
    churn: int = Field(ge=0, le=1_000_000)
    taunts: list[Line] = Field(min_length=1, max_length=6)
    final: bool = False
    past: BossPast | None = None
    # How the boss fights comes from these. Older dungeons don't have them.
    nesting: int = Field(default=0, ge=0, le=1000)
    params: int = Field(default=0, ge=0, le=1000)
    nloc: int = Field(default=0, ge=0, le=10_000_000)


class RoomPast(_Model):
    """The file's functions as they were about a year before HEAD."""

    year: int = Field(ge=1970, le=2200)
    enemies: list[Enemy] = Field(max_length=MAX_ENEMIES)


class Wing(_Model):
    id: Id
    path: Line
    name: Name


class Room(_Model):
    id: Id
    path: Line
    name: Name
    language: str
    wing: Id
    kind: RoomKind
    loc: int = Field(ge=0, le=1_000_000_000)
    size: int = Field(ge=1, le=5)
    functions: int = Field(ge=0, le=1_000_000_000)
    churn: int = Field(ge=0, le=1_000_000)
    heat: float = Field(ge=0, le=1)
    blurb: Line | None = None
    last_commit: Line | None = None
    enemies: list[Enemy] = Field(max_length=MAX_ENEMIES)
    loot: list[Loot] = Field(max_length=MAX_LOOT)
    past: RoomPast | None = None
    # Merge conflicts committed into the file (<<<<<<< ... ======= ... >>>>>>>).
    conflicts: int = Field(default=0, ge=0, le=1000)


class Edge(_Model):
    a: Id
    b: Id
    kind: EdgeKind
    weight: int = Field(ge=1, le=1_000_000)
    # Both files sit on one import cycle.
    loop: bool = False


class Keeper(_Model):
    """Whoever committed most to this floor's files. Shows up as an NPC."""

    name: Name
    commits: int = Field(ge=1, le=1_000_000)
    subject: Line | None = None


class Floor(_Model):
    id: Id
    index: int = Field(ge=0, le=15)
    name: Name
    path: Line
    wings: list[Wing] = Field(min_length=1, max_length=MAX_ROOMS)
    rooms: list[Room] = Field(min_length=1, max_length=MAX_ROOMS)
    edges: list[Edge] = Field(max_length=MAX_ROOMS * 4)
    entry: Id
    lair: Id
    boss: Boss
    keeper: Keeper | None = None

    @model_validator(mode="after")
    def _check(self) -> Self:
        ids = {r.id for r in self.rooms}
        wings = {w.id for w in self.wings}
        if self.entry not in ids or self.lair not in ids:
            raise ValueError(f"{self.id}: entry/lair must be rooms on this floor")
        for r in self.rooms:
            if r.wing not in wings:
                raise ValueError(f"{r.id}: unknown wing {r.wing}")
        for e in self.edges:
            if e.a not in ids or e.b not in ids or e.a == e.b:
                raise ValueError(f"{self.id}: bad edge {e.a}-{e.b}")
        if not _connected(ids, [(e.a, e.b) for e in self.edges]):
            raise ValueError(f"{self.id}: rooms are not all connected")
        return self


class LanguageShare(_Model):
    name: str
    loc: int = Field(ge=0, le=1_000_000_000)


class Ecosystem(StrEnum):
    NPM = "npm"
    PYPI = "pypi"
    GO = "go"
    CARGO = "cargo"
    GEM = "gem"
    COMPOSER = "composer"


class Dependency(_Model):
    name: Name
    ecosystem: Ecosystem


class Branch(_Model):
    """Another branch on the remote, for the side doors on each floor."""

    name: Name
    head: Sha


class RepoInfo(_Model):
    name: Name
    url: Line | None = None
    head: Sha
    branch: Name | None = None
    committed_at: int = Field(ge=0, le=2**40)
    commits_scanned: int = Field(ge=0, le=1_000_000_000)
    languages: list[LanguageShare] = Field(max_length=32)
    dependencies: list[Dependency] = Field(default_factory=list, max_length=40)
    # Only from command line builds: a branch list isn't pinned to a commit, so
    # the browser leaves it out and a link builds the same dungeon for everyone.
    branches: list[Branch] = Field(default_factory=list, max_length=8)


class Totals(_Model):
    files: int = Field(ge=0, le=1_000_000_000)
    rooms: int = Field(ge=0, le=1_000_000_000)
    functions: int = Field(ge=0, le=1_000_000_000)
    enemies: int = Field(ge=0, le=1_000_000_000)
    loot: int = Field(ge=0, le=1_000_000_000)
    loc: int = Field(ge=0, le=1_000_000_000)
    skipped: int = Field(ge=0, le=1_000_000_000)


class DungeonSpec(_Model):
    schema_version: int = Field(default=SCHEMA_VERSION, ge=1)
    generator: str
    seed: Sha
    repo: RepoInfo
    floors: list[Floor] = Field(min_length=1, max_length=MAX_FLOORS)
    totals: Totals

    @model_validator(mode="after")
    def _check(self) -> Self:
        seen: set[str] = set()
        for f in self.floors:
            things = [f.id, f.boss.id, *(w.id for w in f.wings)]
            for r in f.rooms:
                things += [r.id, *(e.id for e in r.enemies), *(x.id for x in r.loot)]
                if r.past:
                    things += [e.id for e in r.past.enemies]
            for t in things:
                if t in seen:
                    raise ValueError(f"duplicate id {t}")
                seen.add(t)
        if [f.index for f in self.floors] != list(range(len(self.floors))):
            raise ValueError("floor indexes must be 0..n-1 in order")
        finals = [f.index for f in self.floors if f.boss.final]
        if finals != [len(self.floors) - 1]:
            raise ValueError("exactly the last floor must hold the final boss")
        return self


def _connected(nodes: set[str], edges: list[tuple[str, str]]) -> bool:
    if not nodes:
        return True
    adj: dict[str, set[str]] = {n: set() for n in nodes}
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    start = next(iter(sorted(nodes)))
    seen = {start}
    stack = [start]
    while stack:
        for nxt in adj[stack.pop()]:
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen == nodes
