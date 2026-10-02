import type { Game } from "../game/game";
import { bar, h, replace } from "./dom";

export function renderHud(el: HTMLElement, game: Game | null, repo?: string): void {
  if (!game) {
    replace(el, h("span", { class: "hud-title" }, "HEADCRAWL"), repo ? h("span", { class: "dim" }, repo) : null);
    return;
  }
  const p = game.player;
  const f = game.floorSpec;
  const total = game.spec.floors.length;
  const low = p.hp <= p.maxHp * 0.3;
  const goal = game.floor.bossDead
    ? h("span", { class: "t-loot" }, "find the stairs >")
    : h("span", { class: "t-boss" }, `hunt ${f.boss.name}`);
  replace(
    el,
    h("span", { class: "hud-title" }, "HEADCRAWL"),
    h("span", { class: "dim" }, `${game.spec.repo.name} @${game.spec.repo.head.slice(0, 7)}`),
    h("span", null, `floor ${f.index + 1}/${total} `, h("span", { class: "dim" }, f.name)),
    goal,
    h(
      "span",
      { class: low ? "t-bad glow" : "t-good" },
      `HP ${p.hp}/${p.maxHp} `,
      h("span", { class: "hud-bar" }, `[${bar(p.hp, p.maxHp, 10)}]`),
    ),
    h("span", null, `LV ${p.level} `, h("span", { class: "dim" }, `${p.xp}/${p.nextXp}xp`)),
    h("span", null, `ATK ${p.atk + p.blade}`),
    h("span", { class: "dim" }, `turn ${p.turns}`),
  );
}
