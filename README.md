# HEADCRAWL

A roguelike where the dungeon is a git repo.

![Title screen](docs/img/title.png)

Every file is a room. Every function is a monster, and the code sets its
stats: cyclomatic complexity is its HP, nesting depth is how hard it hits,
parameter count is how fast it moves. TODO, FIXME and HACK comments are
loot. The file that changes most and is hardest to read is the boss of its
floor. Imports are the corridors, and the deeper you go the closer you get
to the code everything else depends on.

Same commit, same dungeon. The seed is the HEAD hash, so a link to a run
is a link to the same map for everyone.

![A boss shows up](docs/img/boss.png)

## What maps to what

| In the repo | In the dungeon |
|---|---|
| folder | floor, ordered so the most imported code is at the bottom |
| file | room, sized by lines of code |
| import between files | `~` corridor |
| neighbours in the folder tree | `#` passage |
| function | monster named after it |
| complexity / nesting / params | HP / damage / speed |
| test file | shrine, heals you once |
| `TODO` | `!` potion |
| `FIXME` | `/` weapon |
| `HACK` | `?` scroll with a random effect |
| `XXX` | `%` cursed: more attack, less max HP |
| churn x complexity | the boss of the floor |

The rock between rooms is filled with the floor's own identifiers.

Monsters play differently depending on what kind of code they are:

| Kind | Comes from | What it does |
|---|---|---|
| tangle (capital letter) | lots of branches | regrows HP every turn |
| nest | deep nesting | winds up a heavy hit, red cells show where |
| hydra | many parameters | splits in two the first time it's hurt |
| wall (capital letter) | very long function | armored and slow |
| imp | tiny function | fast |
| bug | everything else | dodges now and then |
| boss | the floor's hotspot | winds up area attacks |

![A boss winding up](docs/img/telegraph.png)

## Playing

Pick a repo from the gallery, or bring your own (below). Arrows, `hjkl` or
`yubn` move and attack. `x` explores until something shows up, `z` rests,
`>` takes the stairs once the boss is dead, `?` shows everything else.
There is a daily run: same repo and same rolls for everyone that day.
`,` opens settings (sound, text size, colorblind friendly or high contrast
colors, calm motion). On a phone, tap a monster to see what it is.

Runs save themselves in the browser; close the tab and pick it up later
under "continue". Every run has a code like `flask-4821`: give it to a
friend and they get the same dungeon with the same rolls. When a run ends
you can copy a spoiler-free result, save the whole run log as text, or copy
a replay link that plays your run back move by move.

## Your own repo

Paste any public GitHub repo on the title screen and the game builds the
dungeon right there: the same Python analyzer runs in your browser through
Pyodide, files come straight from GitHub, and nothing in the repo is ever
executed. It takes about ten seconds and a handful of GitHub's 60 hourly
anonymous API calls. The link it gives you (`#/gh/owner/repo@commit`)
rebuilds the same dungeon for anyone.

Give a repo and an old tag instead and you get **then vs now**: both
versions built and compared, which functions grew, which got simpler, which
notes appeared, and you can play either one.

The command line version reads the full git history, so every TODO also
knows how old it is:

```
cd analyzer
uv run headcrawl prefetch          # once: tree-sitter grammars
uv run headcrawl analyze ../path/to/repo -o mine.json
uv run headcrawl analyze pallets/flask -o flask.json
```

Open the page and press `o`, or drop the file on it. The game turns it into
a link you can send. The whole dungeon lives in the part of the URL after
`#`, so it never touches a server.

`--flavor` asks a local Ollama model (default `qwen2.5:7b`) for boss titles
and taunts. It only keeps lines that talk about the actual function, checks
first that the model follows prompts at all, and falls back to the built-in
lines otherwise. Off by default, and the game never needs it.

## How it's built

- `analyzer/` Python 3.12. lizard for complexity, tree-sitter for comments
  and imports, git for churn, Pydantic for the output. Clones are shallow,
  partial, https only, with hooks and every config-driven command turned off.
- `game/` TypeScript, Vite and rot-js. Canvas renderer with bloom, seeded
  layout that places files next to the files they import, a bot that plays
  every gallery dungeon in the tests.
- `schema/` the JSON contract between the two, generated from the Pydantic
  models. The game's types and validator are generated from it.
- `docs/` plan, research notes and progress.

```
cd analyzer && uv run pytest --cov
cd game && npm test && npx playwright test
```

## Adding to the gallery

`scripts/gallery.sh` rebuilds the bundled dungeons. On GitHub, an issue
titled `dungeon: owner/repo` plus the `dungeon` label from a maintainer runs
a workflow that analyzes the repo and publishes it.

## License

MIT
