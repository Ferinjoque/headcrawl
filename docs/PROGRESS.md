# Progress

Checklist for the overnight build. Update after every step so work can be
picked up again from here.

Status (2026-10-02): M0-M4 done, most of M5 done. Game is playable, tested, and
ready for GitHub Pages once the repo is pushed.

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
- [x] CI + Pages workflow
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

## Next ideas

- Cache the static map layer in the renderer so idle frames are cheap.
- Sound: a few short synth blips with WebAudio, off by default.
- Mini-map of the floor graph in the side panel.
- Better flavor text needs a bigger local model; gemma4 lines get rejected
  by the relevance filter.
- First push: create the GitHub repo, enable Pages (source: GitHub Actions),
  create the `dungeon` label.

## Notes

- Analyzer coverage 94%, game logic coverage 93%.
- Loot is rare in clean repos (flask and express have no tags), so monsters
  drop coffee and shrines heal.
- Balance targets: bot wins small repos sometimes, dies to final bosses on
  bigger ones. Humans can retreat into corridors and use items, the bot can't.
- `work/` is gitignored scratch space.
- PRODUCT.md and DESIGN.md were drafted without the owner. Review them.
