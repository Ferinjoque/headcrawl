"""walk, metrics, syntax, languages."""

import os
from pathlib import Path

import pytest

from headcrawl.languages import detect, is_test_path
from headcrawl.limits import Limits
from headcrawl.metrics import measure
from headcrawl.syntax import extract
from headcrawl.walk import walk

from .conftest import MakeRepo


def _lang(path: str):  # type: ignore[no-untyped-def]
    lang = detect(path)
    assert lang is not None
    return lang


def test_walk_skips_the_junk(make_repo: MakeRepo) -> None:
    root = make_repo(
        {
            "src/a.py": "def f():\n    return 1\n",
            "src/big.py": "x = 1\n" * 200_000,
            "src/bin.py": b"\x00\x01\x02binary",
            "src/app.min.js": "var a=1;" * 200,
            "node_modules/lib/index.js": "module.exports = 1\n",
            "vendor/x.go": "package x\n",
            "src/notes.txt": "hello\n",
            "src/empty.py": "   \n",
            "src/wide.js": ("x" * 2000 + "\n") * 3,
        }
    )
    result = walk(root)
    assert [f.path for f in result.files] == ["src/a.py"]
    assert result.skipped >= 5


@pytest.mark.skipif(os.name == "nt", reason="symlinks need admin rights on Windows")
def test_walk_skips_symlinks(make_repo: MakeRepo, tmp_path: Path) -> None:
    secret = tmp_path / "secret.py"
    secret.write_text("password = 1\n")
    root = make_repo({"a.py": "x = 1\n"}, git=False)
    (root / "link.py").symlink_to(secret)
    assert [f.path for f in walk(root).files] == ["a.py"]


def test_walk_without_git_and_file_cap(make_repo: MakeRepo) -> None:
    root = make_repo({f"m{i}.py": "x = 1\n" for i in range(5)} | {".hidden/z.py": "x = 2\n"}, git=False)
    result = walk(root, Limits(max_files=3))
    assert [f.path for f in result.files] == ["m0.py", "m1.py", "m2.py"]
    assert result.skipped == 2


def test_measure_nesting_and_params() -> None:
    src = (
        "def f(a, b, c):\n    for i in a:\n        if i:\n            while b:\n                if c:\n"
        "                    return 1\n    return 0\n"
    )
    m = measure("x.py", src)
    (f,) = m.functions
    assert (f.name, f.ccn, f.params, f.nesting) == ("f", 5, 3, 4)
    assert m.nloc == 7


def test_tags_only_from_comments() -> None:
    src = "# TODO: real one\ns = 'TODO: fake'\nx = 1  # FIXME(bob): also real\n# HACK\n"
    info = extract(_lang("a.py"), src)
    assert [(t.kind, t.text, t.line) for t in info.tags] == [
        ("TODO", "real one", 1),
        ("FIXME", "also real", 3),
        ("HACK", "", 4),
    ]


def test_multiline_comment_tag_lines() -> None:
    src = "/*\n * intro\n * XXX: careful\n */\nint main() { return 0; }\n"
    info = extract(_lang("a.c"), src)
    assert [(t.kind, t.text, t.line) for t in info.tags] == [("XXX", "careful", 3)]


def test_blurbs() -> None:
    assert extract(_lang("a.py"), '"""Parses the thing. More."""\nx = 1\n').blurb == "Parses the thing."
    go = "// Copyright 2020 The Authors\n// Package x reads config files.\npackage x\n"
    assert extract(_lang("a.go"), go).blurb == "Package x reads config files."
    assert extract(_lang("a.py"), "x = 1\n").blurb is None


@pytest.mark.parametrize(
    ("path", "src", "expected"),
    [
        (
            "a.py",
            "import os, a.b as c\nfrom ..p.q import (r, s)\nfrom . import x\n",
            [("os", 0, ()), ("a.b", 0, ()), ("p.q", 2, ("r", "s")), ("", 1, ("x",))],
        ),
        (
            "a.ts",
            "import t from './t';\nexport * from './re';\nconst a = require('./x');\n"
            "const l = import('./lazy');\nconst n = require(name);\n",
            [("./t", 0, ()), ("./re", 0, ()), ("./x", 0, ()), ("./lazy", 0, ())],
        ),
        (
            "a.go",
            'package x\nimport (\n "fmt"\n "example.com/m/util"\n)\n',
            [("fmt", 0, ()), ("example.com/m/util", 0, ())],
        ),
        (
            "a.rs",
            "use crate::{a, b::c};\nuse super::x;\nmod baz;\nmod inline { }\n",
            [("crate::a", 0, ()), ("crate::b::c", 0, ()), ("crate", 0, ()), ("super::x", 0, ()), ("mod:baz", 0, ())],
        ),
        ("A.java", "package p;\nimport com.foo.Bar;\nclass A {}\n", [("com.foo.Bar", 0, ())]),
        ("a.c", '#include "util.h"\n#include <stdio.h>\n', [("util.h", 0, ())]),
        ("a.rb", "require 'json'\nrequire_relative 'lib/x'\n", [("json", 0, ()), ("./lib/x", 0, ())]),
        ("a.lua", "local x = require('y')\n", []),
    ],
)
def test_imports(path: str, src: str, expected: list[tuple[str, int, tuple[str, ...]]]) -> None:
    refs = extract(_lang(path), src).imports
    assert [(r.spec, r.level, r.names) for r in refs] == expected


def test_language_detection() -> None:
    assert _lang("x.tsx").grammar == "tsx"
    assert _lang("x.TS").name == "typescript"
    assert detect("README.md") is None


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("tests/a.py", True),
        ("pkg/test_a.py", True),
        ("pkg/a_test.go", True),
        ("src/a.spec.ts", True),
        ("src/FooTest.java", True),
        ("src/contest.py", False),
        ("src/testing_utils_impl.rs", False),
        ("latest/x.py", False),
    ],
)
def test_is_test_path(path: str, expected: bool) -> None:
    assert is_test_path(path) is expected
