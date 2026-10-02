import type { Game } from "../game/game";
import { PERKS, type PerkId } from "../game/perks";
import { h, plural } from "./dom";
import { bestFor, bestLabel } from "./best";
import type { GalleryEntry } from "./gallery";
import type { Recent } from "./recent";
import type { SavedRun } from "./save";

// The wordmark is a 5x5 pixel font drawn with full blocks.
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
    for (let r = 0; r < 5; r++) rows[r] += glyph[r].replace(/#/g, "██").replace(/\./g, "  ") + "  ";
  }
  return rows.map((r) => r.trimEnd()).join("\n");
}

function btn(key: string, label: string, onclick: () => void) {
  return h("button", { class: "btn", type: "button", onclick }, h("kbd", null, `[${key}]`), ` ${label}`);
}

const DIFF_CLASS: Record<number, string> = { 1: "t-good", 2: "t-good", 3: "t-loot", 4: "t-bad", 5: "t-boss" };

export interface TitleHandlers {
  play(slug: string): void;
  daily(): void;
  build(target: string): void;
  reopen(r: Recent): void;
  resume(s: SavedRun): void;
  code(text: string): void;
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
  recent: Recent[] = [],
  saves: SavedRun[] = [],
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
          h(
            "span",
            { class: "meta" },
            e.difficulty ? h("span", { class: DIFF_CLASS[e.difficulty] ?? "dim", title: `difficulty ${e.difficulty} of 5` }, `${"#".repeat(e.difficulty)}${"-".repeat(5 - e.difficulty)}  `) : null,
            `${plural(e.floors, "floor")}, ${e.enemies} monsters. boss: ${e.boss}`,
            bestLabel(bestFor(e.head)) ? h("span", { class: "t-loot" }, `  ${bestLabel(bestFor(e.head))}`) : null,
          ),
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
    saves.length ? h("h2", null, "continue") : null,
    saves.length
      ? h(
          "div",
          { class: "saves" },
          ...saves.map((s) =>
            h(
              "button",
              { class: "btn", type: "button", onclick: () => on.resume(s) },
              h("kbd", null, ">"),
              ` ${s.repo}, floor ${s.floor} of ${s.floors}`,
            ),
          ),
        )
      : null,
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
    h(
      "form",
      {
        class: "build",
        onsubmit: (e: Event) => {
          e.preventDefault();
          const input = (e.target as HTMLFormElement).elements.namedItem("code") as HTMLInputElement;
          on.code(input.value);
        },
      },
      h("input", {
        name: "code",
        type: "text",
        placeholder: "run code, like flask-4821",
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": "Run code",
      }),
      h("button", { class: "btn", type: "submit" }, h("kbd", null, "[enter]"), " play a code"),
    ),
    h("p", { id: "code-status", class: "dim", role: "status" }),
    h("h2", null, "any public GitHub repo"),
    h(
      "form",
      {
        class: "build",
        onsubmit: (e: Event) => {
          e.preventDefault();
          const input = (e.target as HTMLFormElement).elements.namedItem("repo") as HTMLInputElement;
          on.build(input.value);
        },
      },
      h("input", {
        name: "repo",
        type: "text",
        placeholder: "owner/repo or a github.com link",
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": "GitHub repo",
      }),
      h("button", { class: "btn", type: "submit" }, h("kbd", null, "[enter]"), " build it here"),
    ),
    recent.length
      ? h(
          "p",
          { class: "recent" },
          h("span", { class: "faint" }, "built here before: "),
          ...recent.map((r) =>
            h("button", { class: "btn", type: "button", onclick: () => on.reopen(r) }, `${r.owner}/${r.repo}`),
          ),
        )
      : null,
    h(
      "p",
      { id: "build-status", class: "dim", role: "status" },
      "Runs the analyzer in your browser. Nothing in the repo is executed. The first run downloads about 4 MB.",
    ),
    h("h2", null, "or on your machine"),
    h("p", { class: "dim" }, "The command line tool also reads git history, so bosses know which files keep changing."),
    h("pre", { class: "code" }, "cd analyzer\nuv run headcrawl analyze path/to/your/repo -o mine.json"),
    h("p", { class: "dim" }, "Then press o, or drop the file anywhere on this page."),
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
    row("m", "sound on or off"),
    h("h2", null, "leveling up"),
    row("1, 2, 3", "each level you pick one of three tools: Linter, Type checker, Caffeine, Rubber duck and more"),
    h("h2", null, "monster types"),
    row("tangle (capitals)", "lots of branches. Regrows, finish it fast."),
    row("nest", "deep nesting. Winds up a big hit: step out of the red."),
    row("hydra", "too many parameters. Splits in two when hurt."),
    row("wall (capitals)", "very long function. Armored and slow."),
    row("imp", "tiny function. Fast."),
    row("bug", "everything else. Dodges now and then."),
    row("boss", "winds up area attacks. The red cells are where it lands."),
    h("p", { class: "dim" }, "Same commit, same dungeon. The seed is the HEAD hash."),
    h("div", { class: "actions" }, btn("esc", "back", close)),
  );
}

export interface EndHandlers {
  again(): void;
  copy(): void;
  save(): void;
  replay(): void;
  menu(): void;
}

const TOMB = ["    _______", "   /       \\", "  /  R.I.P  \\", "  |         |", "  |  HEAD~1 |", "  |         |", "__|_________|__"].join("\n");

export function endScreen(game: Game, share: string, copied: boolean, on: EndHandlers, watched = false) {
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
      watched
        ? btn("r", "play this run yourself", on.again)
        : btn("r", won ? "again, new rolls" : "try again, new rolls", on.again),
      btn("c", copied ? "copied" : "copy result", on.copy),
      btn("s", "save run log", on.save),
      btn("w", "copy replay link", on.replay),
      btn("esc", "pick another repo", on.menu),
    ),
  );
}

export function perkCard(ids: PerkId[], pick: (index: number) => void) {
  return h(
    "div",
    { class: "card choice", role: "dialog", "aria-label": "Pick a tool" },
    h("div", { class: "card-kicker" }, "level up. pick a tool"),
    ...ids.map((id, i) =>
      h(
        "button",
        { class: "perk", type: "button", onclick: () => pick(i) },
        h("kbd", null, `[${i + 1}]`),
        h("span", { class: "perk-name" }, PERKS[id].name),
        h("span", { class: "perk-text" }, PERKS[id].text),
      ),
    ),
  );
}

export interface PauseHandlers {
  resume(): void;
  restart(): void;
  menu(): void;
}

export function pauseScreen(on: PauseHandlers, code: string | null = null) {
  return h(
    "div",
    { class: "page" },
    h("h1", null, "paused"),
    h("p", { class: "dim" }, "Your run is saved in this browser. Close the tab and it will be here when you come back."),
    code
      ? h("p", null, "Run code ", h("span", { class: "t-loot" }, code), h("span", { class: "dim" }, ". Same dungeon, same rolls, for anyone you give it to."))
      : null,
    h(
      "div",
      { class: "actions" },
      btn("esc", "resume", on.resume),
      btn("n", "start a new run", on.restart),
      btn("m", "back to the repo list", on.menu),
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
