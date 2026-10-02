"""Comments and imports without tree-sitter.

Used where the native grammars can't be installed, which today means the
browser build running on Pyodide. A small lexer walks the source, skips
string literals and collects comments, so a "TODO" inside a string still
doesn't count as loot. Imports come from regexes over the code with comments
removed. Less exact than the tree-sitter backend, and close enough for a game.
"""

import re
from dataclasses import dataclass

from .languages import Language
from .syntax import ImportRef, SyntaxInfo, Tag, legal_header, tag_in
from .text import first_sentence

_C_LIKE = {"javascript", "typescript", "go", "rust", "java", "kotlin", "c", "cpp", "csharp", "swift", "scala", "php"}
# Languages where ' always opens a string. Elsewhere it may be a char literal
# or a Rust lifetime, so it only counts when it closes right away.
_SINGLE_QUOTE_STRINGS = {"python", "javascript", "typescript", "ruby", "php", "lua"}
_CHAR_LITERAL = re.compile(r"'(?:\\.|[^\\'\n]){1,2}'")


@dataclass(frozen=True)
class Comment:
    text: str
    line: int  # 1-based


@dataclass(frozen=True)
class Scan:
    comments: list[Comment]
    code: str  # the source with comments blanked out, line numbers kept


def _blank(chunk: str) -> str:
    return "".join("\n" if ch == "\n" else " " for ch in chunk)


def scan(text: str, lang: str) -> Scan:  # noqa: C901 - one small state machine reads best in one place
    line_marks = (
        ("#",)
        if lang in ("python", "ruby")
        else ("--",)
        if lang == "lua"
        else ("//", "#")
        if lang == "php"
        else ("//",)
    )
    block = (
        ("/*", "*/")
        if lang in _C_LIKE
        else ("--[[", "]]")
        if lang == "lua"
        else ("=begin", "=end")
        if lang == "ruby"
        else None
    )
    comments: list[Comment] = []
    code: list[str] = []
    i = 0
    line = 1
    n = len(text)
    while i < n:
        ch = text[i]
        if block and text.startswith(block[0], i):
            end = text.find(block[1], i + len(block[0]))
            end = n if end == -1 else end + len(block[1])
            chunk = text[i:end]
            comments.append(Comment(chunk, line))
            code.append(_blank(chunk))
            line += chunk.count("\n")
            i = end
            continue
        mark = next((m for m in line_marks if text.startswith(m, i)), None)
        if mark:
            end = text.find("\n", i)
            end = n if end == -1 else end
            comments.append(Comment(text[i:end], line))
            code.append(" " * (end - i))
            i = end
            continue
        if ch in "\"'`":
            if ch == "'" and lang not in _SINGLE_QUOTE_STRINGS:
                m = _CHAR_LITERAL.match(text, i)
                if not m:
                    code.append(ch)
                    i += 1
                    continue
                code.append(m.group(0))
                i = m.end()
                continue
            triple = lang == "python" and text.startswith(ch * 3, i)
            quote = ch * 3 if triple else ch
            j = i + len(quote)
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text.startswith(quote, j):
                    j += len(quote)
                    break
                # Plain strings end at a newline in most languages; templates and triples don't.
                if text[j] == "\n" and not triple and ch != "`":
                    break
                j += 1
            chunk = text[i:j]
            code.append(chunk)
            line += chunk.count("\n")
            i = j
            continue
        if ch == "\n":
            line += 1
        code.append(ch)
        i += 1
    return Scan(comments, "".join(code))


def _tags(comments: list[Comment]) -> list[Tag]:
    found = []
    for c in comments:
        for offset, raw in enumerate(c.text.splitlines()):
            tag = tag_in(raw, c.line + offset)
            if tag:
                found.append(tag)
    return found


_PY_DOC = re.compile(r'\A(?:\s*#[^\n]*\n|\s*\n)*\s*[rRuU]?("""|\'\'\')(.*?)\1', re.S)


def _blurb(lang: Language, text: str, comments: list[Comment]) -> str | None:
    if lang.name == "python":
        m = _PY_DOC.match(text)
        if m and m.group(0).count("\n") <= 30:
            return first_sentence(m.group(2)) or None
    for c in comments:
        if c.line > 3:
            break
        if not legal_header(c.text):
            sentence = first_sentence(c.text)
            if len(sentence) > 8:
                return sentence
    return None


_PY_IMPORT = re.compile(
    r"^[ \t]*import[ \t]+([\w.]+(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[\w.]+(?:[ \t]+as[ \t]+\w+)?)*)", re.M
)
_PY_FROM = re.compile(r"^[ \t]*from[ \t]+(\.*)[ \t]*([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n]+)", re.M)
_JS = re.compile(
    r"""(?:\bimport\s[^'"`;]*?\bfrom\s*|\bexport\s[^'"`;]*?\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\1"""
)
_GO_SINGLE = re.compile(r'^\s*import\s+(?:\w+\s+)?"([^"]+)"', re.M)
_GO_BLOCK = re.compile(r"^\s*import\s*\((.*?)\)", re.M | re.S)
_GO_LINE = re.compile(r'"([^"]+)"')
_RUST_USE = re.compile(r"^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([\w:]+?)(?:::\{([^;]*)\})?\s*(?:as\s+\w+)?;", re.M | re.S)
_RUST_MOD = re.compile(r"^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;", re.M)
_JAVA = re.compile(r"^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;?", re.M)
_CSHARP = re.compile(r"^\s*using\s+(?:static\s+)?([\w.]+)\s*;", re.M)
_C_INCLUDE = re.compile(r'^\s*#\s*include\s+"([^"]+)"', re.M)
_RUBY = re.compile(r"""^\s*(require|require_relative)\s*\(?\s*['"]([^'"]+)['"]""", re.M)


def _imports(lang: str, code: str) -> list[ImportRef]:  # noqa: C901 - a flat list of languages
    refs: list[ImportRef] = []
    if lang == "python":
        for m in _PY_IMPORT.finditer(code):
            for part in m.group(1).split(","):
                name = part.strip().split()[0]
                if name:
                    refs.append(ImportRef(spec=name))
        for m in _PY_FROM.finditer(code):
            names = tuple(
                n.strip().split()[0] for n in m.group(3).strip("() \t").replace("\n", " ").split(",") if n.strip()
            )
            refs.append(ImportRef(spec=m.group(2), level=len(m.group(1)), names=names))
    elif lang in ("javascript", "typescript"):
        refs = [ImportRef(spec=m.group(2)) for m in _JS.finditer(code)]
    elif lang == "go":
        refs = [ImportRef(spec=m.group(1)) for m in _GO_SINGLE.finditer(code)]
        for block in _GO_BLOCK.finditer(code):
            refs.extend(ImportRef(spec=m.group(1)) for m in _GO_LINE.finditer(block.group(1)))
    elif lang == "rust":
        for m in _RUST_USE.finditer(code):
            base, group = m.group(1), m.group(2)
            if group:
                for item in group.split(","):
                    item = item.strip().split(" as ")[0].strip("{} \n")
                    if item and item != "self":
                        refs.append(ImportRef(spec=f"{base}::{item}"))
            refs.append(ImportRef(spec=base))
        refs.extend(ImportRef(spec=f"mod:{m.group(1)}") for m in _RUST_MOD.finditer(code))
    elif lang in ("java", "kotlin", "scala"):
        refs = [ImportRef(spec=m.group(1)) for m in _JAVA.finditer(code)]
    elif lang == "csharp":
        refs = [ImportRef(spec=m.group(1)) for m in _CSHARP.finditer(code)]
    elif lang in ("c", "cpp"):
        refs = [ImportRef(spec=m.group(1)) for m in _C_INCLUDE.finditer(code)]
    elif lang == "ruby":
        refs = [
            ImportRef(spec=("./" if m.group(1) == "require_relative" else "") + m.group(2))
            for m in _RUBY.finditer(code)
        ]
    return refs


def extract(lang: Language, text: str) -> SyntaxInfo:
    scanned = scan(text, lang.name)
    return SyntaxInfo(
        tags=tuple(_tags(scanned.comments)),
        blurb=_blurb(lang, text, scanned.comments),
        imports=tuple(_imports(lang.name, scanned.code)),
        parse_errors=0,
    )
