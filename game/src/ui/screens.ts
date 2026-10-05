import type { Game } from "../game/game";
import { h, plural } from "./dom";
import { paneTabs } from "./win";
import { BEHIND, LOOT, MONSTERS, PLACES, type Term } from "./glossary";
import { TROPHIES } from "../game/trophies";
import { MODS } from "../game/extras";
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
  // Game words first; the faint line under each says what code it came from.
  const term = (label: string, t: Term) =>
    h("p", { class: "row" }, h("span", { class: "t-loot" }, label), h("span", null, t.does || t.real, t.does ? h("small", { class: "faint sub" }, t.real) : null));
  const kinds = ["tangle", "nest", "hydra", "wall", "imp", "bug", "ghost", "remote", "boss"] as const;
  return h(
    "div",
    { class: "page" },
    h("h1", { class: "t-boss" }, "how it works"),
    h("p", { class: "dim" }, "Get to the bottom. Each floor has a boss; beat it and the stairs down open. You get one life."),
    paneTabs([
      {
        label: "keys",
        body: [
          row("arrows, hjkl, yubn", "move, walk into things to attack"),
          row("x", "explore until something shows up"),
          row("z", "rest until healed"),
          row(". or space", "wait a turn"),
          row(">", "stairs, once the boss is dead. On a Y side door, go in"),
          row("f", "shoot a monster up to 5 cells away for half a hit. Tab picks, f shoots"),
          row("q / r", "drink a potion / read a scroll"),
          row("c", "you: every number behind a fight, your gear and tools"),
          row("click or tap", "walk there; hover a monster to see what it is"),
          row("tab", "show or hide the side panel"),
          row("m / ,", "sound, settings"),
          row("`", "lab tools, in the lab and practice runs"),
          row("gamepad", "d-pad or stick moves, A confirms, B backs out, X explores, Y rests, LB potion, RB scroll, LT shoots, RT next target, Start menu, Back this"),
        ],
      },
      { label: "the map", body: PLACES.map((p) => term(p.glyph ? `${p.glyph} ${p.name}` : p.name, p)) },
      {
        label: "monsters",
        body: [
          h("p", { class: "dim" }, "Every monster is a function from the code, named after it. The harder the code is to follow, the tougher the monster."),
          ...kinds.map((k) => term(MONSTERS[k].name, MONSTERS[k])),
          term("elite", { name: "elite", does: "drawn bold on a tile. Tougher, worth more, drops gear more often.", real: "the worst function in a busy room" }),
          term("struck through", { name: "outdated", does: "its hits slow you for 3 turns", real: "code marked as deprecated: on its way out" }),
          term("reverted", { name: "reverted", does: "the first time it dies, it comes back at half HP", real: "from a file where someone undid a change with git revert" }),
        ],
      },
      { label: "loot", body: (Object.keys(LOOT) as (keyof typeof LOOT)[]).map((k) => term(`${LOOT[k].glyph} ${LOOT[k].name}`, LOOT[k])) },
      { label: "the code", body: BEHIND.map((line) => h("p", null, line)) },
      {
        label: "your repo",
        body: [
          h("p", { class: "dim" }, "Tab 2 on the title screen builds any public GitHub repo here. The command line tool also reads full git history and other branches:"),
          h("pre", { class: "code" }, "cd analyzer\nuv run headcrawl analyze path/to/your/repo -o mine.json"),
          h("p", { class: "dim" }, "Then drop mine.json anywhere on the title screen."),
        ],
      },
    ]),
    h("div", { class: "actions" }, btn("esc", "back", close)),
  );
}

/** Once, before the first run in this browser. */
export function welcomeScreen(close: () => void) {
  return h(
    "div",
    { class: "page welcome" },
    h("h1", { class: "t-boss" }, "welcome down"),
    h("p", null, "This dungeon was dug out of a real program. Folders are floors, files are rooms, and every monster is a piece of the code, named after it."),
    h("p", null, "You don't need to know any code. Walk into monsters to fight them, walk over things to pick them up, and take the stairs once the floor's boss is down. You get one life."),
    h("p", { class: "dim" }, "Arrows or hjkl move, x explores for you, ? explains everything."),
    h("div", { class: "actions" }, primary(btn("enter", "let's go", close))),
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

export function endScreen(game: Game, share: string, copied: boolean, on: EndHandlers, watched = false, more = false, trophies: string[] = []) {
  const p = game.player;
  const won = game.outcome === "won";
  const f = game.floorSpec;
  const killer = game.killer;
  return h(
    "div",
    { class: "page" },
    h("h1", { class: won ? "t-loot glow" : "t-bad glow" }, won ? "cleared" : "you died"),
    won ? null : h("pre", { class: "tomb", "aria-hidden": "true" }, TOMB),
    won
      ? h("p", null, "You beat ", h("span", { class: "t-boss" }, f.boss.name), `, ${f.boss.title}, at the bottom of ${game.spec.repo.name}.`)
      : h("p", null, "Killed by ", h("span", { class: "t-bad" }, killer ?? "something"), ` on floor ${f.index + 1} (${f.name}).`),
    h(
      "p",
      { class: "dim" },
      `Level ${p.level}. ${plural(p.kills, "kill")}. ${p.bosses} of ${game.spec.floors.length} bosses. ${p.turns} turns.`,
    ),
    ...TROPHIES.filter((t) => trophies.includes(t.id)).map((t) => h("p", { class: "t-loot trophy" }, `new trophy: ${t.name}. `, h("span", { class: "dim" }, t.how))),
    h("pre", { class: "share" }, share),
    h(
      "div",
      { class: "actions" },
      watched
        ? primary(btn("r", "play this run yourself", on.again))
        : primary(btn("r", won ? "again, new rolls" : "try again, new rolls", on.again)),
      btn("c", copied ? "copied" : "copy result", on.copy),
      btn("m", "dungeon list", on.menu),
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
/** Lines of a boss's own code on its card. */
const CARD_CODE = 4;

export function bannerCard(kicker: string, name: string, kind: "boss" | "floor", sub: string, quote?: string, style?: string, code: string[] = []) {
  return h(
    "div",
    { class: "card" },
    h("div", { class: "card-kicker" }, kicker),
    h("div", { class: `card-name ${kind}${name.length > 14 ? " long" : ""}` }, name),
    h("div", { class: "card-sub" }, sub),
    style ? h("div", { class: "card-style" }, style) : null,
    quote ? h("div", { class: "card-quote" }, `"${quote}"`) : null,
    code.length ? h("pre", { class: "card-code", "aria-label": "Its code" }, code.slice(0, CARD_CODE).join("\n")) : null,
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
    h("p", { class: "row" }, h("span", { class: "name" }, x.name), h("span", { class: "dim" }, `${x.before} -> ${x.after} paths, ${x.path}`));
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
    c.grew.length ? h("h2", null, "grew more tangled") : null,
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
      btn("esc", "dungeon list", on.menu),
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

const levelLabel = (level: Settings["level"]) =>
  level === "normal" ? "normal" : level === "story" ? "story: monsters hit for half" : level === "hard" ? "hard: tougher monsters that hit harder" : `${MODS[level].name}: ${MODS[level].text.toLowerCase()}`;

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
    row("6", "difficulty", levelLabel(s.level), on.level),
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
      btn("m", "dungeon list", on.menu),
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
