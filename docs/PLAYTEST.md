# Playtest

Two things the bots can't tell us: whether a person who has never seen the
game gets through floor 1 without asking anything, and whether the
difficulty feels right to a human who retreats, rests and drinks potions.

## Setup

```
cd game
npm run dev
```

Open http://localhost:5173 in a private window, so the welcome card and
tips show as they would for someone new.

## Run 1: someone who doesn't code

Sit next to them and say only "it's a game, have a go". Don't explain
anything unless they're stuck for a minute or more, and write down when
that happens.

Watch for:

- Do they read the welcome card, or skip it?
- Do they find the start-here dungeon and press enter?
- Do they figure out walking into a monster attacks it?
- Do they find `x` (explore) or `?` on their own?
- Do they know what the red cells mean before the first one hits them?
- Do they notice the stairs open after the boss dies?
- Anything they call by a different word than the game does.

Afterwards ask: what was confusing, what was fun, would they play again.

## Run 2: you

Three runs on gallery dungeons you haven't cleared, normal difficulty.
After each one, press `s` on the end screen to save the run log.

Note for each run:

- the dungeon and floor you died on, or that you cleared it
- the fight that felt unfair, if any, and why (too fast, no warning, too
  much HP)
- whether you ever had more potions than you needed, or none when you
  needed one

## Sending it back

The saved run logs plus the notes are enough. The run code on the end
screen (like `flask-4821`) replays the same dungeon and rolls, so a bad
fight can be set up again in the lab (`l` on the title) and tuned there.
