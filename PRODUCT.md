# Product

## Register

product

## Users

Developers, mostly. Someone who opens a link a friend sent ("I died on
floor 3 of flask") or wants to see what their own repo looks like as a
dungeon. Short sessions, ten to twenty minutes, keyboard on a laptop, often at
night. Some will be on a phone because the link came through chat.

## Product Purpose

A roguelike where the level is a real git repo. The fun is recognition: the
monster you just fought is `parse_args`, the potion is a TODO someone left in
2019, the boss is the file everybody keeps rewriting. Success is people
playing a repo they know, laughing at what they find, and sharing the link.

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

1. The code is the content. Show real names, paths, line numbers and
   comments wherever there is room. Never invent filler where repo data
   exists.
2. Light is information. Brightness says what is visible, heat, danger and
   value. Decoration that glows has to mean something.
3. One screen, one terminal. HUD, log and menus belong to the same text
   world as the map, not a web page bolted around it.
4. Every run is shareable. Seed, link and result text are always one key
   away.

## Accessibility & Inclusion

- Full keyboard play. Touch controls on small screens.
- Meaning never by color alone: glyph shape and text carry it too.
- Text in the HUD and log meets 4.5:1 against its background.
- `prefers-reduced-motion` turns off shake, flicker and particle bursts.
- All repo-derived text is set with textContent or canvas text, never HTML.
