// The title screen: a continue button if a run is waiting, then one window
// with tabs (repos, GitHub, run code, files). Repos is a list with the
// picked repo's details beside it. Key buttons for the rest along the bottom.

import { bestFor, bestLabel } from "./best";
import { h, type Child } from "./dom";
import type { GalleryEntry } from "./gallery";
import type { Recent } from "./recent";
import type { SavedRun } from "./save";
import { wordmark } from "./screens";
import { key, tabs, win, type Tab } from "./win";

export type TitleTab = "repos" | "github" | "code" | "files";

export const TITLE_TABS: Tab<TitleTab>[] = [
  { id: "repos", label: "repos", cap: "1" },
  { id: "github", label: "any GitHub repo", cap: "2" },
  { id: "code", label: "run code", cap: "3" },
  { id: "files", label: "files", cap: "4" },
];

export interface TitleHandlers {
  play(slug: string, practice?: boolean): void;
  daily(): void;
  build(target: string): void;
  reopen(r: Recent): void;
  resume(s: SavedRun): void;
  code(text: string): void;
  compare(repo: string, ref: string): void;
  settings(): void;
  open(): void;
  help(): void;
  tab(id: TitleTab): void;
  select(index: number): void;
  bestiary(): void;
  lab(): void;
  folder(): void;
}

export interface Daily {
  repo: string;
  label: string;
  /** Today's ranked try is used up; later runs are practice. */
  played?: boolean;
}

export interface TitleState {
  entries: GalleryEntry[];
  selected: number;
  tab: TitleTab;
  error: string | null;
  daily: Daily | null;
  recent: Recent[];
  saves: SavedRun[];
}

// Difficulty as a word. Brighter ember is harder; never green, which means health.
const DIFF: Record<number, [string, string]> = {
  1: ["gentle", "diff-1"],
  2: ["mild", "diff-2"],
  3: ["fair", "diff-3"],
  4: ["tough", "diff-4"],
  5: ["brutal", "diff-5"],
};

function form(onsubmit: (f: HTMLFormElement) => void, ...children: Child[]) {
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

function repoList(s: TitleState, on: TitleHandlers) {
  return h(
    "ul",
    { class: "repos", role: "listbox", "aria-label": "Repos" },
    ...s.entries.map((e, i) =>
      h(
        "li",
        null,
        h(
          "button",
          {
            type: "button",
            role: "option",
            "aria-current": i === s.selected ? "true" : "false",
            "aria-selected": i === s.selected ? "true" : "false",
            "data-index": i,
            onclick: () => (i === s.selected ? on.play(e.slug) : on.select(i)),
            ondblclick: () => on.play(e.slug),
          },
          h("span", { class: "mark" }, ">"),
          h("span", { class: "name" }, e.repo),
          h("span", { class: "lang" }, e.language),
          e.difficulty ? h("span", { class: `diff ${DIFF[e.difficulty]?.[1] ?? "dim"}` }, DIFF[e.difficulty]?.[0] ?? "") : h("span"),
        ),
      ),
    ),
  );
}

/** The right half of the repos tab: what you are about to walk into. */
function detail(s: TitleState, on: TitleHandlers) {
  const e = s.entries[s.selected];
  if (!e) return h("div", { class: "detail" }, h("p", { class: "dim" }, "No gallery here. Open a dungeon file instead."));
  const best = bestLabel(bestFor(e.head));
  const isDaily = s.daily?.repo === e.repo;
  return h(
    "div",
    { class: "detail", "aria-live": "polite" },
    h("p", { class: "detail-name" }, e.repo.split("/").pop() ?? e.repo),
    h("p", { class: "dim" }, `${e.repo}, ${e.language}`),
    h(
      "dl",
      { class: "facts" },
      h("dt", null, "floors"),
      h("dd", null, String(e.floors)),
      h("dt", null, "monsters"),
      h("dd", null, String(e.enemies)),
      h("dt", null, "last boss"),
      h("dd", { class: "t-boss" }, e.boss),
      h("dt", null, "feels"),
      h("dd", { class: e.difficulty ? DIFF[e.difficulty]?.[1] : "dim" }, e.difficulty ? DIFF[e.difficulty]?.[0] : "unknown"),
      h("dt", null, "your best"),
      h("dd", { class: best ? "t-loot" : "faint" }, best || "not played yet"),
    ),
    isDaily ? h("p", { class: "t-lore" }, "Today's daily dungeon.") : null,
    h(
      "div",
      { class: "keys" },
      key("enter", "descend", () => on.play(e.slug), { class: "key primary" }),
      key("p", "practice", () => on.play(e.slug, true), { title: "lab tools on, nothing counts" }),
    ),
  );
}

function githubPane(s: TitleState, on: TitleHandlers) {
  return h(
    "div",
    { class: "pane-body" },
    h("h2", null, "build any public repo"),
    form(
      (f) => on.build(value(f, "repo")),
      field("repo", "owner/repo or a github.com link", "GitHub repo"),
      h("button", { class: "key primary", type: "submit" }, h("kbd", null, "enter"), h("span", null, "build")),
    ),
    s.recent.length
      ? h(
          "div",
          { class: "keys recent" },
          h("span", { class: "faint" }, "built before"),
          ...s.recent.map((r) => key(">", `${r.owner}/${r.repo}`, () => on.reopen(r))),
        )
      : null,
    h("h2", null, "then vs now"),
    form(
      (f) => on.compare(value(f, "vsrepo"), value(f, "vsref")),
      field("vsrepo", "owner/repo", "Repo to compare"),
      field("vsref", "an older tag, like v1.0.0", "Older tag, branch or commit"),
      h("button", { class: "key", type: "submit" }, h("kbd", null, "enter"), h("span", null, "compare")),
    ),
    h("p", { id: "build-status", class: "faint", role: "status" }, "Built in your browser. Nothing in the repo runs."),
  );
}

function codePane(on: TitleHandlers) {
  return h(
    "div",
    { class: "pane-body" },
    h("h2", null, "a friend's run"),
    h("p", { class: "dim" }, "Same dungeon, same rolls. Codes look like flask-4821; whole links work too."),
    form(
      (f) => on.code(value(f, "code")),
      field("code", "flask-4821, or a whole link", "Run code or link"),
      h("button", { class: "key primary", type: "submit" }, h("kbd", null, "enter"), h("span", null, "play it")),
    ),
    h("p", { id: "code-status", class: "dim", role: "status" }),
  );
}

function filesPane(on: TitleHandlers) {
  return h(
    "div",
    { class: "pane-body" },
    h("h2", null, "from this computer"),
    h("div", { class: "keys" }, key("f", "pick a folder", on.folder), key("o", "open a dungeon.json", on.open)),
    h("p", { class: "dim" }, "A folder is read in this tab and never uploaded. A dungeon.json comes from the command line tool:"),
    h("pre", { class: "code" }, "cd analyzer\nuv run headcrawl analyze path/to/repo -o mine.json"),
  );
}

export function titleScreen(s: TitleState, on: TitleHandlers) {
  const save = s.saves[0];
  const body =
    s.tab === "repos"
      ? h("div", { class: "split" }, repoList(s, on), detail(s, on))
      : s.tab === "github"
        ? githubPane(s, on)
        : s.tab === "code"
          ? codePane(on)
          : filesPane(on);
  return h(
    "div",
    { class: "page title" },
    h("pre", { class: "wordmark", "aria-label": "HEADCRAWL" }, wordmark()),
    h("p", { class: "tagline" }, "A git repo, played as a dungeon."),
    save
      ? h(
          "button",
          { class: "continue", type: "button", onclick: () => on.resume(save) },
          h("kbd", null, "space"),
          h("span", null, "continue ", h("span", { class: "name" }, save.repo), h("span", { class: "dim" }, `, floor ${save.floor} of ${save.floors}`)),
        )
      : null,
    s.error ? h("p", { class: "error", role: "alert" }, s.error) : null,
    h("div", { class: "title-win" }, tabs(TITLE_TABS, s.tab, on.tab), win(TITLE_TABS.find((t) => t.id === s.tab)?.label ?? "", "title-main", body)),
    h(
      "nav",
      { class: "keys footer", "aria-label": "More" },
      s.daily ? key("d", s.daily.played ? "daily, practice" : `daily: ${s.daily.repo.split("/").pop()}`, on.daily) : null,
      key("b", "bestiary", on.bestiary),
      key("l", "the lab", on.lab, { title: "try any monster, weapon or tool" }),
      key(",", "settings", on.settings),
      key("?", "how it works", on.help),
    ),
    h("p", { id: "attract", class: "attract faint", "aria-hidden": "true" }),
  );
}

