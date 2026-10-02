"""What we pull out of the syntax tree: tagged comments, a module blurb, imports.

Tags only count inside real comment nodes, so a string like "TODO" in code
never becomes loot. Where tree-sitter-language-pack isn't installed (the
browser build), lite.py does the same job with a small lexer.
"""

import re
from dataclasses import dataclass
from typing import Any

try:
    import tree_sitter_language_pack as tslp
except ImportError:  # pragma: no cover - only on Pyodide
    tslp = None  # type: ignore[assignment]

from .languages import Language
from .text import clean, first_sentence, strip_comment_markers

TAGS = ("TODO", "FIXME", "HACK", "XXX")
# TODO, TODO: x, TODO(bob): x, FIXME - x
_TAG = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b(?:\([^)]*\))?[:\s-]*(.*)")
# License headers often span lines, and each line is its own comment, so match
# the opening lines too ("Use of this source code is governed by...").
_LEGAL = re.compile(
    r"copyright|license|licence|spdx|all rights reserved|governed by|use of this source|permission is hereby|"
    r"licensed under|warranty|redistribution",
    re.I,
)


@dataclass(frozen=True)
class Tag:
    kind: str
    text: str
    line: int


@dataclass(frozen=True)
class ImportRef:
    spec: str
    level: int = 0
    names: tuple[str, ...] = ()


@dataclass(frozen=True)
class SyntaxInfo:
    tags: tuple[Tag, ...]
    blurb: str | None
    imports: tuple[ImportRef, ...]
    parse_errors: int


def tag_in(raw: str, line: int) -> Tag | None:
    m = _TAG.search(raw)
    if not m:
        return None
    return Tag(kind=m.group(1), text=clean(strip_comment_markers(m.group(2)), 120), line=line)


def legal_header(text: str) -> bool:
    return bool(_LEGAL.search(text))


def _tags(comments: list[Any]) -> list[Tag]:
    found = []
    for c in comments:
        for offset, raw in enumerate(c.text.splitlines()):
            tag = tag_in(raw, c.span.start_line + 1 + offset)
            if tag:
                found.append(tag)
    return found


def _blurb(lang: Language, result: Any) -> str | None:
    if lang.name == "python":
        for d in result.docstrings:
            if d.span.start_line <= 2:
                text = first_sentence(d.text)
                return text or None
    for c in result.comments:
        if c.span.start_line > 3:
            break
        if not _LEGAL.search(c.text):
            text = first_sentence(c.text)
            if len(text) > 8:
                return text
    return None


_PY_FROM = re.compile(r"^from\s+(\.*)\s*([\w.]*)\s+import\b")


def _python_imports(result: Any) -> list[ImportRef]:
    refs = []
    for imp in result.imports:
        stmt = imp.source.strip()
        m = _PY_FROM.match(stmt)
        if m:
            refs.append(ImportRef(spec=m.group(2), level=len(m.group(1)), names=tuple(imp.items)))
        else:
            refs.extend(ImportRef(spec=item) for item in imp.items)
    return refs


_RUST_USE = re.compile(r"^(?:pub(?:\([^)]*\))?\s+)?use\s+([\w:]+?)(?:::\{(.*)\})?\s*(?:as\s+\w+)?;$", re.S)


def _rust_imports(result: Any, root: Any) -> list[ImportRef]:
    refs = []
    for imp in result.imports:
        m = _RUST_USE.match(imp.source.strip())
        if not m:
            continue
        base, group = m.group(1), m.group(2)
        if group:
            for item in group.split(","):
                item = item.strip().split(" as ")[0].strip("{} ")
                if item and item != "self":
                    refs.append(ImportRef(spec=f"{base}::{item}"))
        refs.append(ImportRef(spec=base))
    for node in _iter(root):
        if node.type == "mod_item" and node.child_by_field_name("body") is None:
            name = node.child_by_field_name("name")
            if name is not None:
                refs.append(ImportRef(spec=f"mod:{_text(name)}"))
    return refs


def _iter(node: Any) -> Any:
    stack = [node]
    while stack:
        cur = stack.pop()
        yield cur
        stack.extend(reversed(cur.children))


def _text(node: Any) -> str:
    return bytes(node.text).decode("utf-8", "replace")


def _string_value(node: Any) -> str | None:
    if node is None:
        return None
    if node.type in ("string", "string_literal", "interpreted_string_literal"):
        for child in node.children:
            if child.type in ("string_fragment", "string_content"):
                return _text(child)
        raw = _text(node)
        return raw[1:-1] if len(raw) >= 2 else None
    return None


def _js_imports(root: Any) -> list[ImportRef]:
    refs = []
    for node in _iter(root):
        if node.type in ("import_statement", "export_statement"):
            spec = _string_value(node.child_by_field_name("source"))
            if spec:
                refs.append(ImportRef(spec=spec))
        elif node.type == "call_expression":
            fn = node.child_by_field_name("function")
            args = node.child_by_field_name("arguments")
            if fn is None or args is None:
                continue
            if fn.type == "import" or (fn.type == "identifier" and _text(fn) == "require"):
                named = [c for c in args.children if c.is_named]
                spec = _string_value(named[0]) if named else None
                if spec:
                    refs.append(ImportRef(spec=spec))
    return refs


def _c_imports(root: Any) -> list[ImportRef]:
    refs = []
    for node in _iter(root):
        if node.type == "preproc_include":
            path = node.child_by_field_name("path")
            if path is not None and path.type == "string_literal":
                spec = _string_value(path)
                if spec:
                    refs.append(ImportRef(spec=spec))
    return refs


def _ruby_imports(root: Any) -> list[ImportRef]:
    refs = []
    for node in _iter(root):
        if node.type != "call":
            continue
        method = node.child_by_field_name("method")
        args = node.child_by_field_name("arguments")
        if method is None or args is None or _text(method) not in ("require", "require_relative"):
            continue
        named = [c for c in args.children if c.is_named]
        if named and named[0].type == "string":
            spec = "".join(_text(c) for c in named[0].children if c.type == "string_content")
            prefix = "./" if _text(method) == "require_relative" else ""
            refs.append(ImportRef(spec=prefix + spec))
    return refs


def _simple_imports(result: Any) -> list[ImportRef]:
    refs = []
    for imp in result.imports:
        stmt = imp.source.strip().rstrip(";").strip()
        stmt = re.sub(r"^(import|using)\s+(static\s+)?", "", stmt).strip('"')
        if stmt:
            refs.append(ImportRef(spec=stmt))
    return refs


def _imports(lang: Language, text: str, result: Any) -> list[ImportRef]:
    name = lang.name
    if name == "python":
        return _python_imports(result)
    if name in ("go", "java", "kotlin", "csharp", "scala"):
        return _simple_imports(result)
    if name not in ("javascript", "typescript", "rust", "c", "cpp", "ruby"):
        return []
    root = tslp.get_parser(lang.grammar).parse(text.encode("utf-8")).root_node
    if name in ("javascript", "typescript"):
        return _js_imports(root)
    if name == "rust":
        return _rust_imports(result, root)
    if name == "ruby":
        return _ruby_imports(root)
    return _c_imports(root)


# "tree-sitter" when the language pack is installed, otherwise "lite".
BACKEND = "tree-sitter" if tslp is not None else "lite"


def extract(lang: Language, text: str) -> SyntaxInfo:
    if BACKEND == "lite" or tslp is None:
        from . import lite

        return lite.extract(lang, text)
    config = tslp.ProcessConfig(
        language=lang.grammar,
        imports=True,
        comments=True,
        docstrings=lang.name == "python",
        parse_timeout_ms=5000,
    )
    result = tslp.process(text, config)
    return SyntaxInfo(
        tags=tuple(_tags(result.comments)),
        blurb=_blurb(lang, result),
        imports=tuple(_imports(lang, text, result)),
        parse_errors=int(result.metrics.error_count) if result.metrics else 0,
    )


def prefetch(grammars: list[str]) -> None:
    if tslp is not None:
        tslp.download(grammars)
