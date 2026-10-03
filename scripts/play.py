"""Serve the unzipped game on localhost and open it in the browser.

Ships inside the release zip: `python play.py` from the headcrawl folder.
Only listens on 127.0.0.1. Ctrl+C stops it.
"""

import functools
import http.server
import mimetypes
import pathlib
import webbrowser

# Older Pythons on Windows read MIME types from the registry and may not
# know these, and browsers refuse wasm and module scripts served as text.
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")

here = pathlib.Path(__file__).resolve().parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(here))
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
url = f"http://127.0.0.1:{server.server_address[1]}/"
print(f"HEADCRAWL is at {url}  (Ctrl+C to stop)")
webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
