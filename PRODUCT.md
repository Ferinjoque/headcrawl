# Product

## Register

product

## Users

Anyone who likes a short roguelike, with or without knowing code. Someone
who got a run code from a friend ("I died on floor 3 of flask-4821"), and
programmers who want to see their own repo as a dungeon. There is no hosted
site: people run it locally. Short sessions, ten to twenty minutes, keyboard
on a laptop, often at night.

Changed 2026-10-05: it used to say "developers, mostly". The owner found the
git angle was the hook but not enough on its own, and too much of the game
only made sense to programmers.

## Product Purpose

A roguelike first: descend, fight, loot, one life, a boss per floor. The
levels are dug out of real code, which gives every dungeon its own shape
and names. For programmers there is a second layer of fun in recognition:
the monster you just fought is `parse_args`, the potion is a TODO someone
left in 2019, the boss is the file everybody keeps rewriting. Success is
people coming back for one more run, and sharing the run code.

## Brand Personality

Glowing, sly, nerdy. It should feel like an old terminal that someone wired
up to stage lights: colorful ASCII with real light and shade, not a flat
console. Copy is dry and short, like a commit message with a sense of humor.

## Anti-references

- Flat ROT.js demo look: gray glyphs on pure black, default font, no light.
- Generic "hacker" green-on-black Matrix rain.
- SaaS chrome around the game: cards, pill buttons, gradients, modals for
  everything.
- Pixel-art sprite roguelikes. This is text that glows.

## Design Principles

1. Game words first. Every thing has a plain name a non-programmer gets
   (potion, scroll, shop, side door); the code term rides along as flavor
   or on a faint second line. ui/glossary.ts holds the words.
2. The code is the content, on request. Names and quotes come from the
   repo and are never invented. Paths, line numbers, metrics, commits and
   git jokes wait in hover tips, or show everywhere with the code details
   setting. On screen by default: what a thing is and what it does.
3. Light is information. Brightness says what is visible, heat, danger and
   value. Decoration that glows has to mean something.
4. One screen, one terminal. HUD, log and menus belong to the same text
   world as the map, not a web page bolted around it.
5. Every run is shareable. Run code, link and result text are always one key
   away.

## Accessibility & Inclusion

- Full keyboard play. Touch controls on small screens.
- Meaning never by color alone: glyph shape and text carry it too.
- Text in the HUD and log meets 4.5:1 against its background.
- `prefers-reduced-motion` turns off shake, flicker and particle bursts.
- All repo-derived text is set with textContent or canvas text, never HTML.
