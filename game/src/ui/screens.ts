import type { Game } from "../game/game";
import { h, plural } from "./dom";
import type { Change, Comparison } from "../lite/compare";
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

/** The one button a screen is mostly there for. */
function primary(b: HTMLElement): HTMLElement {
  b.classList.add("primary");
  return b;
}

/** A key button: the key in a cap, then what it does. Every menu uses these. */
export function btn(key: string, label: string, onclick: () => void) {
  return h("button", { class: "key", type: "button", onclick }, h("kbd", null, key), h("span", null, label));
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
    row("c", "you: every number behind a fight, your gear and tools"),
    row("f", "review comment: half a hit on a monster up to 5 cells away, tab picks, f sends"),
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
    row("/ weapon", "a FIXME, or a function a monster or boss dropped. Fights like its language: Rust pierces, Go never misses, Python cleaves"),
    row("[ armor", "a test suite, or the error handling around a function. Takes defense off every hit"),
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

const END_KEYS: Record<string, keyof EndHandlers> = {
  r: "again",
  c: "copy",
  s: "save",
  w: "replay",
  g: "race",
  v: "gif",
  a: "cast",
  tab: "more",
  escape: "menu",
};

/** Keys on the end screen, the same actions as its buttons. */
export function endKey(e: KeyboardEvent, on: EndHandlers | null): void {
  const name = END_KEYS[e.key.toLowerCase()];
  if (!name || !on) return;
  if (e.key === "Tab") e.preventDefault();
  on[name]();
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
    h("h1", { class: won ? "t-loot glow" : "t-bad glow" }, won ? "HEAD reached" : "segfault"),
    won ? null : h("pre", { class: "tomb", "aria-hidden": "true" }, TOMB),
    won
      ? h("p", null, "You beat ", h("span", { class: "t-boss" }, f.boss.name), `, ${f.boss.title}, and walked out the top of ${game.spec.repo.name}.`)
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
        ? primary(btn("r", "play this run yourself", on.again))
        : primary(btn("r", won ? "again, new rolls" : "try again, new rolls", on.again)),
      btn("c", copied ? "copied" : "copy result", on.copy),
      btn("m", "repo list", on.menu),
      btn("tab", more ? "less" : "more", on.more),
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

/** The big title card for a new floor or a boss, over the map. */
export function bannerCard(kicker: string, name: string, kind: "boss" | "floor", sub: string, quote?: string, style?: string) {
  return h(
    "div",
    { class: "card" },
    h("div", { class: "card-kicker" }, kicker),
    h("div", { class: `card-name ${kind}${name.length > 14 ? " long" : ""}` }, name),
    h("div", { class: "card-sub" }, sub),
    style ? h("div", { class: "card-style" }, style) : null,
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
    h("p", { class: "dim" }, "More GitHub calls an hour, and TODO years and authors in repos built here."),
    h(
      "p",
      { class: "faint" },
      "A ",
      h("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener noreferrer" }, "fine-grained token"),
      ", public repos read-only. Only ever sent to api.github.com.",
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
      h("button", { class: "key", type: "submit" }, h("kbd", null, "enter"), h("span", null, "save")),
      place === "none" ? null : h("button", { class: "key", type: "button", onclick: on.clearToken }, h("span", null, "forget it")),
    ),
    note ? h("p", { class: note.ok ? "t-good" : "t-bad", role: "status" }, note.text) : null,
  );
}

export interface PauseHandlers {
  copy(): void;
  resume(): void;
  sheet(): void;
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
      primary(btn("esc", "resume", on.resume)),
      btn("@", "you: stats, gear, tools", on.sheet),
      code ? btn("c", "copy run code", on.copy) : null,
      btn("r", "new run, new rolls", on.restart),
      btn(",", "settings", on.settings),
      btn("m", "repo list", on.menu),
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
