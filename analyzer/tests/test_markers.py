from headcrawl import gitio
from headcrawl.markers import conflict_hunks, is_deprecated


def lines(text: str) -> list[str]:
    return text.strip("\n").splitlines()


def test_deprecated_in_every_spelling() -> None:
    cases = {
        "python decorator": "@deprecated('use run')\ndef go():\n    pass",
        "python warning": "def go():\n    warnings.warn('old', DeprecationWarning)\n    return 1",
        "sphinx": 'def go():\n    """Do it.\n\n    .. deprecated:: 2.0\n    """',
        "jsdoc": "/**\n * @deprecated use run\n */\nfunction go() {}",
        "java": "@Deprecated\npublic void go() {}",
        "rust": '#[deprecated(note = "x")]\nfn go() {}',
        "csharp": '[Obsolete("x")]\npublic void Go() {}',
        "go": "// Deprecated: use Run.\nfunc Go() {}",
        "swift": '@available(*, deprecated, message: "x")\nfunc go() {}',
    }
    for name, text in cases.items():
        ls = lines(text)
        start = next(
            i
            for i, line in enumerate(ls, 1)
            if any(k in line for k in ("def ", "function ", "void ", "fn ", "func ", "Go()"))
        )
        assert is_deprecated(ls, start, len(ls)), name


def test_not_deprecated_when_the_marker_belongs_to_the_function_above() -> None:
    ls = lines("@deprecated\ndef old():\n    return 1\n\ndef new():\n    return 2")
    assert is_deprecated(ls, 2, 3)
    assert not is_deprecated(ls, 5, 6)
    assert not is_deprecated(ls, 0, 1)


def test_conflict_hunks_need_all_three_markers_in_order() -> None:
    text = "a\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\nb\n"
    assert conflict_hunks(text) == 1
    assert conflict_hunks(text * 2) == 2
    assert conflict_hunks("<<<<<<< HEAD\nno split\n>>>>>>> x\n") == 0
    assert conflict_hunks('s = "<<<<<<< HEAD"\n') == 0


def test_branch_picking_skips_bots_and_the_current_branch() -> None:
    sha = "a" * 40
    rows = [
        ("main", sha),
        ("dependabot/npm/x", sha),
        ("feature/login", sha),
        ("gh-pages", sha),
        ("bad name!", sha),
        ("fix/typo", "nope"),
    ]
    assert gitio._pick_branches(rows, "main", 8) == [("feature/login", sha)]
