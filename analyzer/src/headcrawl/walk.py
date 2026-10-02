"""Pick the files worth turning into rooms."""

import os
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

from . import gitio
from .languages import Language, detect
from .limits import DEFAULT, Limits

SKIP_DIRS = {
    ".git",
    "node_modules",
    "vendor",
    "third_party",
    "third-party",
    "external",
    "dist",
    "build",
    "out",
    "target",
    "bin",
    "obj",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    ".tox",
    ".mypy_cache",
    "site-packages",
    "bower_components",
    ".next",
    ".nuxt",
    "coverage",
    "Pods",
    "Carthage",
    "deps",
    "_build",
    "generated",
    "gen",
    ".idea",
    ".vscode",
    "migrations",
    "docs",
    "doc",
}

SKIP_SUFFIXES = (".min.js", ".min.css", ".bundle.js", ".pb.go", "_pb2.py", ".d.ts", ".g.cs", ".designer.cs")


@dataclass(frozen=True)
class SourceFile:
    path: str
    language: Language
    text: str


@dataclass
class WalkResult:
    files: list[SourceFile] = field(default_factory=list)
    skipped: int = 0


def _candidates(root: Path) -> tuple[list[str], set[str]]:
    """Relative posix paths, plus the subset that git says is generated."""
    if gitio.is_repo(root):
        tracked = gitio.tracked_files(root)
        paths = [t.path for t in tracked if not t.symlink and not t.submodule]
        return paths, gitio.generated_paths(root, paths)
    paths = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(filenames):
            full = Path(dirpath) / name
            if full.is_symlink():
                continue
            paths.append(full.relative_to(root).as_posix())
    return paths, set()


def _skip_path(rel: str) -> bool:
    p = PurePosixPath(rel)
    if any(part in SKIP_DIRS or part.startswith(".") for part in p.parts[:-1]):
        return True
    return p.name.lower().endswith(SKIP_SUFFIXES)


def _read(root: Path, rel: str, limits: Limits) -> str | None:
    raw = root / rel
    if raw.is_symlink():
        return None
    full = raw.resolve()
    if not full.is_relative_to(root.resolve()) or not full.is_file():
        return None
    if full.stat().st_size > limits.max_file_bytes:
        return None
    data = full.read_bytes()
    if b"\0" in data[:8192]:
        return None
    text = data.decode("utf-8", "replace")
    lines = text.splitlines()
    if lines and max(len(line) for line in lines) > limits.max_line_length * 4:
        return None
    if lines and sum(len(line) for line in lines) / len(lines) > limits.max_line_length:
        return None
    return text


def wanted(rel: str) -> bool:
    """Would walk() read this path? Used to decide what a clone checks out."""
    return detect(rel) is not None and not _skip_path(rel)


def walk(root: Path, limits: Limits = DEFAULT) -> WalkResult:
    paths, generated = _candidates(root)
    result = WalkResult()
    budget = limits.max_read_bytes
    for rel in sorted(paths):
        lang = detect(rel)
        if lang is None:
            continue
        if rel in generated or _skip_path(rel):
            result.skipped += 1
            continue
        if len(result.files) >= limits.max_files or budget <= 0:
            result.skipped += 1
            continue
        text = _read(root, rel, limits)
        if text is None or not text.strip():
            result.skipped += 1
            continue
        budget -= len(text)
        result.files.append(SourceFile(rel, lang, text))
    return result
