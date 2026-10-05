# Design

Seeded before the first screen existed. Update from the real tokens in
`game/src/ui/tokens.css` once they settle.

## Visual theme

Scene: a developer on the couch at night, lights off, the laptop is the only
light in the room. Dark, but not black: the base is a deep ink with a little
oxblood in it, so the glow reads as warm light falling on something rather
than pixels on a void.

Everything is a character on a grid. Light comes from glyphs: each bright
glyph blooms onto its neighbours, and unlit rock is filled with dim letters
taken from the floor's own identifiers. Lit areas glow, remembered areas sit
at about 30% brightness, unknown areas are rock letters only.

## Color

Full palette, each role fixed. OKLCH, neutrals tinted toward the ink hue.

| Role | Use | Value |
|------|-----|-------|
| ink | page and canvas background | oklch(0.14 0.02 20) |
| ink-raised | HUD panels, log | oklch(0.18 0.025 20) |
| text | HUD text | oklch(0.92 0.02 70) |
| text-dim | secondary HUD text | oklch(0.70 0.03 60) |
| ember | wordmark, floor names, keys | oklch(0.66 0.17 45) |
| rock | rock letters, base layer only, never bloomed | oklch(0.52 0.05 35) |
| brick | room walls | oklch(0.78 0.15 60) |
| floor | room floor dots | oklch(0.62 0.20 345) |
| current | import corridors, water | oklch(0.62 0.17 255) |
| passage | non-import passages | oklch(0.55 0.05 255) |
| loot | items, pickups | oklch(0.86 0.16 100) |
| hp | player health, heals | oklch(0.80 0.19 150) |
| danger | damage, low HP | oklch(0.68 0.23 25) |
| boss | bosses, lair | oklch(0.70 0.26 340) |
| player | @ | oklch(0.97 0.03 90) |

Enemy archetypes each get a hue: tangle magenta, nest red-orange, hydra cyan,
wall slate blue, imp yellow, bug lime, remote violet. The glyph is the first
letter of the function name, so color is never the only cue. Elites are drawn
bold on a faint tile of their own color, so they read by shape too.

Gear sits on the steel role: `/` weapons, `[` armor.

## Typography

One family on purpose: VT323 (OFL, self-hosted). The whole game is a
terminal, so the map, HUD and menus share it. Hierarchy by size and color,
not a second font. Title wordmark is drawn as block letters on the canvas.

Scale (px): 16 / 20 / 24 / 32 / 48 / 72. Log and HUD body at 20, labels at 16.

## Layout

- Map canvas fills the viewport.
- One status line at the top, fixed order: HP gauge first and largest,
  level, attack, then floor and the objective on the right. Repo, commit
  and turn count live on the pause screen.
- Message log at the bottom, four lines (two on phones), newest brightest.
  Lines that repeat the floor card or the panel go to the run log only.
- Side panel on wide screens: what is in sight (stats for the nearest only),
  what you carry with its key, the minimap, then the file you stand in.
  Empty sections are not drawn. On narrow screens it slides in.
- Title: wordmark, one line, continue, the repo list, four keys. Everything
  else (GitHub build, then vs now, folder, file, settings, bestiary) is
  behind tab. Behind it the bot plays a gallery dungeon (attract mode).
- Menus and end screens render as text blocks over a dimmed map, no cards.
  Choice cards (level up, vendor, gear swap) sit at the bottom of the stage.
  The gear card names both items and says how much better or worse the new
  one is; the one you keep is dimmed.
- The character sheet (`c`, or atk/def in the top line) and the bestiary
  are the same text pages as help: label column, value column, a quieter
  second line under an entry. On phones entries stack.
- Green means health and nothing else.

## Motion

- Hits: one-frame flash on the target glyph, floating number that rises and
  fades over 600 ms. With a weapon in hand, a swing glyph (- | / \) cuts from
  the @ into the target for about 190 ms, gold on a crit. Off with calm motion.
- Taking gear floats its name up from the @.
- Boss hits and death: short camera shake (off for reduced motion).
- Light: torches and the boss glow breathe slowly (off for reduced motion).
- UI transitions 150 to 200 ms, ease-out.

## Components

Buttons are bracketed text: `[Enter] play`, `[R] retry`. Hover and focus
brighten the text and draw the brackets in the accent. Inputs are a single
line with a block cursor.
