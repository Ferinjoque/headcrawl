#!/usr/bin/env bash
# Rebuild the gallery dungeons the site ships with.
# Usage: scripts/gallery.sh            (all)
#        scripts/gallery.sh flask gin   (only these slugs)
#        FLAVOR=1 scripts/gallery.sh    (boss lines from a local Ollama model)
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
  "jsoup jhy/jsoup"
  "polly App-vNext/Polly"
  "alamofire Alamofire/Alamofire"
  "slim slimphp/Slim"
  "sinatra sinatra/sinatra"
  "moshi square/moshi"
  "click pallets/click"
  "cobra spf13/cobra"
  "axum tokio-rs/axum"
  "chalk chalk/chalk"
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
  # Deep history so git blame can date old TODOs.
  extra=(--depth 3000)
  [ "$slug" = "headcrawl" ] && extra=(--name "headcrawl (this game)")
  if [ "${FLAVOR:-}" = "1" ]; then extra+=(--flavor --cache "$root/.cache/flavor"); fi
  uv run headcrawl analyze "$target" "${extra[@]}" --compact -o "$out/$slug.json"
done

cd "$root/game"
node scripts/build-index.mjs
