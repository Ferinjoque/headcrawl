// The bestiary screen. Every kind of monster, elite and weapon has a line,
// filled in once you have met one, so the empty lines say what is left to find.

import { ABILITY } from "../game/abilities";
import { AFFIX, type Affix } from "../game/elites";
import { TRAITS, languagesWith, type Trait } from "../game/gear";
import { topDeaths, type Codex, type Trophy } from "./codex";
import { h, plural } from "./dom";
import { btn } from "./screens";
import { paneTabs } from "./win";

const KINDS = ["tangle", "nest", "hydra", "wall", "imp", "bug", "ghost", "remote", "spawn"] as const;
const AFFIXES: Affix[] = ["god", "deep", "hot"];
const WEAPON_TRAITS = Object.keys(TRAITS).filter((t) => t !== "plain") as Trait[];

function entry(name: string, cls: string, lines: (string | null)[]) {
  const [first, ...rest] = lines.filter((l): l is string => !!l);
  return h(
    "div",
    { class: "row entry" },
    h("span", { class: cls }, name),
    h("span", null, first ?? "", ...rest.map((l) => h("span", { class: "faint sub" }, l))),
  );
}

/** Something not found yet: faint, with a hint at what code makes one. */
const unknown = (hint: string) => h("div", { class: "row entry faint" }, h("span", null, "???"), h("span", null, hint));

/** Where each kind comes from, so an empty line is a hint, not a blank. */
const KIND_HINT: Record<(typeof KINDS)[number], string> = {
  tangle: "a function with lots of branches",
  nest: "deeply nested code",
  hydra: "a function with too many parameters",
  wall: "a very long function",
  imp: "a tiny function",
  bug: "an everyday function",
  ghost: "code nothing calls any more",
  remote: "a small function that talks to the network",
  spawn: "what a boss calls in when it's hurt",
};

const ELITE_HINT: Record<Affix, string> = {
  god: "an elite: the longest function in a busy file",
  deep: "an elite: the most tangled function, nested deep",
  hot: "an elite: the worst function in a file that keeps changing",
};

const worstLine = (t: Trophy | undefined) => (t ? `gnarliest: ${t.name}, ${plural(t.ccn, "branch")} (${t.repo})` : null);

export function bestiaryScreen(c: Codex, close: () => void) {
  const deaths = topDeaths(c);
  const met = KINDS.filter((k) => c.kills[k]).length;
  // Met ones first in every section; what's left to find sits at the bottom.
  const metFirst = <T extends string>(list: readonly T[], met: (x: T) => boolean) => [...list.filter(met), ...list.filter((x) => !met(x))];
  const kinds = metFirst(KINDS, (k) => !!c.kills[k]).map((k) =>
    c.kills[k]
      ? entry(`${k} x${c.kills[k]}`, `kind-${k}`, [ABILITY[k], worstLine(c.worst[k]), c.first[k] ? `first met in ${c.first[k]}` : null])
      : unknown(KIND_HINT[k]),
  );
  const elites = metFirst(AFFIXES, (a) => !!c.elites[a]).map((a) =>
    c.elites[a] ? entry(`${AFFIX[a].name} x${c.elites[a]}`, "t-boss", [AFFIX[a].text]) : unknown(ELITE_HINT[a]),
  );
  const weapons = metFirst(WEAPON_TRAITS, (t) => !!c.traits[t]).map((t) =>
    c.traits[t]
      ? entry(`${TRAITS[t].name} x${c.traits[t]}`, "t-loot", [TRAITS[t].text])
      : unknown(`a weapon from ${languagesWith(t).join(", ")} code`),
  );
  return h(
    "div",
    { class: "page bestiary" },
    h("h1", null, "bestiary"),
    c.runs
      ? h("p", { class: "dim" }, `${plural(c.runs, "run")} in ${plural(c.repos.length, "repo")}, ${c.wins} cleared. ${met} of ${KINDS.length} kinds met. Kept in this browser.`)
      : h("p", { class: "dim" }, "Nothing yet. Finish a run and it shows up here."),
    paneTabs([
      { label: "refactored", body: kinds },
      {
        label: "elites and weapons",
        body: [
          h("h2", null, "elites"),
          ...elites,
          h("h2", null, "weapons carried"),
          ...weapons,
          c.best ? entry("best ever", "t-loot", [`${c.best.name} +${c.best.bonus}, ${TRAITS[c.best.trait as Trait]?.name ?? c.best.trait} (${c.best.repo})`]) : null,
        ],
      },
      {
        label: "bosses",
        body: [
          h("h2", null, "beaten, gnarliest first"),
          ...(c.bosses.length ? c.bosses.map((b) => entry(b.name, "t-boss", [`${b.repo}, ${plural(b.ccn, "branch")}`])) : [h("p", { class: "faint" }, "None yet. Every floor ends with one.")]),
          h("h2", null, "what keeps getting you"),
          ...(deaths.length ? deaths.map(([name, n]) => entry(name, "t-bad", [`x${n}`])) : [h("p", { class: "faint" }, "Nothing yet.")]),
        ],
      },
    ]),
    h("div", { class: "actions" }, btn("esc", "back", close)),
  );
}
