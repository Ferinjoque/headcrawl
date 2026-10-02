# HEADCRAWL

A roguelike where the dungeon is a git repo.

Every file is a room. Every function is a monster, and how tough it is comes
from the code: cyclomatic complexity sets its HP, nesting depth its damage,
parameter count its speed. TODO, FIXME and HACK comments are loot. The files
that change most and are hardest to read are the bosses. Imports are the
corridors, and the deeper you go the closer you get to the code everything
else depends on.

Same commit, same dungeon. The seed is the HEAD hash.

## Layout

- `analyzer/` Python. Clones or reads a repo, writes `dungeon.json`.
- `game/` TypeScript + ROT.js. Plays a `dungeon.json` in the browser.
- `schema/` The JSON schema between the two, generated from the analyzer.
- `docs/` Plan, research notes, progress.

## Run it

```
cd analyzer
uv run headcrawl prefetch
uv run headcrawl analyze pallets/flask -o ../game/public/dungeons/flask.json
```

Then start the game (see `game/README.md`).
