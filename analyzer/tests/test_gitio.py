import os
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from headcrawl import gitio

from .conftest import MakeRepo, _git, write_files


@pytest.mark.parametrize(
    ("target", "expected"),
    [
        ("pallets/flask", "https://github.com/pallets/flask"),
        ("https://github.com/a/b", "https://github.com/a/b"),
        ("https://gitlab.com/group/sub/proj.git", "https://gitlab.com/group/sub/proj.git"),
    ],
)
def test_normalize_url_accepts(target: str, expected: str) -> None:
    assert gitio.normalize_url(target) == expected


@pytest.mark.parametrize(
    "target",
    [
        "file:///etc/passwd",
        "ssh://git@github.com/a/b",
        "git@github.com:a/b.git",
        "ext::sh -c touch% /tmp/pwned",
        "--upload-pack=touch /tmp/x",
        "-oProxyCommand=x/y",
        "http://github.com/a/b",
        "https://github.com/../../etc",
        "https://github.com//a",
        "a/b/c",
        "",
    ],
)
def test_normalize_url_rejects(target: str) -> None:
    with pytest.raises(gitio.GitError):
        gitio.normalize_url(target)


@given(st.text(max_size=80))
def test_normalize_url_only_returns_https(target: str) -> None:
    try:
        url = gitio.normalize_url(target)
    except gitio.GitError:
        return
    assert url.startswith("https://")
    assert " " not in url and not url.startswith("-")


def test_head_files_and_churn(make_repo: MakeRepo) -> None:
    root = make_repo({"a.py": "x = 1\n"}, {"a.py": "x = 2\n", "b.py": "y = 1\n"}, {"a.py": "x = 3\n"})
    head = gitio.head(root)
    assert len(head.sha) == 40 and head.branch == "main" and head.time > 0
    assert [t.path for t in gitio.tracked_files(root)] == ["a.py", "b.py"]
    churn = gitio.churn(root)
    assert churn["a.py"] == 3 and churn["b.py"] == 1
    assert gitio.commit_count(root) == 3
    assert gitio.is_repo(root)
    assert not gitio.is_repo(root / "nope")


def test_generated_paths(make_repo: MakeRepo) -> None:
    root = make_repo({".gitattributes": "gen.py linguist-generated\n", "gen.py": "a=1\n", "real.py": "b=1\n"})
    assert gitio.generated_paths(root, ["gen.py", "real.py"]) == {"gen.py"}
    assert gitio.generated_paths(root, []) == set()


def test_hooks_never_run(make_repo: MakeRepo, tmp_path: Path) -> None:
    root = make_repo({"a.py": "x = 1\n"})
    marker = tmp_path / "pwned"
    hook = root / ".git" / "hooks" / "post-checkout"
    hook.write_text(f"#!/bin/sh\necho hi > '{marker.as_posix()}'\n")
    hook.chmod(0o755)
    gitio.run(["checkout", "-q", "-b", "other"], cwd=root)
    assert not marker.exists()


def test_fsmonitor_config_is_ignored(make_repo: MakeRepo, tmp_path: Path) -> None:
    root = make_repo({"a.py": "x = 1\n"})
    marker = tmp_path / "fsmon"
    with open(root / ".git" / "config", "a") as fh:
        fh.write(f"[core]\n\tfsmonitor = \"echo x > '{marker.as_posix()}'\"\n")
    gitio.tracked_files(root)
    gitio.run(["status", "--porcelain"], cwd=root)
    assert not marker.exists()


def test_run_raises_on_failure(tmp_path: Path) -> None:
    with pytest.raises(gitio.GitError):
        gitio.run(["log"], cwd=tmp_path)


def test_clone_refuses_non_empty_target(tmp_path: Path) -> None:
    (tmp_path / "x").write_text("")
    with pytest.raises(gitio.GitError):
        gitio.clone("a/b", tmp_path)


def test_env_drops_inherited_git_vars(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GIT_DIR", "/somewhere")
    env = gitio._env()
    assert "GIT_DIR" not in env
    assert env["GIT_TERMINAL_PROMPT"] == "0"
    assert env["GIT_CONFIG_GLOBAL"] == os.devnull


def test_checkout_selected_only_takes_wanted_small_files(make_repo: MakeRepo, tmp_path: Path) -> None:
    import subprocess

    from headcrawl.limits import Limits

    src = make_repo({"a.py": "x = 1\n", "big.py": "y = 1\n" * 50_000, "notes.md": "hi\n", "go.mod": "module m\n"})
    dest = tmp_path / "clone"
    subprocess.run(["git", "clone", "-q", "--no-checkout", str(src), str(dest)], check=True, capture_output=True)
    picked = gitio.checkout_selected(dest, lambda p: p.endswith(".py"), Limits(max_file_bytes=1000))
    assert picked == 2
    assert sorted(p.name for p in dest.iterdir() if p.name != ".git") == ["a.py", "go.mod"]


def test_checkout_selected_refuses_huge_trees(make_repo: MakeRepo, tmp_path: Path) -> None:
    import subprocess

    from headcrawl.limits import Limits

    src = make_repo({f"f{i}.py": "x\n" for i in range(5)})
    dest = tmp_path / "clone"
    subprocess.run(["git", "clone", "-q", "--no-checkout", str(src), str(dest)], check=True, capture_output=True)
    with pytest.raises(gitio.GitError):
        gitio.checkout_selected(dest, lambda p: True, Limits(max_tree_entries=3))


def test_signature_config_is_ignored(make_repo: MakeRepo, tmp_path: Path) -> None:
    root = make_repo({"a.py": "x = 1\n"})
    marker = tmp_path / "gpg"
    with open(root / ".git" / "config", "a") as fh:
        fh.write(f"[log]\n\tshowSignature = true\n[gpg]\n\tprogram = \"sh -c 'echo x > {marker.as_posix()}'\"\n")
    gitio.head(root)
    gitio.churn(root)
    assert not marker.exists()


def test_blame_reads_commits_not_the_working_tree(make_repo: MakeRepo, tmp_path: Path) -> None:
    root = make_repo({"a.py": "# TODO: one\nx = 1\n", ".gitattributes": "*.py filter=evil\n"}, years=[2020])
    marker = tmp_path / "filtered"
    with open(root / ".git" / "config", "a") as fh:
        fh.write(f"[filter \"evil\"]\n\tclean = sh -c 'echo x > {marker.as_posix()}; cat'\n")
    (root / "a.py").write_text("# TODO: one\nx = 2\n")
    ages = gitio.line_years(root, "a.py", {1})
    assert ages[1].year == 2020
    assert gitio.last_subject(root, "a.py")
    assert not marker.exists()


def test_reverts_counts_revert_commits_per_file(make_repo: MakeRepo) -> None:
    root = make_repo({"a.py": "x = 1\n", "b.py": "y = 1\n"}, {"a.py": "x = 2\n"})
    write_files(root, {"a.py": "x = 1\n"})
    _git(root, "commit", "-qam", 'Revert "c1: touch things"')
    assert gitio.reverts(root) == {"a.py": 1}
    assert gitio.is_revert('Revert "x"') and not gitio.is_revert("Revert to the old parser")


def test_browser_builds_count_reverts_from_commit_lists() -> None:
    from headcrawl.build import _reverts

    rows = {"a.py": [("n", 'Revert "x"', "s", "d"), ("n", "fix", "s", "d")], "b.py": [("n", "fix", "s", "d")]}
    assert _reverts(rows) == {"a.py": 1}
