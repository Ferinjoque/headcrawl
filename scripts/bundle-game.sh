#!/usr/bin/env bash
# Copies the built game into the Python package, so `headcrawl play` works
# from a pip or uvx install. The in-browser analyzer (pyodide, ~17 MB) stays
# out: with the command line tool you don't need it.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/analyzer/src/headcrawl/game_dist"

cd "$root/game"
npm run build
rm -rf "$dest"
mkdir -p "$dest"
(cd dist && tar --exclude=./pyodide -cf - .) | (cd "$dest" && tar -xf -)
echo "bundled $(du -sh "$dest" | cut -f1) of game files into $dest"
