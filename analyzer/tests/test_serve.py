"""headcrawl play: the little server in front of the game."""

import json
import threading
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from headcrawl import serve
from headcrawl.build import analyze

from .conftest import write_files


def test_serves_the_game_with_the_new_dungeon_first(tmp_path: Path) -> None:
    write_files(tmp_path / "repo", {"src/a.py": "def a(x):\n    if x:\n        return 1\n    return 2\n"})
    spec = analyze(tmp_path / "repo", name="My Repo!")
    site = tmp_path / "site"
    write_files(site, {"index.html": "<!doctype html>", "dungeons/index.json": json.dumps([{"slug": "flask"}])})
    slug = serve.slug_for(spec)
    assert slug == "yours-my-repo"
    handler = type(
        "H",
        (serve._Handler,),
        {"slug": slug, "body": spec.model_dump_json().encode(), "entry": serve.entry_for(spec, slug)},
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(handler, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        index = json.loads(urllib.request.urlopen(f"{base}/dungeons/index.json").read())
        assert [e["slug"] for e in index] == [slug, "flask"]
        assert index[0]["boss"] == spec.floors[-1].boss.name
        body = json.loads(urllib.request.urlopen(f"{base}/dungeons/{slug}.json").read())
        assert body["repo"]["name"] == "My Repo!"
        assert urllib.request.urlopen(f"{base}/index.html").read() == b"<!doctype html>"
    finally:
        server.shutdown()


def test_finds_the_game_files() -> None:
    found = serve.game_dir()
    assert found is None or (found / "index.html").is_file()
