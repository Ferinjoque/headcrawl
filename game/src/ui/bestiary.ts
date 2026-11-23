// The bestiary screen. Every kind of monster, elite and weapon has a line,
// filled in once you have met one, so the empty lines say what is left to find.

import { AFFIX, type Affix } from "../game/elites";
import { TRAITS, languagesWith, type Trait } from "../game/gear";
import { topDeaths, type Codex, type Trophy } from "./codex";
import { codeEverywhere } from "./detail";
import { h, plural } from "./dom";
import { MONSTERS } from "./glossary";
import { TROPHIES } from "../game/trophies";
import { loadTrophies, type Earned } from "./trophycase";
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

const ELITE_HINT: Record<Affix, string> = {
  god: "an elite: a huge function in a busy room",
  deep: "an elite: code nested many levels deep",
  hot: "an elite: from a file that keeps changing",
};

const worstLine = (t: Trophy | undefined) => (t ? `gnarliest: ${t.name}, ${plural(t.ccn, "path")} (${t.repo})` : null);

export function bestiaryScreen(c: Codex, close: () => void, earned: Map<string, Earned> = loadTrophies()) {
  const deaths = topDeaths(c);
  const met = KINDS.filter((k) => c.kills[k]).length;
  // Met ones first in every section; what's left to find sits at the bottom.
  const metFirst = <T,>(list: readonly T[], met: (x: T) => boolean) => [...list.filter(met), ...list.filter((x) => !met(x))];
  const kinds = metFirst(KINDS, (k) => !!c.kills[k]).map((k) =>
    c.kills[k]
      ? entry(`${MONSTERS[k].name} x${c.kills[k]}`, `kind-${k}`, [MONSTERS[k].does, MONSTERS[k].real, codeEverywhere() ? worstLine(c.worst[k]) : null, c.first[k] ? `first met in ${c.first[k]}` : null])
      : unknown(codeEverywhere() ? MONSTERS[k].real : MONSTERS[k].does),
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
      { label: "monsters", body: kinds },
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
        label: `trophies ${earned.size}/${TROPHIES.length}`,
        body: metFirst(TROPHIES, (t) => earned.has(t.id)).map((t) => {
          const e = earned.get(t.id);
          return e ? entry(t.name, "t-loot", [t.how, `first in ${e.repo}`]) : h("div", { class: "row entry faint" }, h("span", null, t.name), h("span", null, t.how));
        }),
      },
      {
        label: "bosses",
        body: [
          h("h2", null, "beaten, gnarliest first"),
          ...(c.bosses.length ? c.bosses.map((b) => entry(b.name, "t-boss", [`${b.repo}, ${plural(b.ccn, "path")}`])) : [h("p", { class: "faint" }, "None yet. Every floor ends with one.")]),
          h("h2", null, "what keeps getting you"),
          ...(deaths.length ? deaths.map(([name, n]) => entry(name, "t-bad", [`x${n}`])) : [h("p", { class: "faint" }, "Nothing yet.")]),
        ],
      },
    ]),
    h("div", { class: "actions" }, btn("esc", "back", close)),
  );
}
