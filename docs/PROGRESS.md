# Progress

Checklist for the overnight build. Update after every step so work can be
picked up again from here.

Status (2026-11-23, round 11): M0-M5 done, plus a UI redesign, music and a
lot of mechanics on top. Playable and tested. Shipped as a private GitHub
repo (Ferinjoque/headcrawl) people clone and run locally, or a release zip
with play.py; no hosted site (owner's call, 2026-10-03).

## M0 setup
- [x] git init, .gitignore, README stub
- [x] analyzer uv project
- [x] game Vite project
- [x] prefetch tree-sitter grammars

## M1 analyzer
- [x] safe clone + local path mode
- [x] file walker + skip rules
- [x] lizard metrics
- [x] tree-sitter comments, docstrings, imports
- [x] import resolution (py, js/ts, go, rust, java, kotlin, c, cpp, ruby)
- [x] churn
- [x] builder (floors, rooms, edges, enemies, loot, bosses)
- [x] DungeonSpec + JSON Schema export
- [x] CLI
- [x] tests + hypothesis

## M2 layout + movement
- [x] load + validate JSON, generated types (scripts/gen-spec.mjs)
- [x] floor layout + connectivity check
- [x] renderer, FOV, movement, stairs
- [x] tests

## M3 combat + loot
- [x] energy scheduler, combat, wake-on-sight AI
- [x] XP, pack, loot, shrines, coffee drops
- [x] log, death screen
- [x] bot playthrough + balance report

## M4 bosses + share
- [x] bosses with a second phase and helpers
- [x] share links + result text
- [x] gallery (5 repos)
- [x] more gallery repos + rebuild script
- [x] CI workflow (Pages and issue-request workflows dropped 2026-10-03)
- [x] e2e smoke test

## M5 extras
- [x] Ollama flavor
- [x] request-a-dungeon Action
- [x] daily dungeon
- [ ] tileset (skipped on purpose, the text look is the point)

## How to run things

- Analyzer, from `analyzer/`: `uv run pytest --cov`, `uv run ruff check src tests`,
  `uv run mypy src`, `uv run headcrawl analyze owner/repo -o out.json`.
- Game, from `game/`: `npm run dev`, `npm test`, `npm run coverage`,
  `npm run build`. After changing analyzer models: `uv run headcrawl schema -o
  ../schema/dungeon.schema.json` then `npm run spec`.
- Screenshots: start `npx vite --port 5179`, then
  `node scripts/shots.mjs http://localhost:5179/ ../work/shots`.
- Balance: `npx vitest run -t "bot runs" --silent=false` prints bot results
  for every gallery dungeon.

## After review (security + code review agents)

Fixed: inflate bomb in share links, git log signature exec path, clone now
checks out only small source files, schema has upper bounds everywhere, end
screen timer leak, stale navigation, per-monster A* replaced by one distance
map, single-file floors, churn in subfolder analysis, names that clean to
nothing, duplicate floor names.

Left as is: CSP keeps style-src 'unsafe-inline' (Vite dev needs it and there
is no inline script). Actions are pinned to major tags, not SHAs. Renderer
redraws the whole view at 20 fps when idle.

## Day 2 (2026-10-02, after the owner played it)

- Flavor fixed: few-shot chat turns + canary check, default qwen2.5:7b.
  gemma4 is broken on Ollama 0.23.2 (can't answer 2+2), the canary skips it.
  Gallery rebuilt with `FLAVOR=1 scripts/gallery.sh`.
- Research round (Brogue, Cogmind, Into the Breach, Wordle, DCSS) turned
  into: monster abilities per archetype with telegraphed wind-ups, letter
  particle bursts, synth sound (m), run log download (s on the end screen),
  Wordle-style floor row in the share text, items in the legend, one-time
  tips, difficulty rating in the gallery.

- Later the same day: perks on level up (11 dev tools), TODO dates from
  git blame ("a FIXME from 2012", shallow edge marked "or earlier"), the
  last commit subject in the lair, and the big one: any public GitHub repo
  becomes a dungeon in the browser (Pyodide worker running the real
  analyzer, lite.py backend without tree-sitter). `npm run py` fetches the
  Pyodide bundle into game/public/pyodide (gitignored, CI does it too).

- Round 3 (owner approved PRODUCT/DESIGN, no GitHub yet): runs save as an
  action log and resume, replay links (?watch=), run codes (flask-4821),
  settings screen (text size, Okabe-Ito colorblind palette, high contrast,
  calm motion, tips reset), tap to inspect on phones, render only when
  needed, actions pinned to SHAs + npm ci --ignore-scripts (dependabot
  was tried and turned off 2026-10-03; bump pins by hand),
  six more gallery languages, GitHub history for browser builds, then vs
  now comparisons (#/vs/owner/repo@a..b).

- Round 4: optional GitHub token in settings (tab or device storage, only
  sent to api.github.com). With it, browser builds get TODO years from
  GraphQL blame. Years in browser builds are text only and boss history is
  all or nothing, so a link builds the same dungeon for everyone, token or
  not. Boss rooms in browser builds also show their last commit subject.

- Round 5 (owner: "the menu is full of stuff, my eyes go crazy"):
  - Critique (Nielsen 25/40, aesthetic 1/4) in .impeccable/critique, fixes
    from it: rock letters muted, lowercase and off the bloom layer, a clear
    ring around the @, remembered tiles brighter; HUD leads with an HP gauge,
    loot moved to yellow so green only means health; keys pane, empty panel
    states and log lines that repeated the floor card are gone (quiet
    messages still go to the run log); title is the list plus four keys,
    the rest behind tab; end screen the same; choice cards sit low.
  - Attract mode: the bot plays a random gallery dungeon behind the title.
  - Music (src/audio): live WebAudio, seeded by HEAD, Dorian/Aeolian/
    Phrygian by depth, drums on contact with hysteresis, boss motif from
    the name, breathers every 64 bars. Sound is now on by default.
    `node scripts/render-music.mjs` renders every mood to WAV.
  - Analyzer: dead code ghosts, import-cycle loops (Tarjan), root manifest
    dependencies, blame authors, boss complexity a year back.
  - Game: ghosts, loop corridors, the vendor, git checkout HACK, daily
    twists with Wordle-style first try, race a ghost (race links), bestiary,
    folder-on-disk builds, GIF and asciinema clips.
  - Share text no longer carries a localhost link; release workflow ships
    a zip on tags; TypeScript 7 and current action pins.

- Round 6 (owner: music is great, keep going; do everything pending):
  - `headcrawl play` builds a dungeon and serves the bundled game;
    scripts/bundle-game.sh puts the game in the wheel; a hand-run pypi
    workflow with trusted publishing; docs/PUBLISHING.md. Nothing published.
  - app.ts split to 797 lines (director, eventfx, pointer, builder,
    exports, titlemenu, settingsmenu, records, watch).
  - Music: menu, shop, build moods; ghost hum and daily bell layers;
    instruments per language.
  - The bot shops; floor-wide git checkout from per-room history; floor
    keepers (top committer) as & NPCs; four more gallery repos.
  - Not done on purpose: confirming ghosts with GitHub code search in
    browser builds. It needs a token, so a link would build different
    ghosts for people with and without one.

- Round 7: browser builds fetch the floors a year back (1 API call plus
  raw files), difficulty setting (story/normal/hard, part of the run and
  its code: flask-4821-hard; dailies stay normal), second design pass
  (27/40 from 25: phone pad gets menu/panel/help, one key per action,
  one difficulty vocabulary, quieter title demo, cropped minimap),
  e2e for hard codes and phone pause, gemma4 vs qwen2.5 flavor check.

- Round 8 (owner: keep building, find what's thin; bestiary, stats, bonuses,
  weapons):
  - game.ts split into combat.ts, foes.ts and items.ts (813 to 448 lines,
    same rolls, bot results identical before and after).
  - Gear (game/gear.ts): one weapon, one armor. Weapon trait from the file's
    language (Rust pierces, Go never misses, Python cleaves, JS async, C
    unsafe, Java knocks back, Swift heals on kills, PHP loose). Armor is the
    biggest test file's suite or a language-flavoured guard around a
    function. Sources: FIXMEs, boss drops (their own function), 3% of kills,
    vendor deals. Swap card with T/D codes in the run log. RULES 4.
  - Character sheet (c, @, pause menu, or click atk/def) from game/stats.ts.
  - 10 more perks (21 in all), rare ones weighted 1 against 3; 4 more vendor
    deals (sdk weapon, @types armor, abandoned, fork); code owners buys both.
  - Elites (game/elites.ts): one per room of 3+, god function / deeply
    nested / hot path. Remote calls: network-named small functions shoot
    along a telegraphed line.
  - Bestiary fills in per kind, elite and weapon trait, with hints for
    unmet ones; codex keeps old data.
  - Balance: 30 monsters a floor (60% of the rest's XP passed on), bosses
    grow 10% a floor, smaller gear curve. Bot 45 of 60 again; axum kills
    450 to about 220. The bot now walks to the nearest unseen room.
  - Design pass 27 to 29/40 (.impeccable/critique): faint text contrast,
    gear card deltas, weapon swing effect, HUD stats open the sheet.

- After round 8 (owner: do all the next ideas): the @ carries a bar in its
  weapon's language color and a steel line with armor on; the side panel
  lists six monsters and folds the rest, marks elites, and folds a long tool
  list into "12 tools, c lists them"; the bestiary lists met entries first;
  elite tiles keep a floor of brightness. A careful bot style (best perk,
  only worthwhile deals, rests to full, drinks early when surrounded) runs
  next to the plain one in the balance report.

- Round 9 (owner: sounds, boss styles, ranged, more repo data, a test
  area, modern menus, impeccable on everything):
  - Sounds for gear, remote aim, loops, rewinds, branches, menu ticks.
  - The lab (#/lab, l on the title) and practice runs (p, ?practice=1):
    game/lab.ts tools + ui/labpanel.ts. npm run sim (sim/balance.sim.ts).
  - Boss styles from the boss's own code (game/bossmoves.ts); the analyzer
    writes boss nesting, params and nloc.
  - Review comments (f): game/ranged.ts, ui/aim.ts. Rules 5 (now 7).
  - Analyzer: deprecated functions and conflict hunks (markers.py), up to 8
    branches from command line builds. Game: deprecated hits slow you,
    conflict rooms add "theirs", Y doors check out a branch floor.
  - Gallery rebuilt with flavor (18 of 20 repos have branches).
  - Menus redesigned after research (Brogue, Cogmind, Qud, Balatro):
    framed windows, tabs, key-cap buttons, a title with a detail pane, tabbed
    help and bestiary, and a side panel in fixed regions. Critique 29 to 32.
  - Bots: plain 39 of 60, careful 50 of 60 on the rebuilt gallery.

- Round 10 (owner: the git angle was the hook, but too much only makes sense
  to programmers; keep the soul, widen it; check for AI text; do all of it):
  - PRODUCT.md now says anyone who likes a short roguelike. New principle:
    game words first, code words second.
  - ui/glossary.ts holds what every thing is (potion, scroll, curse, shop,
    side door, keeper, outdated...) with the code it came from on a faint
    line. Help, bestiary, panel and hover tips read from it; a test keeps
    code words out of what things do. Messages reworded the same way; tools
    get a line about the real thing. Elites and boss styles are huge, deep,
    hot and crowded.
  - Warm-up (game/warmup.ts): floor 1 is fights and loot, the shop, elites,
    outdated and reverted code come on floor 2, keepers, side doors and
    two-version rooms on floor 3. Last floor, hard and the lab have it all.
  - Welcome card once per browser, a start-here dungeon, the title's detail
    pane lists floors and the last boss's line, an idle side panel says who
    to hunt, tabs scroll on phones, help rows stack, log lines go to a
    screen reader live region.
  - Bosses carry the first lines of their own code (analyzer code_excerpt).
  - Gamepads (ui/gamepad.ts), trophies (game/trophies.ts, 12 of them),
    reverted files (a monster that comes back once at half HP), heat levels
    hard 2 to 4, unlocked by clearing the one before.
  - Balance: bosses grow 15% a floor and the last ones can get bigger. Bots:
    plain 34 of 60, careful 47 of 60.
  - No AI-sounding words, em dashes or emojis found in the repo.
  - Dropped from next ideas: side branches in browser builds. Nothing that
    is both token-free and pinned to a commit lists them.

- Round 11 (owner: afraid the UI and type look AI-made; every UI element
  should make sense in a video game):
  - Research: Cogmind's font posts (a map font and a separate text font,
    readability over theme), and the game-ui-tells list from the
    SillyToolValley game-ux-ui skill (web buttons, no focus state, no input
    prompts, boxes around everything).
  - Type: Silkscreen caps for labels (titles, tabs, headings, HUD stat
    names, tags, keys), VT323 for everything you read.
  - Keys are glyph plates. Overlay buttons became menus: a cursor row,
    focus starts on the main action, arrows and the pad's A work. Level-up,
    shop and gear choices are rows. No more lifted chips with drop shadows.
    Title extras are a prompt strip. Panel headings run into a rule line.
  - Copy: dropped "not just X" lines, "let's go", "Quiet, for now".
  - e2e for the pause menu cursor.
  - Then: a dot-grid minimap with a MAP heading, key plates in help, 16px
    HUD labels. CI runs again (runners came back on their own).

- Round 12 (owner: too much about code on every screen; keep the repos,
  make it understandable):
  - Research: progressive disclosure (show what you can act on, the rest
    on request), Slay the Spire's keyword plus tooltip, a roguelike HUD
    review that faults DCSS and ADOM for stat dumps.
  - New setting, code details: on hover (default) or everywhere
    (ui/detail.ts). On hover, the panel says what a monster does and how
    hard it hits instead of paths/depth/inputs/line; rooms go by file name;
    the HUD hunts the boss's title; boss and floor cards drop paths and the
    boss's code; the title list shows names and floor counts; loot is just
    its quote. Hover tips keep everything, game facts on top and the code
    under a rule.
  - Log lines have a plain version and a full one (Game.say's `full`): the
    log shows the plain one unless code details are on, the run log keeps
    the full one. Git jokes, authors and source paths moved there.
  - Tools have game names (Keen Eye, Parry, Last Stand...); the dev term is
    in the hover tip and shows with code details on. A test keeps code
    words out of them.
  - Gallery rebuilt at current HEADs with flavor (qwen2.5:7b). It turned up
    a real bug: a helper a boss called mid-turn wasn't marked as taken, so
    a monster moving after it could step onto it. Fixed, with a test.
  - Bots on the rebuilt gallery: plain 29 of 60, careful 40 of 60 (bigger
    repos now, ky and gin have 6 floors). Left alone until a playtest.
  - docs/PLAYTEST.md: a script for a playtest with someone who doesn't code.

- Round 13 (owner: monsters, gear and the pack still read as raw function
  names; pick between accessible and a tool to learn code. Chose both):
  - game/names.ts: gameName turns an identifier into a name (load_payload
    is the Payload Loader, coerce_str the String Coercer, __init__ the
    Starter); bosses go by their title; gear gets a noun from how it fights
    (Payload Loader's Spear, Signer Mail); weapon traits got plain names
    (piercing, quick, reckless); rooms are "the Signer's room".
  - Log lines carry names as tags with both forms (named/showNames): the
    screen shows the game name, or the real one with code details on, and
    the run log always the real one. A test plays a gallery dungeon and
    fails if a raw snake_case name reaches the default log.
  - The learn layer is the hover tip under its rule: real name, signature,
    what it does in its author's words (new `doc` on enemies and bosses:
    first sentence of the docstring or the comment above, analyzer
    text.function_doc) or else what its name says ("it loads payload"),
    and its shape in plain words. 1253 of 4373 gallery monsters have a doc.
  - Gallery rebuilt with docs (same HEADs, headcrawl moved).

- Round 14 (owner: launch check, then fix names, swap MediatR, sell the README):
  - Launch check: CI green, analyzer 92% / game 87% line coverage, npm
    audit fixed (vite dev server, fast-uri), pip-audit clean, the release
    zip path served by play.py plays and builds a GitHub repo in the tab.
  - MediatR moved to the RPL 1.5 (strong copyleft, or a paid license), so
    it left the gallery. Polly (BSD-3, C#) took its place.
  - Names: anonymous functions are wisps (Main Wisp), operators the
    Operator, short letter groups read out (Store Getter, Tap IO), a word
    said twice is said once, path_is_valid is a Path Judge, a boss's own
    weapon is named after its title (the Unsigner's Spear). Boss lines say
    the title too, and the panel stopped repeating it.
  - README rewritten to sell the game: gameplay GIF (recorded with the bot
    in the dev build, ffmpeg to 720px/8fps), fresh screenshots including a
    hover tip, badges, credits. Same writing rules apply to release notes.
  - The title screen's demo caption is gone; number keys no longer type
    into the title's search boxes.

## Next ideas

- Balance: npm run sim gives both bots on the whole gallery. Still worth a
  real playtest before retuning; the lab makes any fight easy to set up.
- A playtest by someone who doesn't code (docs/PLAYTEST.md): does the
  welcome card and help get them through floor 1 without asking anything?
- Flavor: gemma4 works on Ollama 0.35.1 (`--model gemma4`). Tried both on
  itsdangerous 2026-10-04: gemma4 is a little punchier, qwen2.5:7b gets
  more lines past the filter. qwen2.5:7b stays the default.

## Notes

- Analyzer coverage 94%, game logic coverage 93% of lines (2026-10-05).
- Loot is rare in clean repos (flask and express have no tags), so monsters
  drop coffee and shrines heal.
- Balance targets: the plain bot wins small repos sometimes and dies to final
  bosses on bigger ones; the careful bot wins a bit more. Humans can retreat into corridors and use items, the bot can't.
- `work/` is gitignored scratch space.
- PRODUCT.md and DESIGN.md approved by the owner (2026-10-02).
