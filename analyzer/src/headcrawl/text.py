"""Cleaning strings that come from the repo before they go into the spec.

Everything here is attacker-controlled: file names, comments, function names.
The game never treats them as HTML, but we still strip control characters and
cap lengths so a weird repo can't blow up the UI or the JSON size.
"""

import re
import unicodedata

_SPACES = re.compile(r"\s+")

# Cc: control chars. Cf: invisible format chars (bidi overrides, zero width,
# BOM, tags). Co/Cs/Cn: private use, lone surrogates, unassigned.
_DROP = {"Cc", "Cf", "Co", "Cs", "Cn"}


def clean(value: str, limit: int = 120) -> str:
    value = unicodedata.normalize("NFC", value)
    value = "".join(
        " " if ch in "\t\n\r" else ch for ch in value if ch in "\t\n\r" or unicodedata.category(ch) not in _DROP
    )
    value = _SPACES.sub(" ", value).strip()
    if len(value) > limit:
        value = value[: limit - 1].rstrip() + "…"
    return value


_COMMENT_MARKERS = re.compile(r"^\s*(?:#+|//+|/\*+|\*+/?|--+|;+|<!--|\"\"\"|''')\s*|\s*(?:\*/|-->|\"\"\"|''')\s*$")


def strip_comment_markers(text: str) -> str:
    lines = [_COMMENT_MARKERS.sub("", line) for line in text.splitlines()]
    return " ".join(line for line in lines if line)


_RULES = re.compile(r"[^\w\s]{3,}")


def first_sentence(text: str, limit: int = 160) -> str:
    """First sentence of a comment or docstring, or "" if it is just decoration."""
    text = clean(_RULES.sub(" ", strip_comment_markers(text)), limit=1000)
    match = re.search(r"(?<=[.!?])\s", text)
    if match:
        text = text[: match.start()]
    if len(re.findall(r"[A-Za-z]{2,}", text)) < 3:
        return ""
    return clean(text, limit)


_DOC_OPEN = re.compile(r"^\s*[rRbBuU]?(\"\"\"|''')")
_COMMENT_LINE = re.compile(r"^\s*(?:#(?!\[)|//|/\*|\*|--|;)")
_ATTRIBUTE = re.compile(r"^\s*(?:@\w|#\[)")
_TAG_WORD = re.compile(r"\b(?:TODO|FIXME|HACK|XXX)\b")


def function_doc(lines: list[str], start_line: int, limit: int = 140) -> str:
    """What the author says a function does: the first sentence of its Python
    docstring, or of the comment block right above it (past decorators).
    "" when there is none, or when it is a tag, a license or decoration."""
    at = max(0, start_line - 1)
    if at >= len(lines):
        return ""
    # A docstring is the first thing after the signature, which may span lines.
    end = next((k for k in range(at, min(len(lines), at + 8)) if lines[k].rstrip().endswith((":", "{"))), at)
    after = next((k for k in range(end + 1, min(len(lines), end + 3)) if lines[k].strip()), None)
    for i in [after] if after is not None else []:
        m = _DOC_OPEN.match(lines[i])
        if m:
            quote = m.group(1)
            block = [lines[i]]
            if lines[i].count(quote) < 2:
                for j in range(i + 1, min(len(lines), i + 12)):
                    block.append(lines[j])
                    if quote in lines[j]:
                        break
            return _doc_sentence("\n".join(block), limit)
    above: list[str] = []
    i = at - 1
    while i >= 0 and _ATTRIBUTE.match(lines[i]):
        i -= 1
    while i >= 0 and _COMMENT_LINE.match(lines[i]):
        above.insert(0, lines[i])
        i -= 1
    return _doc_sentence("\n".join(above), limit) if above else ""


def _doc_sentence(text: str, limit: int) -> str:
    if _TAG_WORD.search(text) or legal_text(text):
        return ""
    return first_sentence(text, limit)


_LEGAL_WORDS = re.compile(r"(?i)\b(copyright|license|licensed|spdx|all rights reserved)\b")


def legal_text(text: str) -> bool:
    return bool(_LEGAL_WORDS.search(text))


def code_excerpt(text: str, start_line: int, count: int = 6, width: int = 72) -> list[str]:
    """The first few lines of a function, as it reads in the file.

    Unlike clean(), this keeps indentation: it is shown as code. Shared
    indentation is taken off, tabs become four spaces, blank edges go.
    """
    lines = text.splitlines()[max(0, start_line - 1) : max(0, start_line - 1) + count]
    kept = []
    for raw in lines:
        line = "".join(ch for ch in raw.expandtabs(4) if unicodedata.category(ch) not in _DROP).rstrip()
        kept.append(line)
    while kept and not kept[-1].strip():
        kept.pop()
    indents = [len(line) - len(line.lstrip(" ")) for line in kept if line.strip()]
    cut = min(indents, default=0)
    out = [line[cut:] for line in kept]
    return [line if len(line) <= width else line[: width - 1].rstrip() + "…" for line in out]
