# headcrawl analyzer

Reads a git repo and writes a DungeonSpec JSON file for the game.

```
uv run headcrawl prefetch                      # download tree-sitter grammars once
uv run headcrawl analyze pallets/flask -o flask.json
uv run headcrawl analyze ../some/local/repo -o mine.json
uv run headcrawl schema -o ../schema/dungeon.schema.json
```

Nothing from the analyzed repo is ever executed. See `docs/PLAN.md` in the
repo root for how code maps to the dungeon.

Tests: `uv run pytest --cov`.
