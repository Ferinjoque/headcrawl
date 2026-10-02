import subprocess
from collections.abc import Callable
from pathlib import Path

import pytest


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
    )


def write_files(root: Path, files: dict[str, str | bytes]) -> None:
    for rel, body in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(body, bytes):
            p.write_bytes(body)
        else:
            p.write_text(body, encoding="utf-8")


MakeRepo = Callable[..., Path]


@pytest.fixture
def make_repo(tmp_path: Path) -> MakeRepo:
    """Build a throwaway git repo. Each dict in `commits` is one commit."""
    counter = iter(range(1000))

    def make(*commits: dict[str, str | bytes], git: bool = True) -> Path:
        root = tmp_path / f"repo{next(counter)}"
        root.mkdir()
        if git:
            _git(root, "init", "-q", "-b", "main")
        for i, files in enumerate(commits):
            write_files(root, files)
            if git:
                _git(root, "add", "-A")
                _git(root, "commit", "-q", "-m", f"c{i}", "--date", f"2024-01-0{(i % 9) + 1}T00:00:00")
        return root

    return make


SAMPLE = {
    "app/main.py": '"""Entry point for the sample app."""\nfrom app.core import engine\nfrom .util import helper\n\n'
    "def run(a, b, c, d, e):\n    # TODO: handle errors here\n    if a:\n        for x in b:\n"
    "            if x:\n                while c:\n                    if d:\n                        return e\n"
    "    return helper(a)\n",
    "app/util.py": "def helper(x):\n    return x  # FIXME this is wrong\n\ns = 'TODO not a comment'\n",
    "app/core/engine.py": "import os\n\nclass Engine:\n    def start(self, n):\n        if n > 1:\n"
    "            return 1\n        elif n < 0:\n            return 2\n        return 3\n\n"
    "    def stop(self):\n        pass\n",
    "app/core/__init__.py": "",
    "web/index.js": "const api = require('./api');\nimport { x } from './lib/x';\n// HACK: global state\n"
    "export function boot(a) { if (a) { return api(a); } return x; }\n",
    "web/api.js": "module.exports = function api(a) { for (const k of a) { if (k) return k; } };\n",
    "web/lib/x.js": "export const x = 1;\nexport function y(a, b) { return a && b ? 1 : 2; }\n",
    "tests/test_main.py": "from app.main import run\n\ndef test_run():\n    assert run(0, [], 0, 0, 0) is not None\n",
    "README.md": "# sample\n",
}
