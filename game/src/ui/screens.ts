import type { Game } from "../game/game";
import { PERKS, type PerkId } from "../game/perks";
import type { Offer } from "../game/extras";
import { ABILITY } from "../game/abilities";
import { topDeaths, type Codex } from "./codex";
import { h, plural } from "./dom";
import { bestFor, bestLabel } from "./best";
import type { GalleryEntry } from "./gallery";
import type { Change, Comparison } from "../lite/compare";
import type { Recent } from "./recent";
import type { SavedRun } from "./save";
import type { Settings } from "./settings";
import type { TokenPlace } from "./token";

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

// Difficulty as a word, not another row of # marks.
const DIFF: Record<number, [string, string]> = {
  1: ["gentle", "t-good"],
  2: ["easy", "t-good"],
  3: ["fair", "t-loot"],
  4: ["hard", "t-bad"],
  5: ["brutal", "t-boss"],
};

export interface TitleHandlers {
  play(slug: string): void;
  daily(): void;
  build(target: string): void;
  reopen(r: Recent): void;
  resume(s: SavedRun): void;
  code(text: string): void;
  compare(repo: string, ref: string): void;
  settings(): void;
  open(): void;
  help(): void;
  toggleMore(): void;
  showCode(): void;
  bestiary(): void;
  folder(): void;
}

export interface Daily {
  repo: string;
  label: string;
  /** Today's ranked try is used up; later runs are practice. */
  played?: boolean;
}

/** What is unfolded on the title screen right now. */
export interface TitleView {
  more: boolean;
  code: boolean;
}

function form(onsubmit: (f: HTMLFormElement) => void, ...children: (HTMLElement | null)[]) {
  return h(
    "form",
    {
      class: "build",
      onsubmit: (e: Event) => {
        e.preventDefault();
        onsubmit(e.target as HTMLFormElement);
      },
    },
    ...children,
  );
}

function field(name: string, placeholder: string, label: string) {
  return h("input", { name, type: "text", placeholder, autocomplete: "off", spellcheck: "false", "aria-label": label });
}

const value = (f: HTMLFormElement, name: string) => (f.elements.namedItem(name) as HTMLInputElement).value;

export function titleScreen(
  entries: GalleryEntry[],
  selected: number,
  error: string | null,
  daily: Daily | null,
  on: TitleHandlers,
  recent: Recent[] = [],
  saves: SavedRun[] = [],
  view: TitleView = { more: false, code: false },
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
          e.difficulty ? h("span", { class: `diff ${DIFF[e.difficulty]?.[1] ?? "dim"}` }, DIFF[e.difficulty]?.[0] ?? "") : h("span"),
        ),
      ),
    ),
  );
  const pick = entries[selected];
  const best = pick ? bestLabel(bestFor(pick.head)) : "";
  const detail = pick
    ? h(
        "p",
        { class: "detail" },
        `${plural(pick.floors, "floor")}, ${pick.enemies} monsters. The last boss is `,
        h("span", { class: "t-boss" }, pick.boss),
        ".",
        best ? h("span", { class: "t-loot" }, `  ${best}`) : null,
      )
    : null;
  const save = saves[0];

  const more = view.more
    ? h(
        "section",
        { class: "more", "aria-label": "More ways to play" },
        h("h2", null, "any public GitHub repo"),
        form(
          (f) => on.build(value(f, "repo")),
          field("repo", "owner/repo or a github.com link", "GitHub repo"),
          h("button", { class: "btn", type: "submit" }, h("kbd", null, "[enter]"), " build"),
        ),
        recent.length
          ? h(
              "p",
              { class: "recent" },
              h("span", { class: "faint" }, "built before: "),
              ...recent.map((r) => h("button", { class: "btn", type: "button", onclick: () => on.reopen(r) }, `${r.owner}/${r.repo}`)),
            )
          : null,
        h("h2", null, "then vs now"),
        form(
          (f) => on.compare(value(f, "vsrepo"), value(f, "vsref")),
          field("vsrepo", "owner/repo", "Repo to compare"),
          field("vsref", "an older tag, like v1.0.0", "Older tag, branch or commit"),
          h("button", { class: "btn", type: "submit" }, h("kbd", null, "[enter]"), " compare"),
        ),
        h("h2", null, "a folder on this computer"),
        h(
          "div",
          { class: "actions" },
          btn("f", "pick a folder", on.folder),
          h("span", { class: "faint" }, "  read in this tab, never uploaded"),
        ),
        h("p", { id: "build-status", class: "faint", role: "status" }, "Built in your browser. Nothing in the repo runs."),
        h(
          "div",
          { class: "actions" },
          btn("o", "open a dungeon.json", on.open),
          btn("b", "bestiary", on.bestiary),
          btn(",", "settings", on.settings),
          btn("?", "how it works", on.help),
        ),
      )
    : null;

  return h(
    "div",
    { class: "page title" },
    h("pre", { class: "wordmark", "aria-label": "HEADCRAWL" }, wordmark()),
    h("p", { class: "tagline" }, "A git repo, played as a dungeon."),
    save
      ? h(
          "button",
          { class: "continue", type: "button", onclick: () => on.resume(save) },
          h("kbd", null, "[space]"),
          " continue ",
          h("span", { class: "name" }, save.repo),
          h("span", { class: "dim" }, `, floor ${save.floor} of ${save.floors}`),
        )
      : null,
    entries.length ? list : h("p", { class: "dim" }, "No gallery here. Open a dungeon file instead."),
    detail,
    error ? h("p", { class: "error", role: "alert" }, error) : null,
    h(
      "div",
      { class: "actions main" },
      btn("enter", "descend", () => pick && on.play(pick.slug)),
      daily ? btn("d", daily.played ? "daily, practice" : `daily: ${daily.repo.split("/").pop()}`, on.daily) : null,
      btn("c", "run code", on.showCode),
      btn("tab", view.more ? "less" : "more", on.toggleMore),
    ),
    view.code
      ? form(
          (f) => on.code(value(f, "code")),
          field("code", "flask-4821, or a whole link", "Run code or link"),
          h("button", { class: "btn", type: "submit" }, h("kbd", null, "[enter]"), " play it"),
        )
      : null,
    h("p", { id: "code-status", class: "dim", role: "status" }),
    more,
    h("p", { id: "attract", class: "attract faint", "aria-hidden": "true" }),
  );
}

export function helpScreen(close: () => void) {
  const row = (a: string, b: string) => h("p", { class: "row" }, h("span", { class: "t-loot" }, a), h("span", null, b));
  return h(
    "div",
    { class: "page" },
    h("h1", { class: "t-boss" }, "how it works"),
    h("p", { class: "dim" }, "Every number in the game comes from the code. Same commit, same dungeon."),
    h("h2", null, "keys"),
    row("arrows, hjkl, yubn", "move, walk into things to attack"),
    row("x", "explore until something shows up"),
    row("z", "rest until healed"),
    row(". or space", "wait a turn"),
    row(">", "take the stairs once the boss is dead"),
    row("q / r", "drink a TODO / read a HACK"),
    row("click or tap", "walk there; hover a monster to inspect it"),
    row("tab", "show or hide the side panel"),
    row("m / ,", "sound, settings"),
    h("h2", null, "the map"),
    row("folder", "a floor. Deeper floors hold code the rest imports."),
    row("file", "a room, sized by lines of code"),
    row("~ import", "a corridor between files that import each other"),
    row("# passage", "a corridor between neighbours in the folder tree"),
    row("loop", "an import cycle. The corridor walks you back where you came from, once."),
    row("test file", "a shrine (*). Step on it to heal, once."),
    row("$ vendor", "sells the repo's dependencies. Each one helps, and each one costs."),
    row("& keeper", "whoever committed most to the floor. Say hi once for a coffee."),
    h("h2", null, "monsters"),
    row("a function", "a monster named after it"),
    row("complexity", "hit points"),
    row("nesting depth", "how hard it hits"),
    row("parameters", "how fast it moves"),
    row("tangle", "lots of branches. Regrows, finish it fast."),
    row("nest", "deep nesting. Winds up a big hit: step out of the red."),
    row("hydra", "too many parameters. Splits in two when hurt."),
    row("wall", "very long function. Armored and slow."),
    row("imp", "tiny function. Fast."),
    row("ghost", "nothing calls it. Drifts through walls, hits softly."),
    row("bug", "everything else. Dodges now and then."),
    row("boss", "the hotspot: most churn times complexity. The red cells are where it lands."),
    h("h2", null, "loot"),
    row("! TODO", "heals when you finally do it"),
    row("/ FIXME", "a weapon, more attack"),
    row("? HACK", "a random trick. Sometimes git checkout: the floor as it was a year ago"),
    row("% XXX", "cursed: attack up, max HP down"),
    row("c coffee", "dropped by monsters, heals a little"),
    h("h2", null, "your own repo"),
    h("p", { class: "dim" }, "Press tab on the title screen to build any public GitHub repo here. The command line tool also reads full git history:"),
    h("pre", { class: "code" }, "cd analyzer\nuv run headcrawl analyze path/to/your/repo -o mine.json"),
    h("p", { class: "dim" }, "Then drop mine.json anywhere on the title screen."),
    h("div", { class: "actions" }, btn("esc", "back", close)),
  );
}

const KINDS = ["tangle", "nest", "hydra", "wall", "imp", "bug", "ghost", "spawn"] as const;

export function bestiaryScreen(c: Codex, close: () => void) {
  const row = (a: string, b: string, cls = "t-loot") => h("p", { class: "row" }, h("span", { class: cls }, a), h("span", null, b));
  const deaths = topDeaths(c);
  return h(
    "div",
    { class: "page" },
    h("h1", null, "bestiary"),
    c.runs
      ? h("p", { class: "dim" }, `${plural(c.runs, "run")} in ${plural(c.repos.length, "repo")}, ${c.wins} cleared. Kept in this browser.`)
      : h("p", { class: "dim" }, "Nothing yet. Finish a run and it shows up here."),
    h("h2", null, "refactored"),
    ...KINDS.map((k) => row(`${k} x${c.kills[k] ?? 0}`, ABILITY[k], c.kills[k] ? "t-loot" : "faint")),
    c.bosses.length ? h("h2", null, "bosses beaten, gnarliest first") : null,
    ...c.bosses.map((b) => row(b.name, `${b.repo}, ${plural(b.ccn, "branch")}`, "t-boss")),
    deaths.length ? h("h2", null, "what keeps getting you") : null,
    ...deaths.map(([name, n]) => row(name, `x${n}`, "t-bad")),
    h("div", { class: "actions" }, btn("esc", "back", close)),
  );
}

export interface EndHandlers {
  again(): void;
  copy(): void;
  save(): void;
  replay(): void;
  race(): void;
  gif(): void;
  cast(): void;
  menu(): void;
  more(): void;
}

const TOMB = ["    _______", "   /       \\", "  /  R.I.P  \\", "  |         |", "  |  HEAD~1 |", "  |         |", "__|_________|__"].join("\n");

export function endScreen(game: Game, share: string, copied: boolean, on: EndHandlers, watched = false, more = false) {
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
      btn("esc", "pick another repo", on.menu),
      btn("tab", more ? "less" : "share and save", on.more),
    ),
    more
      ? h(
          "div",
          { class: "actions more" },
          btn("g", "copy race link", on.race),
          btn("w", "copy replay link", on.replay),
          btn("v", "save a GIF", on.gif),
          btn("a", "save an asciinema cast", on.cast),
          btn("s", "save run log", on.save),
        )
      : null,
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

export function vendorCard(offers: Offer[], pick: (index: number) => void) {
  return h(
    "div",
    { class: "card choice", role: "dialog", "aria-label": "The vendor" },
    h("div", { class: "card-kicker" }, "a vendor. one dependency per floor"),
    ...offers.map((o, i) =>
      h(
        "button",
        { class: "perk", type: "button", onclick: () => pick(i) },
        h("kbd", null, `[${i + 1}]`),
        h("span", { class: "perk-name" }, o.dep.name),
        h("span", { class: "perk-text" }, o.deal.text),
      ),
    ),
    h("button", { class: "perk", type: "button", onclick: () => pick(-1) }, h("kbd", null, "[esc]"), h("span", { class: "perk-name" }, "walk away"), h("span")),
  );
}

/** The big title card for a new floor or a boss, over the map. */
export function bannerCard(kicker: string, name: string, kind: "boss" | "floor", sub: string, quote?: string) {
  return h(
    "div",
    { class: "card" },
    h("div", { class: "card-kicker" }, kicker),
    h("div", { class: `card-name ${kind}${name.length > 14 ? " long" : ""}` }, name),
    h("div", { class: "card-sub" }, sub),
    quote ? h("div", { class: "card-quote" }, `"${quote}"`) : null,
  );
}

/** The card for the floor you just arrived on, with the daily twist on the first one. */
export function floorBanner(game: Game, twist: { name: string; text: string } | null) {
  const f = game.floorSpec;
  const today = f.index === 0 && twist ? `. Today: ${twist.name}. ${twist.text}` : "";
  return bannerCard(`floor ${f.index + 1} of ${game.spec.floors.length}`, f.name, "floor", `${f.rooms.length} files. Somewhere in here: ${f.boss.name}${today}`);
}

export interface CompareHandlers {
  playThen(): void;
  playNow(): void;
  menu(): void;
}

function delta(a: number, b: number): string {
  const d = b - a;
  return `${a} -> ${b}  (${d >= 0 ? "+" : ""}${d})`;
}

export function compareScreen(repo: string, c: Comparison, on: CompareHandlers) {
  const row = (label: string, value: string) => h("p", { class: "row" }, h("span", { class: "t-loot" }, label), h("span", null, value));
  const change = (x: Change) =>
    h("p", { class: "row" }, h("span", { class: "name" }, x.name), h("span", { class: "dim" }, `${x.before} -> ${x.after} branches, ${x.path}`));
  return h(
    "div",
    { class: "page" },
    h("h1", null, "then vs now"),
    h("p", { class: "dim" }, `${repo}, ${c.then.head.slice(0, 7)} against ${c.now.head.slice(0, 7)}.`),
    h("h2", null, "the dungeon"),
    row("floors", delta(c.then.floors, c.now.floors)),
    row("files", delta(c.then.files, c.now.files)),
    row("functions", delta(c.then.functions, c.now.functions)),
    row("lines of code", delta(c.then.loc, c.now.loc)),
    row("loot (TODO and friends)", delta(c.then.todos, c.now.todos)),
    row("monsters born", String(c.born)),
    row("monsters slain", String(c.slain)),
    h("h2", null, "final boss"),
    row("then", c.bossThen),
    row("now", c.bossNow),
    c.grew.length ? h("h2", null, "grew more branches") : null,
    ...c.grew.map(change),
    c.shrank.length ? h("h2", null, "got simpler") : null,
    ...c.shrank.map(change),
    c.todosAdded.length ? h("h2", null, "new notes") : null,
    ...c.todosAdded.map((t) => h("p", { class: "t-lore" }, t)),
    c.todosDone.length ? h("h2", null, "notes that are gone") : null,
    ...c.todosDone.map((t) => h("p", { class: "dim" }, t)),
    h(
      "div",
      { class: "actions" },
      btn("1", "play then", on.playThen),
      btn("2", "play now", on.playNow),
      btn("esc", "repo list", on.menu),
    ),
  );
}

export interface SettingsHandlers {
  sound(): void;
  music(): void;
  text(): void;
  colors(): void;
  motion(): void;
  level(): void;
  tips(): void;
  saveToken(text: string, remember: boolean): void;
  clearToken(): void;
  close(): void;
}

const TOKEN_PLACES: Record<TokenPlace, string> = {
  none: "No token. GitHub allows 60 calls an hour, and built repos have no TODO dates.",
  tab: "Token saved until this tab closes.",
  device: "Token remembered on this device.",
};

const LEVEL_NAMES = {
  story: "story: monsters hit for half",
  normal: "normal",
  hard: "hard: tougher monsters that hit harder",
} as const;

const COLOR_NAMES = { glow: "glow (default)", colorblind: "colorblind friendly", contrast: "high contrast" } as const;

export interface TokenView {
  place: TokenPlace;
  /** What just happened to the token, if anything. */
  note?: { text: string; ok: boolean };
}

export function settingsScreen(s: Settings, on: SettingsHandlers, note = "", token: TokenView = { place: "none" }) {
  const row = (key: string, label: string, value: string, act: () => void) =>
    h(
      "p",
      { class: "row" },
      h("span", { class: "t-loot" }, `[${key}] ${label}`),
      h("button", { type: "button", onclick: act }, value),
    );
  return h(
    "div",
    { class: "page settings" },
    h("h1", null, "settings"),
    h("p", { class: "dim" }, "Press the key or click the value to change it. Saved in this browser."),
    row("1", "sound", s.sound ? "on" : "off", on.sound),
    row("2", "music", !s.music ? "off" : s.sound ? "on" : "on, once sound is on", on.music),
    row("3", "text size", s.text, on.text),
    row("4", "colors", COLOR_NAMES[s.colors], on.colors),
    row("5", "motion", s.motion === "full" ? "full: shake, flashes, sparks" : "calm: no shake, flashes or sparks", on.motion),
    row("6", "difficulty", LEVEL_NAMES[s.level], on.level),
    row("7", "tips", "show them again", on.tips),
    note ? h("p", { class: "t-good", role: "status" }, note) : null,
    tokenSection(token, on),
    h("div", { class: "actions" }, btn("esc", "back", on.close)),
  );
}

function tokenSection({ place, note }: TokenView, on: SettingsHandlers): HTMLElement {
  return h(
    "section",
    { "aria-labelledby": "token-heading" },
    h("h2", { id: "token-heading" }, "github token (optional)"),
    h(
      "p",
      { class: "dim" },
      "With your own token GitHub allows 5000 calls an hour, and repos built here show the year each TODO was written. ",
      h("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener noreferrer" }, "Make a fine-grained token"),
      " with public repos read-only and no other permissions. It stays in this browser and is only sent to api.github.com.",
    ),
    h("p", { class: place === "none" ? "faint" : "t-good" }, TOKEN_PLACES[place]),
    h(
      "form",
      {
        class: "build",
        onsubmit: (e: Event) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const input = form.elements.namedItem("token") as HTMLInputElement;
          const remember = form.elements.namedItem("remember") as HTMLInputElement;
          on.saveToken(input.value, remember.checked);
          input.value = "";
        },
      },
      h("input", {
        name: "token",
        type: "password",
        placeholder: "github_pat_...",
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": "GitHub token",
      }),
      h("label", { class: "dim" }, h("input", { name: "remember", type: "checkbox" }), " remember on this device"),
      h("button", { class: "btn", type: "submit" }, h("kbd", null, "[enter]"), " save"),
      place === "none" ? null : h("button", { class: "btn", type: "button", onclick: on.clearToken }, "forget it"),
    ),
    note ? h("p", { class: note.ok ? "t-good" : "t-bad", role: "status" }, note.text) : null,
  );
}

export interface PauseHandlers {
  resume(): void;
  restart(): void;
  settings(): void;
  menu(): void;
}

export function pauseScreen(on: PauseHandlers, code: string | null = null, where = "") {
  return h(
    "div",
    { class: "page" },
    h("h1", null, "paused"),
    where ? h("p", null, where) : null,
    h("p", { class: "dim" }, "Your run is saved in this browser. Close the tab and it will be here when you come back."),
    code
      ? h("p", null, "Run code ", h("span", { class: "t-loot" }, code), h("span", { class: "dim" }, ". Same dungeon, same rolls, for anyone you give it to."))
      : null,
    h(
      "div",
      { class: "actions" },
      btn("esc", "resume", on.resume),
      btn("n", "start a new run", on.restart),
      btn(",", "settings", on.settings),
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
