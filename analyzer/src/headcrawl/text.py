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
