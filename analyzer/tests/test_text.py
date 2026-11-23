from hypothesis import given
from hypothesis import strategies as st

from headcrawl.text import clean, code_excerpt, first_sentence, function_doc, strip_comment_markers


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


def test_code_excerpt_keeps_indentation_and_drops_shared_indent() -> None:
    text = "x = 1\n    def run(self):\n\tif a:\n            go()\n\n"
    assert code_excerpt(text, 2) == ["def run(self):", "if a:", "        go()"]


def test_code_excerpt_caps_width_and_strips_controls() -> None:
    text = "def f():\n    return '" + "a" * 100 + "\u202e'\n"
    lines = code_excerpt(text, 1, width=20)
    assert lines[0] == "def f():"
    assert len(lines[1]) == 20 and lines[1].endswith("…")
    assert all("\u202e" not in line for line in code_excerpt("a\u202eb", 1))


@given(st.text(max_size=400), st.integers(min_value=1, max_value=50))
def test_code_excerpt_never_overflows(text: str, start: int) -> None:
    lines = code_excerpt(text, start)
    assert len(lines) <= 6
    assert all(len(line) <= 72 for line in lines)


def test_function_doc_reads_a_python_docstring() -> None:
    lines = ["def load_payload(payload):", '    """Loads the encoded object.', "", '    More text."""', "    return x"]
    assert function_doc(lines, 1) == "Loads the encoded object."


def test_function_doc_reads_a_one_line_docstring_after_a_long_signature() -> None:
    lines = ["def f(", "    a,", "    b,", "):", "    '''Adds a and b together.'''", "    return a + b"]
    assert function_doc(lines, 1) == "Adds a and b together."


def test_function_doc_reads_the_comment_block_above_past_decorators() -> None:
    lines = [
        "// Parses the request body as JSON.",
        "// Returns an error when it fails.",
        "@Override",
        "func parseBody() {",
        "}",
    ]
    assert function_doc(lines, 4) == "Parses the request body as JSON."


def test_function_doc_skips_tags_licenses_and_decoration() -> None:
    assert function_doc(["# TODO: fix this later please", "def a():", "    pass"], 2) == ""
    assert function_doc(["# ------------------", "def a():", "    pass"], 2) == ""
    assert function_doc(["x = 1", "", "def a():", "    pass"], 3) == ""
    assert function_doc([], 1) == ""
