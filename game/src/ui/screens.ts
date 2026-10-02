import type { Game } from "../game/game";
import { h, plural } from "./dom";
import type { GalleryEntry } from "./gallery";

// The wordmark is built from the same [] bricks as the dungeon walls.
const LETTERS: Record<string, string[]> = {
  H: ["#...#", "#...#", "#####", "#...#", "#...#"],
  E: ["#####", "#....", "####.", "#....", "#####"],
  A: [".###.", "#...#", "#####", "#...#", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", ".####"],
  R: ["####.", "#...#", "####.", "#..#.", "#...#"],
  W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#####"],
};

export function wordmark(word = "HEADCRAWL"): string {
  const rows = ["", "", "", "", ""];
  for (const ch of word) {
    const glyph = LETTERS[ch];
    for (let r = 0; r < 5; r++) rows[r] += glyph[r].replace(/#/g, "[]").replace(/\./g, "  ") + "  ";
  }
  return rows.map((r) => r.trimEnd()).join("\n");
}

function btn(key: string, label: string, onclick: () => void) {
  return h("button", { class: "btn", type: "button", onclick }, h("kbd", null, `[${key}]`), ` ${label}`);
}

export interface TitleHandlers {
  play(slug: string): void;
  daily(): void;
  open(): void;
  help(): void;
}

export interface Daily {
  repo: string;
  label: string;
}

export function titleScreen(
  entries: GalleryEntry[],
  selected: number,
  error: string | null,
  daily: Daily | null,
  on: TitleHandlers,
) {
  const list = h(
    "ul",
    { class: "repos", role: "listbox", "aria-label": "Repos" },
    ...entries.map((e, i) =>
      h(
        "li",
        null,
        h(
          "button",
          {
            type: "button",
            role: "option",
            "aria-current": i === selected ? "true" : "false",
            "aria-selected": i === selected ? "true" : "false",
            "data-index": i,
            onclick: () => on.play(e.slug),
          },
          h("span", { class: "mark" }, ">"),
          h("span", { class: "name" }, e.repo),
          h("span", { class: "lang" }, e.language),
          h("span", { class: "meta" }, `${plural(e.floors, "floor")}, ${e.enemies} monsters. boss: ${e.boss}`),
        ),
      ),
    ),
  );
  return h(
    "div",
    { class: "page" },
    h("pre", { class: "wordmark", "aria-label": "HEADCRAWL" }, wordmark()),
    h(
      "p",
      { class: "tagline" },
      "A roguelike where the dungeon is a git repo. Files are rooms, functions are monsters, TODOs are loot, and the code everyone keeps rewriting is the boss.",
    ),
    h("h2", null, "pick a repo"),
    entries.length ? list : h("p", { class: "dim" }, "No gallery here. Open a dungeon file instead."),
    error ? h("p", { class: "error", role: "alert" }, error) : null,
    h(
      "div",
      { class: "actions" },
      btn("enter", "descend", () => entries[selected] && on.play(entries[selected].slug)),
      daily ? btn("d", `daily run: ${daily.repo}, ${daily.label}`, on.daily) : null,
      btn("o", "open a dungeon.json", on.open),
      btn("?", "how it works", on.help),
    ),
    h("h2", null, "bring your own repo"),
    h("p", { class: "dim" }, "The analyzer runs on your machine and never executes the code it reads."),
    h("pre", { class: "code" }, "cd analyzer\nuv run headcrawl analyze path/to/your/repo -o mine.json"),
    h("p", { class: "dim" }, "Then press o, or drop the file anywhere on this page. Works with owner/repo too."),
  );
}

export function helpScreen(close: () => void) {
  const row = (a: string, b: string) => h("p", { class: "row" }, h("span", { class: "t-loot" }, a), h("span", null, b));
  return h(
    "div",
    { class: "page" },
    h("h1", { class: "t-boss" }, "how it works"),
    h("p", { class: "dim" }, "Every number in the game comes from the code."),
    h("h2", null, "the map"),
    row("folder", "a floor. Deeper floors hold code the rest imports."),
    row("file", "a room, sized by lines of code"),
    row("~ import", "a corridor between files that import each other"),
    row("# passage", "a corridor between neighbours in the folder tree"),
    row("test file", "a shrine (*). Step on it to heal, once."),
    h("h2", null, "monsters"),
    row("a function", "a monster named after it"),
    row("complexity", "its hit points"),
    row("nesting depth", "how hard it hits"),
    row("parameters", "how fast it moves"),
    row("hotspot", "the boss: most churn times complexity on the floor"),
    h("h2", null, "loot"),
    row("! TODO", "heals when you finally do it (q)"),
    row("/ FIXME", "a weapon, more attack"),
    row("? HACK", "a random trick (r)"),
    row("% XXX", "cursed: attack up, max HP down"),
    row("c coffee", "dropped by monsters, heals a little"),
    h("h2", null, "keys"),
    row("arrows, hjkl, yubn", "move and attack"),
    row("x", "explore until something shows up"),
    row("z", "rest until healed"),
    row(". or space", "wait a turn"),
    row(">", "take the stairs once the boss is dead"),
    row("click or tap", "walk to that spot"),
    row("tab", "show or hide the side panel"),
    h("p", { class: "dim" }, "Same commit, same dungeon. The seed is the HEAD hash."),
    h("div", { class: "actions" }, btn("esc", "back", close)),
  );
}

export interface EndHandlers {
  again(): void;
  copy(): void;
  menu(): void;
}

const TOMB = ["    _______", "   /       \\", "  /  R.I.P  \\", "  |         |", "  |  HEAD~1 |", "  |         |", "__|_________|__"].join("\n");

export function endScreen(game: Game, share: string, copied: boolean, on: EndHandlers) {
  const p = game.player;
  const won = game.outcome === "won";
  const f = game.floorSpec;
  const killer = game.killer;
  return h(
    "div",
    { class: "page" },
    won ? null : h("pre", { class: "tomb", "aria-hidden": "true" }, TOMB),
    h("h1", { class: won ? "t-loot glow" : "t-bad glow" }, won ? "HEAD reached" : "segfault"),
    won
      ? h("p", null, `You beat ${f.boss.name}, ${f.boss.title}, and walked out the top of ${game.spec.repo.name}.`)
      : h("p", null, "Killed by ", h("span", { class: "t-bad" }, killer ?? "something"), ` on floor ${f.index + 1} (${f.name}).`),
    h(
      "p",
      { class: "dim" },
      `Level ${p.level}. ${plural(p.kills, "function")} refactored. ${p.bosses} of ${game.spec.floors.length} bosses. ${p.turns} turns.`,
    ),
    h("pre", { class: "share" }, share),
    h(
      "div",
      { class: "actions" },
      btn("r", won ? "again, new rolls" : "try again, new rolls", on.again),
      btn("c", copied ? "copied" : "copy result", on.copy),
      btn("esc", "pick another repo", on.menu),
    ),
  );
}

export function messageScreen(title: string, body: string, back: () => void) {
  return h(
    "div",
    { class: "page" },
    h("h1", null, title),
    h("p", { class: "dim" }, body),
    h("div", { class: "actions" }, btn("esc", "back", back)),
  );
}
