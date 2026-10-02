"""Repo on disk -> DungeonSpec."""

import hashlib
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from . import __version__, gitio, stats
from .floors import Group, group_floors, order_floors, wing_of
from .graph import corridors
from .languages import is_test_path
from .limits import DEFAULT, Limits
from .metrics import FileMetric, FunctionMetric, measure
from .models import (
    Boss,
    DungeonSpec,
    Edge,
    EdgeKind,
    Enemy,
    Floor,
    LanguageShare,
    Loot,
    RepoInfo,
    Room,
    RoomKind,
    Totals,
    Wing,
)
from .resolve import Resolver, go_module
from .syntax import SyntaxInfo, Tag, extract
from .text import clean
from .walk import SourceFile, walk

ENTRY_NAMES = ("main", "index", "__init__", "__main__", "app", "lib", "mod", "cli")


class AnalysisError(RuntimeError):
    pass


@dataclass(frozen=True)
class FileReport:
    src: SourceFile
    metric: FileMetric
    syntax: SyntaxInfo
    churn: int
    is_test: bool

    @property
    def path(self) -> str:
        return self.src.path

    @property
    def ccn_total(self) -> int:
        return sum(f.ccn for f in self.metric.functions)

    @property
    def rank(self) -> float:
        return self.ccn_total + 3 * self.churn + self.metric.nloc / 50 + 5 * len(self.syntax.tags)


class _Ids:
    def __init__(self) -> None:
        self.counts: Counter[str] = Counter()

    def __call__(self, prefix: str) -> str:
        n = self.counts[prefix]
        self.counts[prefix] += 1
        return f"{prefix}{n}"


@dataclass(frozen=True)
class _Context:
    reports: dict[str, FileReport]
    edges: set[tuple[str, str]]
    heat: dict[str, float]
    commits: int
    limits: Limits
    ids: _Ids


def _analyze_file(src: SourceFile, churn: int) -> FileReport | None:
    try:
        metric = measure(src.path, src.text)
        syntax = extract(src.language, src.text)
    except Exception:  # noqa: BLE001 - one broken file must not sink the whole repo
        return None
    return FileReport(src, metric, syntax, churn, is_test_path(src.path))


def _fake_head(files: list[SourceFile]) -> gitio.Head:
    h = hashlib.sha1(usedforsecurity=False)
    for f in files:
        h.update(f.path.encode())
        h.update(b"\0")
        h.update(f.text.encode("utf-8", "replace"))
    return gitio.Head(sha=h.hexdigest(), time=0, branch=None)


def _read_go_mod(root: Path) -> str | None:
    p = root / "go.mod"
    if p.is_file() and not p.is_symlink() and p.stat().st_size < 64 * 1024:
        return p.read_text("utf-8", "replace")
    return None


def _import_edges(root: Path, reports: dict[str, FileReport]) -> set[tuple[str, str]]:
    resolver = Resolver(reports, go_module=go_module(_read_go_mod(root)))
    edges = set()
    for path, rep in reports.items():
        for ref in rep.syntax.imports:
            for target in resolver.resolve(path, rep.src.language.name, ref):
                if target in reports:
                    edges.add((path, target))
    return edges


def _heat(reports: dict[str, FileReport]) -> dict[str, float]:
    raw = {p: (r.churn + 1) * (r.ccn_total + 1) for p, r in reports.items()}
    top = max(raw.values(), default=1)
    return {p: round(v / top, 4) for p, v in raw.items()}


def analyze(root: Path, *, name: str | None = None, url: str | None = None, limits: Limits = DEFAULT) -> DungeonSpec:
    root = root.resolve()
    walked = walk(root, limits)
    if not walked.files:
        raise AnalysisError("no source files to read in this repo")

    in_git = gitio.is_repo(root)
    try:
        head = gitio.head(root) if in_git else _fake_head(walked.files)
    except gitio.GitError:
        # A repo with no commits yet.
        in_git = False
        head = _fake_head(walked.files)
    churn = gitio.churn(root, limits) if in_git else Counter()
    commits = gitio.commit_count(root, limits) if in_git else 0

    reports: dict[str, FileReport] = {}
    skipped = walked.skipped
    deadline = time.monotonic() + limits.max_seconds
    for src in walked.files:
        # Failing beats silently skipping files: a slower machine would
        # otherwise produce a different dungeon for the same commit.
        if time.monotonic() > deadline:
            raise AnalysisError(f"analysis took longer than {limits.max_seconds:.0f}s, try a smaller repo or --depth")
        rep = _analyze_file(src, churn.get(src.path, 0))
        if rep is None:
            skipped += 1
        else:
            reports[src.path] = rep
    if not reports:
        raise AnalysisError("every source file failed to parse")

    edges = _import_edges(root, reports)
    ctx = _Context(reports, edges, _heat(reports), commits, limits, _Ids())
    groups = order_floors(group_floors(sorted(reports), limits.max_floors, limits.max_rooms_per_floor), edges)

    floors = []
    placed: set[str] = set()
    for index, group in enumerate(groups):
        floor, kept = _floor(ctx, index, group, placed, final=index == len(groups) - 1)
        floors.append(floor)
        placed |= kept
    skipped += len(reports) - len(placed)

    langs: Counter[str] = Counter()
    for r in reports.values():
        langs[r.src.language.name] += r.metric.nloc

    rooms = [room for f in floors for room in f.rooms]
    return DungeonSpec(
        generator=f"headcrawl {__version__}",
        seed=head.sha,
        repo=RepoInfo(
            name=clean(name or root.name, 80) or "repo",
            url=url,
            head=head.sha,
            branch=(clean(head.branch, 80) or None) if head.branch else None,
            committed_at=head.time,
            commits_scanned=commits,
            languages=[LanguageShare(name=k, loc=v) for k, v in sorted(langs.items(), key=lambda kv: (-kv[1], kv[0]))],
        ),
        floors=floors,
        totals=Totals(
            files=len(reports),
            rooms=len(rooms),
            functions=sum(len(r.metric.functions) for r in reports.values()),
            enemies=sum(len(r.enemies) for r in rooms) + len(floors),
            loot=sum(len(r.loot) for r in rooms),
            loc=sum(r.metric.nloc for r in reports.values()),
            skipped=skipped,
        ),
    )


def _pick_rooms(ctx: _Context, group: Group) -> list[FileReport]:
    reps = [ctx.reports[p] for p in group.paths]
    reps.sort(key=lambda r: (-r.rank, r.path))
    cap = ctx.limits.max_rooms_per_floor
    if group.tests:
        cap = max(4, cap // 2)
    return sorted(reps[:cap], key=lambda r: r.path)


def _pick_lair(ctx: _Context, reps: list[FileReport]) -> FileReport:
    fighters = [r for r in reps if r.metric.functions and not r.is_test] or reps
    return max(fighters, key=lambda r: (ctx.heat[r.path], r.ccn_total, r.path))


def _pick_entry(ctx: _Context, reps: list[FileReport], lair: FileReport, placed: set[str]) -> FileReport:
    others = [r for r in reps if r.path != lair.path] or reps
    from_above = Counter(dst for src, dst in ctx.edges if src in placed)

    def score(r: FileReport) -> tuple[int, int, int, str]:
        stem = PurePosixPath(r.path).stem.lower()
        return (-from_above[r.path], 0 if stem in ENTRY_NAMES else 1, -r.metric.nloc, r.path)

    return min(others, key=score)


def _floor(ctx: _Context, index: int, group: Group, placed: set[str], final: bool) -> tuple[Floor, set[str]]:
    reps = _pick_rooms(ctx, group)
    lair = _pick_lair(ctx, reps)
    entry = _pick_entry(ctx, reps, lair, placed)
    boss_fn = _boss_function(lair)

    wing_ids: dict[str, str] = {}
    wings = []
    for r in reps:
        w = wing_of(r.path, group.prefix)
        if w not in wing_ids:
            wing_ids[w] = ctx.ids("w")
            wings.append(Wing(id=wing_ids[w], path=clean(w, 200), name=_label(PurePosixPath(w).name, group.name)))

    room_ids = {r.path: ctx.ids("r") for r in reps}
    shrines = _pick_shrines(ctx, reps, {lair.path, entry.path})
    rooms = [
        _room(ctx, r, room_ids[r.path], wing_ids[wing_of(r.path, group.prefix)], lair, boss_fn, r.path in shrines)
        for r in reps
    ]

    local = {r.path for r in reps}
    weights: Counter[tuple[str, str]] = Counter()
    for src, dst in ctx.edges:
        if src in local and dst in local:
            weights[tuple(sorted((src, dst)))] += 1  # type: ignore[index]
    links = corridors(sorted(local), dict(weights), ctx.limits.max_extra_edges_ratio)
    edges = [
        Edge(a=room_ids[link.a], b=room_ids[link.b], kind=EdgeKind(link.kind), weight=link.weight) for link in links
    ]

    floor = Floor(
        id=ctx.ids("f"),
        index=index,
        name=_label(group.name, "floor"),
        path=clean(group.prefix or ".", 200),
        wings=wings,
        rooms=rooms,
        edges=edges,
        entry=room_ids[entry.path],
        lair=room_ids[lair.path],
        boss=_boss(ctx, lair, boss_fn, index, final),
    )
    return floor, local


def _label(value: str, fallback: str) -> str:
    """A name that survives cleaning. Some repos name things with only
    invisible characters."""
    return clean(value, 80) or clean(fallback, 80) or "?"


def _is_anonymous(f: FunctionMetric) -> bool:
    return not f.name or f.name.startswith("(") or f.name == "anonymous"


def _display_name(f: FunctionMetric, path: str) -> str:
    if _is_anonymous(f):
        return f"{PurePosixPath(path).stem}@{f.start_line}"
    return _label(f.name, f"{PurePosixPath(path).stem}@{f.start_line}")


def _boss_function(rep: FileReport) -> FunctionMetric:
    funcs = rep.metric.functions
    if funcs:
        best = max(funcs, key=lambda f: (stats.threat(f), -f.start_line))
        named = [f for f in funcs if not _is_anonymous(f)]
        if _is_anonymous(best) and named:
            runner_up = max(named, key=lambda f: (stats.threat(f), -f.start_line))
            if stats.threat(runner_up) * 2 >= stats.threat(best):
                return runner_up
        return best
    stem = PurePosixPath(rep.path).stem
    return FunctionMetric(
        name=stem,
        long_name=stem,
        ccn=max(1, rep.metric.nloc // 40),
        nloc=rep.metric.nloc,
        params=0,
        nesting=1,
        start_line=1,
        end_line=max(1, rep.metric.nloc),
    )


def _pick_shrines(ctx: _Context, reps: list[FileReport], taken: set[str]) -> set[str]:
    """Test files heal you. On a floor made of tests only the quietest one does,
    or there would be nothing left to fight."""
    tests = sorted((r for r in reps if r.is_test and r.path not in taken), key=lambda r: (ctx.heat[r.path], r.path))
    if len(tests) * 3 > len(reps):
        tests = tests[:1]
    return {r.path for r in tests[:2]}


def _room(
    ctx: _Context, rep: FileReport, rid: str, wing: str, lair: FileReport, boss_fn: FunctionMetric, shrine: bool
) -> Room:
    is_lair = rep.path == lair.path
    kind = RoomKind.LAIR if is_lair else RoomKind.SHRINE if shrine else RoomKind.HALL
    enemies = [] if kind is RoomKind.SHRINE else _enemies(ctx, rep, boss_fn if is_lair else None)
    return Room(
        id=rid,
        path=clean(rep.path, 200),
        name=_label(PurePosixPath(rep.path).name, "file"),
        language=rep.src.language.name,
        wing=wing,
        kind=kind,
        loc=rep.metric.nloc,
        size=stats.room_size(rep.metric.nloc),
        functions=len(rep.metric.functions),
        churn=rep.churn,
        heat=ctx.heat[rep.path],
        blurb=rep.syntax.blurb,
        enemies=enemies,
        loot=_loot(ctx, rep.syntax.tags),
    )


def _enemies(ctx: _Context, rep: FileReport, skip: FunctionMetric | None) -> list[Enemy]:
    funcs = [f for f in rep.metric.functions if f is not skip]
    funcs.sort(key=lambda f: (-stats.threat(f), f.start_line))
    out = []
    for f in funcs[: ctx.limits.max_enemies_per_room]:
        out.append(
            Enemy(
                id=ctx.ids("e"),
                name=_display_name(f, rep.path),
                signature=clean(f.long_name, 200),
                archetype=stats.archetype(f),
                hp=stats.enemy_hp(f),
                damage=stats.enemy_damage(f),
                speed=stats.enemy_speed(f),
                xp=stats.enemy_xp(f),
                line=max(1, f.start_line),
                ccn=f.ccn,
                nesting=f.nesting,
                params=f.params,
                nloc=f.nloc,
            )
        )
    return out


def _loot(ctx: _Context, tags: tuple[Tag, ...]) -> list[Loot]:
    out = []
    for tag in sorted(tags, key=lambda t: t.line)[: ctx.limits.max_loot_per_room]:
        out.append(
            Loot(
                id=ctx.ids("l"),
                kind=stats.LOOT_KIND[tag.kind],
                tag=tag.kind,
                text=tag.text or tag.kind.lower(),
                line=max(1, tag.line),
                power=stats.loot_power(tag.kind, tag.text),
            )
        )
    return out


def _taunts(ctx: _Context, rep: FileReport, f: FunctionMetric, final: bool) -> list[str]:
    if f.ccn == 1:
        lines = ["One path through me. You still won't find it."]
    else:
        lines = [f"{f.ccn} paths run through me. You know one of them."]
    if rep.churn:
        lines.append(f"Changed in {rep.churn} of the last {ctx.commits or rep.churn} commits, and still standing.")
    if f.nesting >= 3:
        lines.append(f"{f.nesting} levels deep. Watch your step.")
    if f.params >= 4:
        lines.append(f"I take {f.params} arguments. You brought one.")
    for tag in rep.syntax.tags[:1]:
        if tag.text:
            lines.append(clean(f'Someone wrote "{tag.text}" and never came back.', 200))
    if final:
        lines.append("Every import ends with me.")
    return lines[:6]


def _boss(ctx: _Context, rep: FileReport, f: FunctionMetric, depth: int, final: bool) -> Boss:
    hp, dmg, speed, xp = stats.boss_stats(f, rep.churn, depth, final)
    return Boss(
        id=ctx.ids("b"),
        name=_display_name(f, rep.path),
        title=stats.boss_title(rep.churn, final),
        signature=clean(f.long_name, 200),
        line=max(1, f.start_line),
        hp=hp,
        damage=dmg,
        speed=speed,
        xp=xp,
        ccn=f.ccn,
        churn=rep.churn,
        taunts=_taunts(ctx, rep, f, final),
        final=final,
    )
