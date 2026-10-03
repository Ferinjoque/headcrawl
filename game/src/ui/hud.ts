import type { Game } from "../game/game";
import { h, replace } from "./dom";

// One line, fixed order, health first. Repo, commit and turn count live on
// the pause and end screens; the HUD is only what you check mid-fight.

export function renderHud(el: HTMLElement, game: Game | null, repo?: string): void {
  if (!game) {
    replace(el, h("span", { class: "hud-title" }, "HEADCRAWL"), repo ? h("span", { class: "dim" }, repo) : null);
    return;
  }
  const p = game.player;
  const f = game.floorSpec;
  // For tests and anyone curious: the turn count is on the element, not on screen.
  el.dataset.turn = String(p.turns);
  const total = game.spec.floors.length;
  const frac = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
  const state = frac <= 0.3 ? "low" : frac <= 0.6 ? "mid" : "ok";
  const fill = h("i");
  fill.style.width = `${(frac * 100).toFixed(1)}%`;
  const goal = game.floor.bossDead
    ? h("span", { class: "hud-goal stairs" }, "stairs are open ", h("kbd", null, ">"))
    : h("span", { class: "hud-goal" }, "hunt ", h("b", { class: "t-boss" }, f.boss.name));
  replace(
    el,
    h(
      "span",
      { class: `hud-hp ${state}`, role: "meter", "aria-label": "Hit points", "aria-valuemin": 0, "aria-valuemax": p.maxHp, "aria-valuenow": p.hp },
      h("span", { class: "hud-hp-num" }, `${p.hp}`, h("small", null, `/${p.maxHp}`)),
      h("span", { class: "hud-hp-bar", "aria-hidden": "true" }, fill),
    ),
    h("span", { class: "hud-stat" }, h("small", null, "lv "), `${p.level}`, h("span", { class: "hud-xp", "aria-hidden": "true" }, xpFill(p.xp, p.nextXp))),
    h("span", { class: "hud-stat" }, h("small", null, "atk "), `${p.atk + p.blade}`),
    h("span", { class: "hud-spacer" }),
    h("span", { class: "hud-floor" }, h("small", null, `floor ${f.index + 1}/${total} `), f.name),
    goal,
    h("span", { class: "hud-help faint" }, h("kbd", null, "?"), " keys"),
  );
}

function xpFill(xp: number, next: number): HTMLElement {
  const i = h("i");
  i.style.width = `${next > 0 ? Math.min(100, (xp / next) * 100).toFixed(1) : 0}%`;
  return i;
}
