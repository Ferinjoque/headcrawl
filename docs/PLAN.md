# HEADCRAWL: plan

Turn any git repo into a turn-based roguelike you play in the browser.
Python reads the repo and writes a DungeonSpec JSON file. A TypeScript game
built on ROT.js loads that file and you play it. The site is static and lives
on GitHub Pages.

Name: **HEADCRAWL** (you crawl the HEAD of a repo). CLI and package: `headcrawl`.

## Why bother, since GitHub Dungeons exists

GitHub Dungeons (a gh CLI extension in Go) already makes a terminal dungeon
from a repo, using BSP seeded by the last commit SHA. waking-git (Rust/Bevy)
is a WIP world generator. Neither one uses real code metrics for gameplay, and
neither runs in a browser with a link you can send someone. What we do
differently:

- Every number in the game comes from the code: complexity, nesting, params,
  churn, TODOs, imports.
- Plays in the browser. Nothing to install. A share link opens the same
  dungeon on the same seed.
- A gallery of well-known repos is built ahead of time, so the site has
  something to play on day one.
- The CLI runs locally on your own repo, and you drop the JSON into the page.

## Architecture

```
repo URL or path
   |
   v
analyzer (Python 3.12, uv)
   clone (hardened) -> walk files -> lizard metrics -> tree-sitter comments/imports
   -> git churn -> import graph -> floors/rooms/enemies/loot/bosses
   -> DungeonSpec (Pydantic) -> dungeon.json
   |
   |  schema/dungeon.schema.json (exported from Pydantic, single source of truth)
   v
game (TypeScript, Vite, ROT.js)
   validate JSON -> lay out floors on a grid (seeded) -> play
```

The analyzer decides what exists and how things connect (a graph). The game
decides where things go on the grid. That keeps the JSON small and lets the
game re-roll a layout without re-analyzing.

### Mapping

| Code | Game |
|------|------|
| Top-level directory (or a merged group of small ones) | Floor |
| Subdirectory | Wing (rooms grouped together on a floor) |
| File | Room, area scales with sqrt(LOC) |
| Import between files | Corridor. Spanning tree first, extra edges after |
| Import crossing floors | Stairs |
| Function | Enemy. HP from CCN, damage from max nesting depth, speed from param count |
| Method in a class | Enemy of the class "family", shares a glyph |
| Test file | Shrine. Heals you once. On the tests floor only the quietest test file is a shrine |
| TODO | Potion (heal) |
| FIXME | Weapon upgrade |
| HACK / XXX | Cursed scroll. Strong but with a side effect |
| Docstring / module doc | Lore note you can read |
| Hotspot (churn x CCN) | Boss, one per floor, final boss on the last floor |

All tests share one floor, and examples/scripts/benchmarks share one floor,
so side code can't crowd out the real thing. Tiny groups get merged.

Floor order: floors sorted by how "deep" their code sits in the import graph.
Entry points and tests near the top, the most-imported core code at the
bottom. So you literally descend into the core.

Enemy archetypes by smell, so it is not just bigger numbers:

- CCN high: Tangle. Lots of HP.
- Nesting deep: Nest. Hits hard.
- Many params: Hydra. Fast, acts more often.
- Long function (NLOC): Wall. Slow, tanky.
- Tiny function: Imp. Weak, comes in groups.

### Randomness

Seed = HEAD commit SHA. Python uses `random.Random(int(sha, 16))` for any
tie-breaks. The game takes the first 8 hex chars as a uint32 for
`ROT.RNG.setSeed`. A share link can add a run number so friends can race the
same dungeon with different combat rolls, or keep it at 0 for identical runs.

### Share links

- Gallery dungeon: `#/play/<slug>?seed=<n>`
- Custom dungeon small enough: spec deflated with fflate, base64url, put in the
  URL fragment. Fragments never hit the server.
- Too big for a URL: download/upload the JSON file.
- After a run: a short text result (floors cleared, bosses, turns) to copy.

### Scale limits

- Max floors: 8. Max rooms per floor: 18. Max enemies per room: 6.
- Too many directories: merge the smallest into their parent until under cap.
- Too many files: keep top-K per directory by (CCN sum + churn).
- Skip files over 512 KB, minified files (very long lines), vendored and
  generated paths (node_modules, vendor, dist, build, `linguist-generated`).
- Churn: `git log --name-only -n 500`. It only needs trees, so it works with
  `--filter=blob:none` clones and stays fast on big repos.

## Security

We clone repos we do not trust. Rules:

- Never run anything from the repo. Static reads only.
- Clone with `-c core.hooksPath=/dev/null -c core.symlinks=false
  -c protocol.file.allow=never -c core.fsmonitor=false`, `--no-recurse-submodules`,
  `--single-branch`, `--depth N`, env `GIT_TERMINAL_PROMPT=0` and
  `GIT_LFS_SKIP_SMUDGE=1`.
- Only `https://` URLs. Reject `file://`, `ssh://`, `ext::` and anything with
  options-looking parts (leading `-`).
- Timeout on clone, cap on total checkout bytes and file count.
- Skip symlinks (`git ls-files -s` mode 120000), skip binaries (NUL byte in
  first 8 KB), resolve every path and make sure it stays inside the clone.
- Names, comments and commit text are attacker-controlled. The game draws them
  with canvas text or `textContent`. No `innerHTML` anywhere. Lint rule for it.
- Strip control chars and cap string length in the analyzer too.
- Static site with a strict CSP meta tag.
- tree-sitter-language-pack downloads grammar binaries on first use. Pin the
  version and prefetch a fixed language list during setup.

## Stack (versions checked 2026-10-02)

Python side: Python 3.12 via uv, lizard 1.24.0 (with the `nd` extension for
nesting depth), tree-sitter 0.26 + tree-sitter-language-pack 1.20 (its
`process()` gives imports, comments and structure for us), Pydantic 2.13,
hypothesis 6.168, pytest, ruff, mypy.

Game side: Node 24, Vite 8, TypeScript, rot-js 2.2.1, fflate 0.8, vitest 5,
fast-check 4, json-schema-to-typescript for types from the schema.

Optional: Ollama on localhost with `gemma4` (already installed) for boss names
and taunts. JSON-schema constrained output, cached by function hash, template
fallback. Off by default. The game never needs it.

No paid APIs anywhere.

## Milestones

Each milestone ends with tests green and a local commit.

### M0. Setup
- git init, .gitignore, README stub, docs folder.
- `analyzer/` uv project (src layout), `game/` Vite project.
- Pin tool versions. Prefetch tree-sitter grammars.

### M1. Analyzer + JSON
- Safe clone module, plus "analyze a local path" mode.
- File walker with all the skip rules.
- Metrics per file: lizard (CCN, NLOC, params, nesting) per function.
- tree-sitter: comments (TODO/FIXME/HACK/XXX), docstrings, imports.
- Import resolution for Python, JS/TS, Go, Rust. Other languages fall back to
  directory neighbours for corridors.
- Churn from git log.
- Builder: floors, wings, rooms, edges (spanning tree + extras), enemies,
  loot, bosses.
- Pydantic DungeonSpec, export JSON Schema.
- CLI: `headcrawl analyze <url|path> -o out.json`.
- Tests: unit + hypothesis (same input same output, graph connected, all HP
  > 0, caps respected, no path escapes).

### M2. Map layout + movement
- Load and validate JSON. Types generated from schema.
- Per floor layout: place rooms by wing, carve corridors along graph edges
  with A*, check flood-fill connectivity, retry with next seed if not.
- ROT.Display, FOV with fog of war, player movement, stairs.
- Side panel: current room = file path, LOC, language.
- Tests: fast-check that every room is reachable for random specs, and that
  the same seed gives the same grid.

### M3. Combat + loot
- Speed scheduler, bump-to-attack, simple enemy AI (chase in FOV, else wander).
- XP and levels, inventory, the loot types above, shrines.
- Message log. Death screen.
- Tests: combat invariants (HP never above max, dead things leave the
  scheduler), a bot that explores to check every floor is finishable.

### M4. Bosses + share link
- Boss rooms, boss patterns, final boss.
- Share link (gallery + compressed fragment), result text.
- Gallery page with pre-built dungeons.
- GitHub Pages deploy workflow.

### M5. Nice to have, if the night allows
- Optional Ollama flavor text.
- Kenney 1-bit tileset (CC0) as an alternate renderer.
- "Request a dungeon" GitHub Action: someone opens an issue with a repo URL,
  an unprivileged job analyzes it, a second job validates the JSON and adds it
  to the gallery. Free on public repos.
- Daily dungeon (date picks a gallery repo and seed).
- Mini-map of the directory tree.

## Testing

- Python: pytest + hypothesis, coverage target 80%.
- TS: vitest + fast-check, coverage target 80%.
- A fixture repo made in the test itself (tiny, known numbers) so tests never
  need the network.

## Risks

- TypeScript 7 is the new native compiler. If Vite or tooling fights it,
  pin TS 5.x for typecheck.
- Laying out a graph on a grid can fail for dense floors. Retry with new
  sub-seeds, then drop extra edges, never the spanning tree.
- Import resolution is per language and will miss things (aliases, path
  maps). Fine, the spanning tree keeps the floor connected anyway.
- Balance. Raw CCN can be 200 on some files. Scale with log and clamp.
- Big repos are slow to clone. Gallery is built once; the CLI has `--depth`
  and caps.
