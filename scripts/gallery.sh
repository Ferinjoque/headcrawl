#!/usr/bin/env bash
# Rebuild the gallery dungeons the site ships with.
# Usage: scripts/gallery.sh            (all)
#        scripts/gallery.sh flask gin   (only these slugs)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/game/public/dungeons"
mkdir -p "$out"

# slug  target
repos=(
  "itsdangerous pallets/itsdangerous"
  "flask pallets/flask"
  "requests psf/requests"
  "express expressjs/express"
  "ky sindresorhus/ky"
  "gin gin-gonic/gin"
  "bubbletea charmbracelet/bubbletea"
  "ripgrep BurntSushi/ripgrep"
  "jq jqlang/jq"
  "headcrawl $root"
)

want=("$@")
cd "$root/analyzer"
for entry in "${repos[@]}"; do
  slug="${entry%% *}"
  target="${entry#* }"
  if [ ${#want[@]} -gt 0 ] && [[ ! " ${want[*]} " =~ " $slug " ]]; then
    continue
  fi
  name_args=()
  [ "$slug" = "headcrawl" ] && name_args=(--name "headcrawl (this game)")
  uv run headcrawl analyze "$target" "${name_args[@]}" --compact -o "$out/$slug.json"
done

cd "$root/game"
node scripts/build-index.mjs
