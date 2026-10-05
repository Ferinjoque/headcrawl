"""Text markers the game turns into mechanics: deprecated functions and
leftover merge conflicts.

Both work on plain source text, so the tree-sitter backend and the browser's
lite backend find the same ones.
"""

import re

# How each language says "don't use this any more".
_DEPRECATED = re.compile(
    r"@[Dd]eprecated\b"  # JSDoc, PHPDoc, YARD, Java, Kotlin, Python 3.13 @deprecated
    r"|#\[deprecated"  # Rust
    r"|\[Obsolete"  # C#
    r"|^\s*(?://|#|\*)?\s*Deprecated:"  # Go's convention, and plain comments
    r"|\.\. deprecated::"  # Sphinx docstrings
    r"|DeprecationWarning"  # Python warnings.warn(..., DeprecationWarning)
    r"|@available\([^)]*deprecated"  # Swift
)
# Lines above a function that still belong to it: decorators, attributes, comments.
_LEAD = re.compile(r"^\s*(?:@|#|//|/\*|\*|\[|\"\"\"|'''|$)")
_ABOVE = 12
_BODY = 15


def is_deprecated(lines: list[str], start: int, end: int) -> bool:
    """`start` and `end` are 1-based, inclusive. Looks at the comments and
    decorators right above the function and the first lines of its body."""
    if start < 1 or start > len(lines):
        return False
    above: list[str] = []
    i = start - 2
    while i >= 0 and len(above) < _ABOVE and _LEAD.match(lines[i]):
        above.append(lines[i])
        i -= 1
    body = lines[start - 1 : min(end, start - 1 + _BODY)]
    return any(_DEPRECATED.search(line) for line in (*above, *body))


_OURS = re.compile(r"^<{7}(?: |$)")
_SPLIT = re.compile(r"^={7}$")
_THEIRS = re.compile(r"^>{7}(?: |$)")


def conflict_hunks(text: str) -> int:
    """Committed merge conflicts: <<<<<<<, then =======, then >>>>>>>, each at
    the start of a line, in that order."""
    hunks = 0
    state = 0
    for line in text.splitlines():
        if state == 0 and _OURS.match(line):
            state = 1
        elif state == 1 and _SPLIT.match(line):
            state = 2
        elif state == 2 and _THEIRS.match(line):
            hunks += 1
            state = 0
    return hunks
