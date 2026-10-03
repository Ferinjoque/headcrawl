"""The repo's direct dependencies, read from manifest files at its root.

Only names, never versions or URLs, and only files at the top level: a
monorepo's nested manifests would drown the list. Every file is untrusted
input, so parsing is defensive and capped.
"""

import json
import re
import tomllib
from pathlib import Path

from .models import Dependency, Ecosystem
from .text import clean

MAX_DEPS = 40
MAX_MANIFEST_BYTES = 256 * 1024

MANIFESTS = ("package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "Gemfile", "composer.json")

_REQ_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")
_GO_REQ = re.compile(r"^\s*([A-Za-z0-9.-]+\.[a-z]{2,}/[^\s]+)\s+v")
_GEM = re.compile(r"""^\s*gem\s+['"]([A-Za-z0-9._-]+)['"]""")


def _read(root: Path, name: str) -> str | None:
    p = root / name
    try:
        if not p.is_file() or p.is_symlink() or p.stat().st_size > MAX_MANIFEST_BYTES:
            return None
        return p.read_text("utf-8", "replace")
    except OSError:
        return None


def _npm(text: str) -> list[str]:
    data = json.loads(text)
    if not isinstance(data, dict):
        return []
    deps = data.get("dependencies") or data.get("devDependencies") or {}
    return [str(k) for k in deps] if isinstance(deps, dict) else []


def _composer(text: str) -> list[str]:
    data = json.loads(text)
    req = data.get("require", {}) if isinstance(data, dict) else {}
    # "php" and "ext-*" are the platform, not packages.
    return [str(k) for k in req if isinstance(req, dict) and k != "php" and not str(k).startswith("ext-")]


def _pyproject(text: str) -> list[str]:
    data = tomllib.loads(text)
    names: list[str] = []
    for spec in data.get("project", {}).get("dependencies", []) or []:
        m = _REQ_NAME.match(str(spec))
        if m:
            names.append(m.group(1))
    poetry = data.get("tool", {}).get("poetry", {}).get("dependencies", {}) or {}
    names += [str(k) for k in poetry if str(k).lower() != "python"]
    return names


def _requirements(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        if line.lstrip().startswith(("#", "-")):
            continue
        m = _REQ_NAME.match(line)
        if m:
            out.append(m.group(1))
    return out


def _go(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        if line.strip().endswith("// indirect"):
            continue
        m = _GO_REQ.match(line.removeprefix("require "))
        if m:
            out.append(m.group(1))
    return out


def _cargo(text: str) -> list[str]:
    deps = tomllib.loads(text).get("dependencies", {})
    return [str(k) for k in deps] if isinstance(deps, dict) else []


def _gems(text: str) -> list[str]:
    return [m.group(1) for line in text.splitlines() if (m := _GEM.match(line))]


_PARSERS = {
    "package.json": (Ecosystem.NPM, _npm),
    "pyproject.toml": (Ecosystem.PYPI, _pyproject),
    "requirements.txt": (Ecosystem.PYPI, _requirements),
    "go.mod": (Ecosystem.GO, _go),
    "Cargo.toml": (Ecosystem.CARGO, _cargo),
    "Gemfile": (Ecosystem.GEM, _gems),
    "composer.json": (Ecosystem.COMPOSER, _composer),
}


def dependencies(root: Path) -> list[Dependency]:
    out: list[Dependency] = []
    seen: set[str] = set()
    for name in MANIFESTS:
        text = _read(root, name)
        if text is None:
            continue
        eco, parse = _PARSERS[name]
        try:
            names = parse(text)
        except (ValueError, TypeError, AttributeError, tomllib.TOMLDecodeError):
            continue
        for raw in names:
            dep = clean(raw, 80)
            if not dep or dep.lower() in seen:
                continue
            seen.add(dep.lower())
            out.append(Dependency(name=dep, ecosystem=eco))
            if len(out) >= MAX_DEPS:
                return out
    return out
