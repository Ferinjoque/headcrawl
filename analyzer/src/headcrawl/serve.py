"""`headcrawl play`: build a dungeon and open it in the bundled game.

The game is a static site. A packaged install carries a copy of it inside
the package (headcrawl/game_dist, put there by scripts/bundle-game.sh); a
source checkout uses game/dist. The server only listens on 127.0.0.1 and
adds the new dungeon to the gallery it serves, so the game needs no changes.
"""

import functools
import http.server
import json
import mimetypes
import re
import webbrowser
from pathlib import Path
from typing import Any

from .models import DungeonSpec

mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")

PACKAGED = Path(__file__).resolve().parent / "game_dist"
CHECKOUT = Path(__file__).resolve().parents[3] / "game" / "dist"


def game_dir() -> Path | None:
    for d in (PACKAGED, CHECKOUT):
        if (d / "index.html").is_file():
            return d
    return None


def slug_for(spec: DungeonSpec) -> str:
    base = re.sub(r"[^a-z0-9._-]+", "-", spec.repo.name.lower()).strip("-.") or "repo"
    return f"yours-{base}"[:60]


def entry_for(spec: DungeonSpec, slug: str) -> dict[str, Any]:
    return {
        "slug": slug,
        "repo": spec.repo.name,
        "head": spec.repo.head,
        "language": spec.repo.languages[0].name if spec.repo.languages else "code",
        "floors": len(spec.floors),
        "rooms": spec.totals.rooms,
        "enemies": spec.totals.enemies,
        "boss": spec.floors[-1].boss.name,
    }


class _Handler(http.server.SimpleHTTPRequestHandler):
    """Static files, plus the one dungeon we just built."""

    slug = ""
    body = b""
    entry: dict[str, Any] = {}

    def do_GET(self) -> None:  # noqa: N802 - the stdlib's name
        path = self.path.split("?", 1)[0]
        if path == f"/dungeons/{self.slug}.json":
            return self._send(self.body)
        if path == "/dungeons/index.json":
            index = Path(self.directory) / "dungeons" / "index.json"
            try:
                gallery = json.loads(index.read_text("utf-8")) if index.is_file() else []
            except ValueError:
                gallery = []
            listed = [self.entry, *(e for e in gallery if e.get("slug") != self.slug)]
            return self._send(json.dumps(listed).encode())
        return super().do_GET()

    def _send(self, data: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args: Any) -> None:
        pass


def serve(spec: DungeonSpec, port: int = 0, open_browser: bool = True) -> None:
    root = game_dir()
    if root is None:
        raise FileNotFoundError("no game files found: run scripts/bundle-game.sh, or npm run build in game/")
    slug = slug_for(spec)
    handler = type(
        "Handler",
        (_Handler,),
        {"slug": slug, "body": spec.model_dump_json(exclude_none=True).encode(), "entry": entry_for(spec, slug)},
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(handler, directory=str(root)))
    url = f"http://127.0.0.1:{server.server_address[1]}/#/play/{slug}"
    print(f"{spec.repo.name} is at {url}  (Ctrl+C to stop)", flush=True)
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
