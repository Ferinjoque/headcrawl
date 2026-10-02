"""All git calls go through here.

The repo is untrusted. A local repo can carry config that runs programs
(hooks, fsmonitor, textconv, external diff, a gpg program for signature
checks), so every call passes flags that turn those off, and we never use a
shell. Clones fetch over https only and never lazily fetch more objects.
"""

import os
import re
import subprocess
import time
from collections import Counter
from collections.abc import Callable
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
    "-c",
    "core.quotePath=false",
    "-c",
    "log.showSignature=false",
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
        GIT_ALLOW_PROTOCOL="https",
        # Never fetch missing objects behind our back. A partial clone leaves
        # big blobs out on purpose.
        GIT_NO_LAZY_FETCH="1",
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


def is_shorthand(target: str) -> bool:
    return bool(_SHORTHAND.match(target.strip())) and ".." not in target


def normalize_url(target: str) -> str:
    """Accept `owner/repo` or an https URL. Anything else is refused."""
    target = target.strip()
    if is_shorthand(target):
        return f"https://github.com/{target}"
    if _URL.match(target) and ".." not in target and "//" not in target[8:]:
        return target
    raise GitError(f"not a supported repo url: {target!r}")


def clone(url: str, dest: Path, limits: Limits = DEFAULT, keep: Callable[[str], bool] = lambda _: True) -> int:
    """Clone without a checkout, then check out only the files worth reading.

    Nothing big lands on disk: blobs over the size limit are never fetched,
    and the checkout is capped by file count and total bytes before it starts.
    Returns how many files were checked out.
    """
    url = normalize_url(url)
    if dest.exists() and any(dest.iterdir()):
        raise GitError(f"clone target is not empty: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "clone",
            "--quiet",
            "--no-checkout",
            "--no-recurse-submodules",
            "--single-branch",
            f"--depth={limits.clone_depth}",
            f"--filter=blob:limit={limits.max_file_bytes}",
            "--",
            url,
            str(dest),
        ],
        timeout=limits.clone_timeout_s,
    )
    return checkout_selected(dest, keep, limits)


@dataclass(frozen=True)
class TreeEntry:
    mode: str
    oid: str
    path: str


def tree_entries(path: Path) -> list[TreeEntry]:
    out = run(["ls-tree", "-r", "-z", "--full-tree", "HEAD"], cwd=path, timeout=120)
    entries = []
    for item in out.split("\0"):
        if not item:
            continue
        meta, name = item.split("\t", 1)
        mode, _kind, oid = meta.split()
        entries.append(TreeEntry(mode, oid, name))
    return entries


def blob_sizes(path: Path, oids: list[str]) -> dict[str, int]:
    """Sizes of blobs we already have. Missing (filtered out) blobs are left out."""
    if not oids:
        return {}
    out = run(["cat-file", "--batch-check"], cwd=path, stdin="\n".join(oids) + "\n", timeout=120)
    sizes = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) == 3 and parts[1] == "blob":
            sizes[parts[0]] = int(parts[2])
    return sizes


def checkout_selected(path: Path, keep: Callable[[str], bool], limits: Limits = DEFAULT) -> int:
    entries = tree_entries(path)
    if len(entries) > limits.max_tree_entries:
        raise GitError(f"repo has too many files: {len(entries)}")
    regular = [e for e in entries if e.mode in ("100644", "100755")]
    wanted = [e for e in regular if keep(e.path) or e.path.rsplit("/", 1)[-1] in ("go.mod", ".gitattributes")]
    sizes = blob_sizes(path, sorted({e.oid for e in wanted}))
    picked: list[str] = []
    total = 0
    for e in sorted(wanted, key=lambda e: e.path):
        size = sizes.get(e.oid)
        if size is None or size > limits.max_file_bytes:
            continue
        if total + size > limits.max_clone_bytes or len(picked) >= limits.max_files:
            break
        picked.append(e.path)
        total += size
    if picked:
        run(
            ["--literal-pathspecs", "checkout", "HEAD", "--pathspec-from-file=-", "--pathspec-file-nul"],
            cwd=path,
            stdin="\0".join(picked) + "\0",
            timeout=limits.clone_timeout_s,
        )
    return len(picked)


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
    sha, ts = run(["log", "-1", "--no-show-signature", "--format=%H %ct"], cwd=path).split()
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
            "--no-show-signature",
            f"--max-count={limits.churn_commits}",
            "--name-only",
            # Paths relative to where we stand, so analyzing a subfolder of a
            # repo still lines up with ls-files.
            "--relative",
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


@dataclass(frozen=True)
class LineAge:
    year: int
    # Blamed on the oldest commit a shallow clone has, so this year or earlier.
    or_older: bool


def line_years(path: Path, rel: str, lines: set[int]) -> dict[int, LineAge]:
    """When each of `lines` was last changed, from git blame."""
    if not lines:
        return {}
    try:
        out = run(["blame", "--line-porcelain", "-w", "--", rel], cwd=path, timeout=60)
    except GitError:
        return {}
    ages: dict[int, LineAge] = {}
    current = 0
    year = 0
    boundary = False
    for row in out.splitlines():
        parts = row.split(" ")
        if len(parts) >= 3 and _SHA.match(parts[0]):
            current, year, boundary = int(parts[2]), 0, False
        elif row.startswith("committer-time "):
            year = time.gmtime(int(row.split(" ", 1)[1])).tm_year
        elif row == "boundary":
            boundary = True
        elif row.startswith("\t") and current in lines and year:
            ages[current] = LineAge(year, boundary)
    return ages


def last_subject(path: Path, rel: str) -> str | None:
    """Subject line of the last commit that touched a file."""
    try:
        out = run(["log", "-1", "--no-show-signature", "--format=%s", "--", rel], cwd=path)
    except GitError:
        return None
    return out.strip() or None


def commit_count(path: Path, limits: Limits = DEFAULT) -> int:
    out = run(["rev-list", f"--max-count={limits.churn_commits}", "--count", "HEAD"], cwd=path)
    return int(out.strip() or 0)
