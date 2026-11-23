// The character sheet: every number that decides a fight, in one place.
// c opens it in a run; on phones it is in the pause menu.

import type { Game } from "../game/game";
import { PERKS } from "../game/perks";
import { REVIEW } from "../game/ranged";
import { pct, stats } from "../game/stats";
import { TRAITS } from "../game/gear";
import { codeEverywhere, gearLine, toolName, traitName } from "./detail";
import { h, plural } from "./dom";
import { btn } from "./screens";

export function sheetScreen(game: Game, close: () => void) {
  const s = stats(game);
  const p = game.player;
  const row = (a: string, b: string, cls = "") => h("p", { class: "row" }, h("span", { class: cls || "dim" }, a), h("span", null, b));
  const hurt = s.hp <= s.maxHp * 0.3 ? "t-bad" : "t-good";
  return h(
    "div",
    { class: "page sheet" },
    h("h1", null, `@ level ${s.level}`),
    h("p", { class: "dim" }, `${game.spec.repo.name}, floor ${game.floor.index + 1} of ${game.spec.floors.length}. ${plural(p.kills, "kill")}, ${plural(p.turns, "turn")}.`),
    h("h2", null, "you"),
    row("health", `${s.hp} of ${s.maxHp}`, hurt),
    row("experience", `${s.xp} of ${s.nextXp} to level ${s.level + 1}`),
    h("h2", null, "hitting"),
    row("damage", `${s.attack[0]} to ${s.attack[1]} a hit`),
    row("lands", pct(s.hit)),
    row("crits", `${pct(s.crit)} of hits, for ${s.critMult}x`),
    row("review (f)", `half damage up to ${REVIEW.range} cells away, every ${REVIEW.cooldown} turns. ${p.review ? `${plural(p.review, "turn")} to go` : "ready"}`),
    h("h2", null, "getting hit"),
    row("monsters land", `${pct(s.struck)} of plain swings. Red cells always land.`),
    row("armor", s.defense ? `${s.defense} off every hit, never below 1` : "none. Every hit lands in full."),
    h("h2", null, "gear"),
    row("/ weapon", p.weapon ? gearLine(p.weapon) : s.weapon, "t-loot"),
    p.weapon && p.weapon.trait !== "plain" ? row("", `${traitName(p.weapon.trait)}: ${TRAITS[p.weapon.trait].text}`, "") : null,
    row("[ armor", p.armor ? gearLine(p.armor) : s.armor, "t-loot"),
    h("h2", null, "tools"),
    ...(p.perks.length ? p.perks.map((id) => row(toolName(id), codeEverywhere() ? `${PERKS[id].text}. ${PERKS[id].about}` : PERKS[id].text, "t-good")) : [h("p", { class: "dim" }, "None yet. You pick one every level.")]),
    h("h2", null, "pack"),
    row("! potion", p.potions.length ? `${p.potions.length}, q drinks one` : "none"),
    row("? scroll", p.scrolls.length ? `${p.scrolls.length}, r reads one` : "none"),
    s.curses ? row("% curse", `${plural(s.curses, "curse")} on you`, "t-bad") : null,
    h("div", { class: "actions" }, btn("esc", "back", close)),
  );
}
