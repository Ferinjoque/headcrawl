"""Turn import specs into edges between files in the repo.

This is best effort. Anything we can't pin to a file in the repo (stdlib,
packages, aliases we don't know) is dropped. The builder adds structural
corridors later, so a floor stays connected even with zero resolved imports.
"""

import posixpath
import re
from collections import defaultdict
from collections.abc import Iterable
from pathlib import PurePosixPath

from .syntax import ImportRef

_JS_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts")


def _stem_parts(path: str) -> tuple[str, ...]:
    p = PurePosixPath(path)
    return (*p.parts[:-1], p.stem)


class Resolver:
    def __init__(self, paths: Iterable[str], go_module: str | None = None):
        self.paths = sorted(set(paths))
        self.known = set(self.paths)
        self.go_module = go_module
        self._suffix: dict[tuple[str, ...], list[str]] = defaultdict(list)
        self._py: dict[str, list[str]] = defaultdict(list)
        self._dirs: dict[str, list[str]] = defaultdict(list)
        for path in self.paths:
            parts = _stem_parts(path)
            for k in range(1, min(len(parts), 5) + 1):
                self._suffix[parts[-k:]].append(path)
            self._dirs[posixpath.dirname(path)].append(path)
            if path.endswith(".py"):
                mod = parts[:-1] if parts[-1] == "__init__" else parts
                for k in range(1, len(mod) + 1):
                    self._py[".".join(mod[-k:])].append(path)

    def _pick(self, importer: str, candidates: Iterable[str]) -> str | None:
        options = [c for c in candidates if c != importer]
        if not options:
            return None
        here = PurePosixPath(importer).parts

        def score(c: str) -> tuple[int, int, str]:
            parts = PurePosixPath(c).parts
            common = 0
            for a, b in zip(here, parts, strict=False):
                if a != b:
                    break
                common += 1
            return (-common, len(parts), c)

        return min(options, key=score)

    def _file(self, base: str) -> str | None:
        return base if base in self.known else None

    def resolve(self, importer: str, language: str, ref: ImportRef) -> list[str]:
        fn = getattr(self, f"_{language}", None)
        if fn is None:
            return []
        found = fn(importer, ref)
        if found is None:
            return []
        if isinstance(found, str):
            found = [found]
        return sorted({f for f in found if f and f != importer})

    def _python(self, importer: str, ref: ImportRef) -> list[str]:
        if ref.level:
            base = PurePosixPath(importer).parent
            for _ in range(ref.level - 1):
                base = base.parent
            mod = base.joinpath(*ref.spec.split(".")) if ref.spec else base
            out = []
            for target in [mod, *(mod / n for n in ref.names if n != "*")]:
                hit = self._file(f"{target}.py") or self._file(f"{target}/__init__.py")
                if hit:
                    out.append(hit)
            return out
        out = []
        for name in [ref.spec, *(f"{ref.spec}.{n}" for n in ref.names if n != "*")]:
            if name in self._py and (hit := self._pick(importer, self._py[name])):
                out.append(hit)
        return out

    def _js_file(self, base: str) -> str | None:
        base = posixpath.normpath(base)
        if base in self.known:
            return base
        stem = re.sub(r"\.(m|c)?js$", "", base)
        for ext in _JS_EXTS:
            if f"{stem}{ext}" in self.known:
                return f"{stem}{ext}"
        for ext in _JS_EXTS:
            if f"{base}/index{ext}" in self.known:
                return f"{base}/index{ext}"
        return None

    def _javascript(self, importer: str, ref: ImportRef) -> str | None:
        spec = ref.spec
        if spec.startswith("."):
            return self._js_file(posixpath.join(posixpath.dirname(importer), spec))
        if spec.startswith(("@/", "~/")):
            return self._js_file("src/" + spec[2:]) or self._js_file(spec[2:])
        return None

    _typescript = _javascript

    def _go(self, importer: str, ref: ImportRef) -> str | None:
        if not self.go_module or not (ref.spec == self.go_module or ref.spec.startswith(self.go_module + "/")):
            return None
        rel = ref.spec[len(self.go_module) :].strip("/")
        files = [f for f in self._dirs.get(rel, []) if f.endswith(".go") and not f.endswith("_test.go")]
        return self._pick(importer, files)

    def _crate_root(self, importer: str) -> str:
        d = posixpath.dirname(importer)
        while True:
            here = f"{d}/" if d else ""
            if f"{here}lib.rs" in self.known or f"{here}main.rs" in self.known:
                return d
            if not d:
                return posixpath.dirname(importer)
            d = posixpath.dirname(d)

    def _rust_module_dir(self, importer: str) -> str:
        p = PurePosixPath(importer)
        if p.name in ("mod.rs", "lib.rs", "main.rs"):
            return str(p.parent) if str(p.parent) != "." else ""
        return str(p.parent / p.stem) if str(p.parent) != "." else p.stem

    def _rust_find(self, base: str, parts: list[str]) -> str | None:
        for k in range(len(parts), 0, -1):
            stem = posixpath.join(base, *parts[:k]) if base else posixpath.join(*parts[:k])
            hit = self._file(f"{stem}.rs") or self._file(f"{stem}/mod.rs")
            if hit:
                return hit
        # Nothing deeper matched, so the path names an item in the module at
        # `base` itself (`use super::Conn` -> the parent module file).
        if not base:
            return None
        return self._file(f"{base}.rs") or self._file(f"{base}/mod.rs") or self._file(f"{base}/lib.rs")

    def _rust(self, importer: str, ref: ImportRef) -> str | None:
        if ref.spec.startswith("mod:"):
            return self._rust_find(self._rust_module_dir(importer), [ref.spec[4:]])
        parts = ref.spec.split("::")
        head, rest = parts[0], parts[1:]
        if head == "crate":
            return self._rust_find(self._crate_root(importer), rest)
        if head == "self":
            return self._rust_find(self._rust_module_dir(importer), rest)
        if head == "super":
            base = posixpath.dirname(self._rust_module_dir(importer))
            while rest and rest[0] == "super":
                base, rest = posixpath.dirname(base), rest[1:]
            return self._rust_find(base, rest)
        return None

    def _dotted(self, importer: str, ref: ImportRef) -> str | None:
        # com.foo.Bar -> .../com/foo/Bar.java. Static imports name a member,
        # so drop trailing parts until something matches. Two parts minimum,
        # a bare class name alone matches too much.
        parts = tuple(p for p in ref.spec.rstrip(".*").split(".") if p)
        while len(parts) >= 2:
            hits = self._suffix.get(parts[-5:])
            if hits:
                return self._pick(importer, hits)
            parts = parts[:-1]
        return None

    _java = _dotted
    _kotlin = _dotted
    _scala = _dotted

    def _c(self, importer: str, ref: ImportRef) -> str | None:
        local = posixpath.normpath(posixpath.join(posixpath.dirname(importer), ref.spec))
        if local in self.known:
            return local
        parts = _stem_parts(ref.spec)
        hits = [h for h in self._suffix.get(parts, []) if PurePosixPath(h).suffix == PurePosixPath(ref.spec).suffix]
        return self._pick(importer, hits)

    _cpp = _c

    def _ruby(self, importer: str, ref: ImportRef) -> str | None:
        spec = ref.spec if ref.spec.endswith(".rb") else ref.spec + ".rb"
        if spec.startswith("."):
            return self._file(posixpath.normpath(posixpath.join(posixpath.dirname(importer), spec)))
        return self._file(f"lib/{spec}") or self._pick(importer, self._suffix.get(_stem_parts(spec), []))


def go_module(go_mod_text: str | None) -> str | None:
    if not go_mod_text:
        return None
    m = re.search(r"^module\s+(\S+)", go_mod_text, re.M)
    return m.group(1).strip('"') if m else None
