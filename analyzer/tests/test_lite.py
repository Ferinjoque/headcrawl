"""The lite backend must agree with tree-sitter on the things the game uses."""

import pytest

from headcrawl import lite, syntax
from headcrawl.build import analyze
from headcrawl.languages import detect

from .conftest import SAMPLE, MakeRepo
from .test_files import IMPORT_CASES


def _lang(path: str):  # type: ignore[no-untyped-def]
    lang = detect(path)
    assert lang is not None
    return lang


@pytest.mark.parametrize(("path", "src", "expected"), IMPORT_CASES)
def test_imports_match_tree_sitter(path: str, src: str, expected: list[tuple[str, int, tuple[str, ...]]]) -> None:
    refs = lite.extract(_lang(path), src).imports
    assert sorted((r.spec, r.level, r.names) for r in refs) == sorted(expected)


def test_tags_skip_strings_in_every_family() -> None:
    cases = {
        "a.py": 's = \'TODO: no\'\nt = """\nTODO: no\n"""\n# TODO: yes\n',
        "a.js": "const s = 'TODO: no'; const t = `\nTODO: no`; // TODO: yes\n",
        "a.rs": "fn f<'a>(x: &'a str) { let c = 'x'; } // TODO: yes\nlet s = \"TODO: no\";\n",
        "a.c": 'char *s = "/* TODO: no */"; /* TODO: yes */\n',
        "a.rb": "s = '# TODO: no'\n# TODO: yes\n",
        "a.lua": "local s = '-- TODO: no'\n-- TODO: yes\n",
    }
    for path, src in cases.items():
        tags = lite.extract(_lang(path), src).tags
        assert [t.text for t in tags] == ["yes"], path


def test_tag_lines_and_blurbs() -> None:
    info = lite.extract(_lang("a.py"), '"""Parses the thing. More."""\n\nx = 1\n# FIXME(bob): later\n')
    assert info.blurb == "Parses the thing."
    assert [(t.kind, t.text, t.line) for t in info.tags] == [("FIXME", "later", 4)]
    go = "// Copyright 2020 The Authors\n// Package x reads config files.\npackage x\n"
    assert lite.extract(_lang("a.go"), go).blurb == "Package x reads config files."
    multi = "/*\n * intro\n * XXX: careful\n */\nint main() { return 0; }\n"
    assert [(t.kind, t.line) for t in lite.extract(_lang("a.c"), multi).tags] == [("XXX", 3)]


def test_unterminated_things_do_not_hang() -> None:
    for path in ("a.py", "a.js", "a.c", "a.lua", "a.rb"):
        lite.extract(_lang(path), 'x = \'oops\n/* never closed\n""" also\n')


def test_whole_analysis_runs_on_lite(make_repo: MakeRepo, monkeypatch: pytest.MonkeyPatch) -> None:
    root = make_repo(SAMPLE)
    full = analyze(root)
    monkeypatch.setattr(syntax, "BACKEND", "lite")
    light = analyze(root)
    tags = lambda s: sorted(item.text for f in s.floors for r in f.rooms for item in r.loot)  # noqa: E731
    assert tags(light) == tags(full)
    edges = lambda s: sum(len(f.edges) for f in s.floors)  # noqa: E731
    assert edges(light) == edges(full)


HOSTILE = {
    "py-blank-lines": ("a.py", "\n" * 5000 + "x = 1\n"),
    "py-space-lines": ("a.py", " \n" * 5000 + "x = 1\n"),
    "py-open-from": ("a.py", "from x import (\n" * 20000),
    "go-blank-lines": ("a.go", "\n" * 60000 + "package x\n"),
    "go-open-import": ("a.go", "import (\n" * 20000),
    "rust-open-use": ("a.rs", "use a::{\n" * 20000),
    "rust-pub": ("a.rs", "pub(" * 20000),
    "js-import-no-quote": ("a.js", "import x " * 30000),
    "java-space-lines": ("a.java", " \n" * 60000),
    "c-bad-include": ("a.c", "#include \n" * 40000),
    "ruby-open-require": ("a.rb", "require (\n" * 40000),
}


@pytest.mark.parametrize("case", list(HOSTILE))
def test_hostile_files_stay_fast(case: str) -> None:
    import time

    path, src = HOSTILE[case]
    started = time.perf_counter()
    lite.extract(_lang(path), src)
    assert time.perf_counter() - started < 2.0
