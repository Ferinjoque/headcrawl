from hypothesis import given
from hypothesis import strategies as st

from headcrawl.text import clean, first_sentence, strip_comment_markers


def test_clean_strips_control_and_invisible_chars() -> None:
    assert clean("a\x00b\x1b[31mc‮d") == "ab[31mcd"
    assert clean("﻿x​y⁠z\U000e0041") == "xyz"
    assert clean("tab\there\nnext") == "tab here next"


def test_clean_collapses_whitespace_and_caps_length() -> None:
    assert clean("  a \n\t b  ") == "a b"
    out = clean("x" * 500, limit=20)
    assert len(out) == 20 and out.endswith("…")


@given(st.text(), st.integers(min_value=2, max_value=300))
def test_clean_never_exceeds_limit_or_keeps_controls(value: str, limit: int) -> None:
    out = clean(value, limit)
    assert len(out) <= limit
    assert not any(ord(c) < 32 or 0x7F <= ord(c) <= 0x9F for c in out)
    assert not any(c in out for c in "‪‫‬‭‮⁦⁧⁨⁩​﻿")


def test_strip_comment_markers() -> None:
    assert strip_comment_markers("// hello") == "hello"
    assert strip_comment_markers("/* a\n * b\n */") == "a b"
    assert strip_comment_markers("# x") == "x"


def test_first_sentence() -> None:
    assert first_sentence('"""Load the config. Then more."""') == "Load the config."
    assert first_sentence("# -- Project -----------------------") == ""
    assert first_sentence("# ok") == ""
