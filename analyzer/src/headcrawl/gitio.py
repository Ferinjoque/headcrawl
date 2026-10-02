"""All git calls go through here.

The repo is untrusted. A cloned or local repo can carry config that runs
programs (hooks, fsmonitor, textconv, external diff), so every call passes
flags that turn those off, and we never use a shell.
"""

import os
import re
import subprocess
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from .limits import DEFAULT, Limits

_SAFE_CONFIG = (
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.symlinks=false",
    "-c",
    "protocol.file.allow=never",
    "-c",
    "protocol.ext.allow=never",
    "-c",
    "diff.external=",
    "-c",
    "core.pager=cat",
)

_URL = re.compile(r"^https://[A-Za-z0-9.-]+(?::\d{1,5})?/[A-Za-z0-9._~/-]+?(?:\.git)?/?$")
_SHORTHAND = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$")
_SHA = re.compile(r"^[0-9a-f]{40}$")


class GitError(RuntimeError):
    pass


def _env() -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(
        GIT_TERMINAL_PROMPT="0",
        GIT_LFS_SKIP_SMUDGE="1",
        GIT_CONFIG_NOSYSTEM="1",
        GIT_CONFIG_GLOBAL=os.devnull,
        GIT_ASKPASS="echo",
    )
    return env


def run(args: list[str], cwd: Path | None = None, timeout: int = 60, stdin: str | None = None) -> str:
    cmd = ["git", "--no-pager", *_SAFE_CONFIG, *args]
    try:
        out = subprocess.run(
            cmd,
            cwd=cwd,
            env=_env(),
            input=stdin.encode() if stdin is not None else b"",
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise GitError(f"git {args[0]} timed out after {timeout}s") from exc
    if out.returncode != 0:
        msg = out.stderr.decode("utf-8", "replace").strip().splitlines()
        raise GitError(f"git {args[0]} failed: {msg[-1] if msg else out.returncode}")
    return out.stdout.decode("utf-8", "replace")


def normalize_url(target: str) -> str:
    """Accept `owner/repo` or an https URL. Anything else is refused."""
    target = target.strip()
    if _SHORTHAND.match(target) and ".." not in target:
        return f"https://github.com/{target}"
    if _URL.match(target) and ".." not in target and "//" not in target[8:]:
        return target
    raise GitError(f"not a supported repo url: {target!r}")


def clone(url: str, dest: Path, limits: Limits = DEFAULT) -> None:
    url = normalize_url(url)
    if dest.exists() and any(dest.iterdir()):
        raise GitError(f"clone target is not empty: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "clone",
            "--quiet",
            "--no-recurse-submodules",
            "--single-branch",
            f"--depth={limits.clone_depth}",
            "--filter=blob:limit=1m",
            "--",
            url,
            str(dest),
        ],
        timeout=limits.clone_timeout_s,
    )
    size = sum(f.stat().st_size for f in dest.rglob("*") if f.is_file() and not f.is_symlink())
    if size > limits.max_clone_bytes:
        raise GitError(f"repo is too big: {size // (1024 * 1024)} MB")


def is_repo(path: Path) -> bool:
    try:
        return run(["rev-parse", "--is-inside-work-tree"], cwd=path).strip() == "true"
    except (GitError, FileNotFoundError, NotADirectoryError):
        return False


@dataclass(frozen=True)
class Head:
    sha: str
    time: int
    branch: str | None


def head(path: Path) -> Head:
    sha, ts = run(["log", "-1", "--format=%H %ct"], cwd=path).split()
    if not _SHA.match(sha):
        raise GitError(f"unexpected HEAD sha: {sha!r}")
    try:
        branch: str | None = run(["symbolic-ref", "--short", "-q", "HEAD"], cwd=path).strip() or None
    except GitError:
        branch = None
    return Head(sha=sha, time=int(ts), branch=branch)


@dataclass(frozen=True)
class TrackedFile:
    path: str
    symlink: bool
    submodule: bool


def tracked_files(path: Path) -> list[TrackedFile]:
    out = run(["ls-files", "-s", "-z"], cwd=path)
    files = []
    for entry in out.split("\0"):
        if not entry:
            continue
        meta, name = entry.split("\t", 1)
        mode = meta.split()[0]
        files.append(TrackedFile(path=name, symlink=mode == "120000", submodule=mode == "160000"))
    return files


def generated_paths(path: Path, files: list[str]) -> set[str]:
    """Files marked linguist-generated or linguist-vendored in .gitattributes."""
    if not files:
        return set()
    try:
        out = run(
            ["check-attr", "-z", "--stdin", "linguist-generated", "linguist-vendored"],
            cwd=path,
            stdin="\0".join(files) + "\0",
        )
    except GitError:
        return set()
    parts = out.split("\0")
    flagged = set()
    for i in range(0, len(parts) - 2, 3):
        name, _attr, value = parts[i], parts[i + 1], parts[i + 2]
        if value in ("set", "true"):
            flagged.add(name)
    return flagged


def churn(path: Path, limits: Limits = DEFAULT) -> Counter[str]:
    """How many of the last N commits touched each file.

    --name-only only needs trees, so this stays fast on partial clones.
    """
    out = run(
        [
            "log",
            f"--max-count={limits.churn_commits}",
            "--name-only",
            "--no-renames",
            "--no-merges",
            "--no-ext-diff",
            "--no-textconv",
            "--format=%x00",
        ],
        cwd=path,
        timeout=120,
    )
    counts: Counter[str] = Counter()
    for line in out.splitlines():
        line = line.strip("\0").strip()
        if line:
            counts[line] += 1
    return counts


def commit_count(path: Path, limits: Limits = DEFAULT) -> int:
    out = run(["rev-list", f"--max-count={limits.churn_commits}", "--count", "HEAD"], cwd=path)
    return int(out.strip() or 0)
