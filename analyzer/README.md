# headcrawl

A roguelike where the dungeon is a git repo. Every file is a room, every
function a monster with stats from its own complexity, TODOs are loot, and
the code everyone keeps rewriting is the boss.

```
uvx headcrawl play pallets/flask        # build it and open the game in your browser
uvx headcrawl play .                    # the repo you're standing in
```

`play` clones (shallow, https only, hooks off), reads the code, and serves
the game on 127.0.0.1. Nothing from the repo is ever executed, and nothing
leaves your machine except the clone itself.

Other commands:

```
headcrawl analyze pallets/flask -o flask.json   # just the dungeon file
headcrawl prefetch                              # download tree-sitter grammars ahead of time
headcrawl validate flask.json
headcrawl schema -o dungeon.schema.json
```

`--flavor` asks a local Ollama model for boss titles and taunts.

Source, the browser game and how it all maps: https://github.com/Ferinjoque/headcrawl
