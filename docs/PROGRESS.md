# Progress

Checklist for the overnight build. Update after every step so work can be
picked up again from here.

Status: M0 and M1 done (2026-10-02). Next: M2 game.

## M0 setup
- [x] git init, .gitignore, README stub
- [x] analyzer uv project
- [ ] game Vite project
- [x] prefetch tree-sitter grammars

## M1 analyzer
- [x] safe clone + local path mode
- [x] file walker + skip rules
- [x] lizard metrics
- [x] tree-sitter comments, docstrings, imports
- [x] import resolution (py, js/ts, go, rust)
- [x] churn
- [x] builder (floors, rooms, edges, enemies, loot, bosses)
- [x] DungeonSpec + JSON Schema export
- [x] CLI
- [x] tests + hypothesis

## M2 layout + movement
- [ ] load + validate JSON, generated types
- [ ] floor layout + connectivity check
- [ ] display, FOV, movement, stairs
- [ ] tests

## M3 combat + loot
- [ ] scheduler, combat, AI
- [ ] XP, inventory, loot, shrines
- [ ] log, death screen
- [ ] tests + bot playthrough

## M4 bosses + share
- [ ] bosses
- [ ] share links + result text
- [ ] gallery
- [ ] Pages workflow

## M5 extras
- [ ] Ollama flavor
- [ ] tileset
- [ ] request-a-dungeon Action
- [ ] daily dungeon

## Notes

- Analyzer: 94% coverage, ruff + mypy strict clean. Run from `analyzer/`:
  `uv run pytest --cov`, `uv run ruff check src tests`, `uv run mypy src`.
- Import resolution also covers java/kotlin/c/cpp/ruby (best effort).
- Real repos tried: itsdangerous, flask, express, gin, ripgrep. 2-7s each,
  35-80 KB of JSON. Loot is rare in clean repos (flask, express have 0 tags),
  so the game needs its own drops too.
- `work/` is gitignored scratch space for analysis output.
