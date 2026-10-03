# Progress

Checklist for the overnight build. Update after every step so work can be
picked up again from here.

Status (2026-10-03): M0-M4 done, most of M5 done. Game is playable and
tested. Shipped as a GitHub repo people clone and run locally; no hosted
site (owner's call, 2026-10-03).

## M0 setup
- [x] git init, .gitignore, README stub
- [x] analyzer uv project
- [x] game Vite project
- [x] prefetch tree-sitter grammars

## M1 analyzer
- [x] safe clone + local path mode
- [x] file walker + skip rules
- [x] lizard metrics
- [x] tree-sitter comments, docstrings, imports
- [x] import resolution (py, js/ts, go, rust, java, kotlin, c, cpp, ruby)
- [x] churn
- [x] builder (floors, rooms, edges, enemies, loot, bosses)
- [x] DungeonSpec + JSON Schema export
- [x] CLI
- [x] tests + hypothesis

## M2 layout + movement
- [x] load + validate JSON, generated types (scripts/gen-spec.mjs)
- [x] floor layout + connectivity check
- [x] renderer, FOV, movement, stairs
- [x] tests

## M3 combat + loot
- [x] energy scheduler, combat, wake-on-sight AI
- [x] XP, pack, loot, shrines, coffee drops
- [x] log, death screen
- [x] bot playthrough + balance report

## M4 bosses + share
- [x] bosses with a second phase and helpers
- [x] share links + result text
- [x] gallery (5 repos)
- [x] more gallery repos + rebuild script
- [x] CI workflow (Pages and issue-request workflows dropped 2026-10-03)
- [x] e2e smoke test

## M5 extras
- [x] Ollama flavor
- [x] request-a-dungeon Action
- [x] daily dungeon
- [ ] tileset (skipped on purpose, the text look is the point)

## How to run things

- Analyzer, from `analyzer/`: `uv run pytest --cov`, `uv run ruff check src tests`,
  `uv run mypy src`, `uv run headcrawl analyze owner/repo -o out.json`.
- Game, from `game/`: `npm run dev`, `npm test`, `npm run coverage`,
  `npm run build`. After changing analyzer models: `uv run headcrawl schema -o
  ../schema/dungeon.schema.json` then `npm run spec`.
- Screenshots: start `npx vite --port 5179`, then
  `node scripts/shots.mjs http://localhost:5179/ ../work/shots`.
- Balance: `npx vitest run -t "bot runs" --silent=false` prints bot results
  for every gallery dungeon.

## After review (security + code review agents)

Fixed: inflate bomb in share links, git log signature exec path, clone now
checks out only small source files, schema has upper bounds everywhere, end
screen timer leak, stale navigation, per-monster A* replaced by one distance
map, single-file floors, churn in subfolder analysis, names that clean to
nothing, duplicate floor names.

Left as is: CSP keeps style-src 'unsafe-inline' (Vite dev needs it and there
is no inline script). Actions are pinned to major tags, not SHAs. Renderer
redraws the whole view at 20 fps when idle.

## Day 2 (2026-10-02, after the owner played it)

- Flavor fixed: few-shot chat turns + canary check, default qwen2.5:7b.
  gemma4 is broken on Ollama 0.23.2 (can't answer 2+2), the canary skips it.
  Gallery rebuilt with `FLAVOR=1 scripts/gallery.sh`.
- Research round (Brogue, Cogmind, Into the Breach, Wordle, DCSS) turned
  into: monster abilities per archetype with telegraphed wind-ups, letter
  particle bursts, synth sound (m), run log download (s on the end screen),
  Wordle-style floor row in the share text, items in the legend, one-time
  tips, difficulty rating in the gallery.

- Later the same day: perks on level up (11 dev tools), TODO dates from
  git blame ("a FIXME from 2012", shallow edge marked "or earlier"), the
  last commit subject in the lair, and the big one: any public GitHub repo
  becomes a dungeon in the browser (Pyodide worker running the real
  analyzer, lite.py backend without tree-sitter). `npm run py` fetches the
  Pyodide bundle into game/public/pyodide (gitignored, CI does it too).

- Round 3 (owner approved PRODUCT/DESIGN, no GitHub yet): runs save as an
  action log and resume, replay links (?watch=), run codes (flask-4821),
  settings screen (text size, Okabe-Ito colorblind palette, high contrast,
  calm motion, tips reset), tap to inspect on phones, render only when
  needed, actions pinned to SHAs + npm ci --ignore-scripts + dependabot,
  six more gallery languages, GitHub history for browser builds, then vs
  now comparisons (#/vs/owner/repo@a..b).

- Round 4: optional GitHub token in settings (tab or device storage, only
  sent to api.github.com). With it, browser builds get TODO years from
  GraphQL blame. Years in browser builds are text only and boss history is
  all or nothing, so a link builds the same dungeon for everyone, token or
  not. Boss rooms in browser builds also show their last commit subject.

## Next ideas

- PyPI release so `uvx headcrawl` works (needs the owner's account).

- Sound: a few short synth blips with WebAudio, off by default.
- Mini-map of the floor graph in the side panel.
- Flavor: gemma4 works since Ollama 0.35 (`--model gemma4`); qwen2.5:7b
  stays the default.
- First push: create the GitHub repo. Nothing else to enable.

## Notes

- Analyzer coverage 94%, game logic coverage 93%.
- Loot is rare in clean repos (flask and express have no tags), so monsters
  drop coffee and shrines heal.
- Balance targets: bot wins small repos sometimes, dies to final bosses on
  bigger ones. Humans can retreat into corridors and use items, the bot can't.
- `work/` is gitignored scratch space.
- PRODUCT.md and DESIGN.md approved by the owner (2026-10-02). Not pushing
  to GitHub yet, by choice.
