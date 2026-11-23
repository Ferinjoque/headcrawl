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

Two faces, one job each (Cogmind's split: one font for the map and for
reading, another for the interface around it). Both OFL, self-hosted.

- VT323 for everything you read: the map, names, log, descriptions, values.
- Silkscreen, in caps, for everything you scan: window titles, tabs,
  section headings, stat names in the HUD, difficulty tags, key glyphs.
  16px, 12px for the small ones. It is wide, so give it room in columns.

No bold anywhere: VT323 has one weight and a faked bold smears it. Title
wordmark is drawn as block letters on the canvas.

Scale (px): VT323 16 / 20 / 24 / 32 / 48 / 72, log and HUD body at 20.
Silkscreen 12 / 16 / 24 (24 only for overlay titles set in the frame).

## Layout

- Map canvas fills the viewport.
- One status line at the top, fixed order: HP gauge first and largest,
  level, attack, then floor and the objective on the right. Repo, commit
  and turn count live on the pause screen.
- Message log at the bottom, four lines (two on phones), newest brightest.
  Lines that repeat the floor card or the panel go to the run log only.
- Side panel on wide screens, in fixed regions that never move (Brogue's
  rule): a focus box with the nearest thing's stats, then up to six rows in
  the order things came into view (not re-sorted by distance), then the
  pack, which always shows both gear slots and the potion/scroll counts, the
  minimap, and the file you stand in. Regions keep their height when empty;
  with nothing in sight the rows say who to hunt and that x explores.
  On short screens they tighten; on narrow screens the panel slides in.
- The top line always shows the same fields; def reads 0 without armor.
- Title: wordmark, one line, a continue button when a run is waiting, then
  one framed window with tabs on its top edge: dungeons (a list with the
  picked one's details beside it: floors top to bottom, the last boss and
  its line, descend or practice; the first gentle one says start here),
  any GitHub repo,
  run code, files. Daily, bestiary, the lab, settings and help are key
  buttons below it. 1 to 4 or tab switch tabs. Behind it all the bot plays a
  gallery dungeon (attract mode).
- Overlays (pause, help, settings, the sheet, the bestiary, the end screen)
  are framed windows over a dimmed map, the heading set into the top border
  like an old TUI. Long ones (help, bestiary) have tabs; number keys switch.
  Choice cards (level up, shop, gear swap) sit at the bottom of the stage.
  Tool cards carry a small third line saying what the real tool is.
- A welcome card before the first run in a browser, once.
- Words: the game word first (potion, scroll, curse, shop, side door,
  outdated), the code word after it or on a faint second line. The words
  live in game/src/ui/glossary.ts. Tools have game names too (Parry,
  Last Stand); the developer term is the second layer.
- Code details (a setting, on hover by default): screens show what a thing
  is and does; paths, metrics, commits and git jokes live in hover tips,
  under a rule after the game facts. Set to everywhere, they come back in
  the panel, log, cards and title.
- Names: on screen a monster is its game name (Payload Loader), a boss its
  title, gear a thing you hold (Payload Loader's Spear), a room "the
  Signer's room". The real identifier is the first line under the tip's
  rule, then its signature, what its author says it does (or what its
  name says), and its shape in plain words. That part is the learn layer:
  there when you look, never in the way.
  The gear card names both items and says how much better or worse the new
  one is; the one you keep is dimmed.
- The character sheet (`c`, or atk/def in the top line) and the bestiary
  use the same rows as help: label column, value column, a quieter second
  line under an entry. On phones entries and help rows stack, and tab
  strips scroll sideways instead of wrapping.
- Boss cards and boss hover tips show the first lines of the boss's code,
  left aligned with a thin rule, so the indentation reads.
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

Windows: one 1px frame in a warm brown (`--frame`), the title in the top
border, a dark fill. Panes inside split by a single neutral line. Never
nested frames, never side stripes.

Keys are glyph plates, like a console's button prompts: Silkscreen caps,
dark on an ember plate. In a tab or an unpicked menu row the plate is
quiet (an outline) until it is the live one.

Overlay buttons are a menu, one row each, not a row of chips: a cursor
(▸) on the picked row, a tinted bar behind it, the key on the right. The
screen opens with the cursor on the button it is mostly for (resume, try
again), up and down move it, enter or the pad's A press it. The dungeon
list uses the same cursor. Level up, shop and gear choices are rows too,
the number on a plate, rare ones on a gold plate.

Elsewhere (descend and practice on the title) a button is a flat plate
with one frame; hover lights the frame in ember. No drop shadows, no
lifting. The title's extras are prompts along the bottom: plate, label,
nothing around them. Touch screens get 44px tall buttons.

Side panel sections are a Silkscreen label running into a thin rule line,
the same idea as a window title set into its frame.

Tabs sit on a window's top edge; the open one joins the window below.
Choice options are the same pressable tiles; a rare tool gets a gold edge.
Moving in a menu ticks, picking clicks. Inputs are a single line with a
block cursor.
