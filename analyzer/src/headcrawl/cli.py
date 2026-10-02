"""Command line entry: `headcrawl analyze`, `headcrawl schema`, `headcrawl prefetch`."""

import argparse
import json
import os
import shutil
import stat
import sys
import tempfile
from pathlib import Path

from pydantic import ValidationError

from . import gitio
from .build import AnalysisError, analyze
from .languages import GRAMMARS
from .limits import DEFAULT, Limits
from .models import MAX_FLOORS, MAX_ROOMS, DungeonSpec
from .walk import wanted


def _force_remove(func, path, _exc):  # type: ignore[no-untyped-def]
    # git marks pack files read-only, which trips rmtree on Windows.
    os.chmod(path, stat.S_IWRITE)
    func(path)


def _cleanup(tmp: str) -> None:
    try:
        shutil.rmtree(tmp, onexc=_force_remove)
    except OSError as exc:
        print(f"headcrawl: could not remove {tmp}: {exc}", file=sys.stderr)


def is_local(target: str) -> bool:
    """`owner/repo` means GitHub even if a folder by that name exists here.
    Write ./owner/repo to analyze the folder."""
    if gitio.is_shorthand(target) and not target.startswith("."):
        return False
    return Path(target).exists()


def analyze_target(target: str, limits: Limits = DEFAULT, name: str | None = None) -> DungeonSpec:
    if is_local(target):
        return analyze(Path(target), name=name, limits=limits)
    url = gitio.normalize_url(target)
    tmp = tempfile.mkdtemp(prefix="headcrawl-")
    try:
        dest = Path(tmp) / "repo"
        gitio.clone(url, dest, limits, keep=wanted)
        repo_name = name or url.rstrip("/").removesuffix(".git").split("/", 3)[-1]
        return analyze(dest, name=repo_name, url=url, limits=limits)
    finally:
        _cleanup(tmp)


def write_json(data: str, out: str | None) -> None:
    if out in (None, "-"):
        sys.stdout.write(data + "\n")
        return
    path = Path(out)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(data + "\n")


def _cmd_analyze(args: argparse.Namespace) -> int:
    limits = Limits(
        max_floors=max(1, min(args.max_floors, MAX_FLOORS)),
        max_rooms_per_floor=max(1, min(args.max_rooms, MAX_ROOMS)),
        clone_depth=max(1, args.depth),
    )
    try:
        spec = analyze_target(args.target, limits, args.name)
    except (gitio.GitError, AnalysisError, ValidationError) as exc:
        print(f"headcrawl: {exc}", file=sys.stderr)
        return 1
    if args.flavor:
        from .flavor import add_flavor

        spec = add_flavor(spec, model=args.model, cache_dir=Path(args.cache))
    write_json(spec.model_dump_json(indent=None if args.compact else 2, exclude_none=True), args.out)
    t = spec.totals
    print(
        f"{spec.repo.name}: {len(spec.floors)} floors, {t.rooms} rooms, {t.enemies} enemies, "
        f"{t.loot} loot, {t.skipped} files skipped",
        file=sys.stderr,
    )
    return 0


def _cmd_schema(args: argparse.Namespace) -> int:
    schema = DungeonSpec.model_json_schema(mode="serialization")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "DungeonSpec"
    write_json(json.dumps(schema, indent=2, sort_keys=True), args.out)
    return 0


def _cmd_prefetch(_args: argparse.Namespace) -> int:
    from .syntax import prefetch

    prefetch(GRAMMARS)
    print(f"grammars ready: {', '.join(GRAMMARS)}", file=sys.stderr)
    return 0


def _cmd_validate(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.is_file() or path.stat().st_size > 8 * 1024 * 1024:
        print(f"headcrawl: {path} is missing or too big", file=sys.stderr)
        return 1
    try:
        spec = DungeonSpec.model_validate_json(path.read_bytes())
    except ValidationError as exc:
        print(f"headcrawl: {path} is not a valid dungeon: {exc.error_count()} problems", file=sys.stderr)
        return 1
    print(f"{spec.repo.name}: ok, {len(spec.floors)} floors", file=sys.stderr)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="headcrawl", description="Turn a git repo into a dungeon.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="analyze a local path, owner/repo, or https url")
    a.add_argument("target")
    a.add_argument("-o", "--out", default="-")
    a.add_argument("--name")
    a.add_argument("--max-floors", type=int, default=DEFAULT.max_floors)
    a.add_argument("--max-rooms", type=int, default=DEFAULT.max_rooms_per_floor)
    a.add_argument("--depth", type=int, default=DEFAULT.clone_depth, help="commits to clone")
    a.add_argument("--compact", action="store_true", help="no indentation in the json")
    a.add_argument("--flavor", action="store_true", help="boss names and taunts from a local ollama model")
    a.add_argument("--model", default="gemma4")
    a.add_argument("--cache", default=".cache/flavor")
    a.set_defaults(fn=_cmd_analyze)

    s = sub.add_parser("schema", help="print the DungeonSpec JSON schema")
    s.add_argument("-o", "--out", default="-")
    s.set_defaults(fn=_cmd_schema)

    p = sub.add_parser("prefetch", help="download the tree-sitter grammars we use")
    p.set_defaults(fn=_cmd_prefetch)

    v = sub.add_parser("validate", help="check that a file is a valid dungeon")
    v.add_argument("file")
    v.set_defaults(fn=_cmd_validate)

    args = parser.parse_args(argv)
    return int(args.fn(args))
