# HEADCRAWL

A roguelike where the dungeon is a git repo.

![Title screen](docs/img/title.png)

Every file is a room. Every function is a monster, and the code sets its
stats: cyclomatic complexity is its HP, nesting depth is how hard it hits,
parameter count is how fast it moves. TODO, FIXME and HACK comments are
loot. The file that changes most and is hardest to read is the boss of its
floor. Imports are the corridors, and the deeper you go the closer you get
to the code everything else depends on.

Same commit, same dungeon. The seed is the HEAD hash, so a run code like
`flask-4821` gives anyone the same map and the same rolls.

![A boss shows up](docs/img/boss.png)

## Running it

The quickest way: grab the zip from the latest release, unzip it, and run
`python play.py` inside the folder. It serves the game on 127.0.0.1 and
opens your browser. Everything works from the zip, building any GitHub
repo included.

From source you need Node 20 or newer.

```
git clone <this repo>
cd headcrawl/game
npm ci
npm run dev          # then open http://localhost:5173
```

That's enough for the gallery, daily runs and run codes. To build any
GitHub repo from the title screen you also need
[uv](https://docs.astral.sh/uv/), once:

```
npm run py           # builds the analyzer and fetches Python for the browser (about 30 MB)
```

## What maps to what

| In the repo | In the dungeon |
|---|---|
| folder | floor, ordered so the most imported code is at the bottom |
| file | room, sized by lines of code |
| import between files | `~` corridor |
| an import cycle | `o~` loop corridor that walks you back once |
| neighbours in the folder tree | `#` passage |
| function | monster named after it |
| complexity / nesting / params | HP / damage / speed |
| test file | shrine, heals you once |
| `TODO` | `!` potion |
| `FIXME` | `/` weapon |
| `HACK` | `?` scroll with a random effect |
| `XXX` | `%` cursed: more attack, less max HP |
| churn x complexity | the boss of the floor |
| the boss function a year ago | what a `git checkout` HACK turns it back into |
| dependencies in the root manifest | the `$` vendor in each entry room |
| who last touched a TODO line | written on the loot ("a FIXME from 2012 by alice") |

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
| ghost | nothing mentions it, tests included | drifts through walls, hits softly |
| boss | the floor's hotspot | winds up area attacks |

![A boss winding up](docs/img/telegraph.png)

## Playing

Pick a repo from the gallery, or bring your own (below). Behind the menu
the bot plays a random gallery dungeon, so you can see what you're in for.
Arrows, `hjkl` or `yubn` move and attack. `x` explores until something
shows up, `z` rests, `>` takes the stairs once the boss is dead, `?` shows
everything else. Health is the first thing on the top line.

The vendor (`$`) in each entry room sells two of the repo's real
dependencies, one per floor. Every deal helps and every one costs
something: a framework hits hard and weighs a ton.

There is a daily run (`d`): same repo, same rolls and the same twist for
everyone that day (friday deploy on Fridays, otherwise legacy code,
hotfix, code review or lights out). Only your first start of the day
counts; later ones say "practice" in the share text.

The music is made live in WebAudio and seeded by the repo's HEAD, so every
repo has its own theme. It gets darker the deeper you go, drums come in when
something wants you dead, and bosses get a motif made from their name. `m`
mutes everything; `,` opens settings (music on its own, text size,
colorblind friendly or high contrast colors, calm motion). On a phone, tap
a monster to see what it is. `b` on the title opens the bestiary: what
you've refactored, the gnarliest bosses you beat and what keeps getting you.

Runs save themselves in the browser; close the tab and pick it up later
under "continue". Every run has a code like `flask-4821`: give it to a
friend and they get the same dungeon with the same rolls. When a run ends
you can copy a spoiler-free result, and under `tab`: a race link (your
run plays as a faint @ next to theirs), a replay link, a GIF or an
asciinema cast of the last turns, or the whole run log as text. Your own
best run on each dungeon comes back as that ghost too. Links point at your
own copy, so a friend pastes them into the run code box on theirs; only the
part after `#` matters.

## Your own repo

Paste any public GitHub repo on the title screen and the game builds the
dungeon right there: the same Python analyzer runs in your browser through
Pyodide, files come straight from GitHub, and nothing in the repo is ever
executed. It takes about ten seconds and a handful of GitHub's 60 hourly
anonymous API calls (it needs `npm run py` once, see above). Its run code
(`owner/repo@commit-1234`) rebuilds the same dungeon for anyone.

Optionally, add your own GitHub token in settings (`,`). GitHub then allows
5000 calls an hour instead of 60, and browser builds show the year each
TODO was written, using GitHub's blame. A fine-grained token with read-only
access to public repos is enough. It stays in your browser, for the tab
unless you tick "remember", and is only ever sent to api.github.com. Dates
are text only, so a link builds the same dungeon with or without a token.

Or pick a folder on your own disk (title screen, `tab`, `f`): the same
analyzer reads it in the tab, and nothing is uploaded.

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

Open the game and press `o`, or drop the file on it. The game turns it into
a link you can send; the whole dungeon lives in the part of the URL after
`#`.

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

`scripts/gallery.sh` rebuilds the bundled dungeons. Add a repo to its list,
run it, and `npm run gallery` refreshes the index.

## License

MIT
