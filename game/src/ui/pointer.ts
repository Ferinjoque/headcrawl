// Mouse and touch on the map: hover to inspect, click to walk. On phones the
// first tap on a monster or item shows what it is; tapping again walks there.

import { ABILITY } from "../game/abilities";
import { installLine } from "../game/extras";
import type { Game } from "../game/game";
import { walkable } from "../map/grid";
import { h, plural, replace } from "./dom";
import type { Command } from "./input";

export interface PointerHost {
  /** The game, only while the player is free to act. */
  playing(): Game | null;
  cellAt(clientX: number, clientY: number): [number, number];
  command(c: Command): void;
  travel(to: [number, number]): void;
}

const ITEM_NAMES = { potion: "TODO", blade: "FIXME", scroll: "HACK", curse: "XXX", coffee: "coffee" } as const;

/** Fills the tooltip for the cell, or returns false if there is nothing to say. */
function fill(tip: HTMLElement, game: Game, x: number, y: number): boolean {
  if (!game.isVisible(x, y)) return false;
  const m = game.monsterAt(x, y);
  const item = game.itemAt(x, y);
  const v = game.floor.vendor;
  if (m) {
    const e = m.enemy;
    replace(
      tip,
      h("div", { class: m.boss ? "tip-name t-boss" : "tip-name t-bad" }, m.name),
      h("div", { class: "dim" }, e?.signature ?? m.boss?.signature ?? "spawned by its boss"),
      h("div", null, `HP ${m.hp}/${m.maxHp}, hits up to ${m.damage}, speed ${m.speed}`),
      h("div", { class: "t-lore" }, ABILITY[m.archetype]),
      e ? h("div", { class: "faint" }, `${plural(e.ccn, "branch")}, depth ${e.nesting}, ${plural(e.params, "arg")}, ${plural(e.nloc, "line")}, line ${e.line}`) : null,
      m.boss ? h("div", { class: "faint" }, `${m.boss.title}. changed in ${m.boss.churn} commits`) : null,
      m.awake ? null : h("div", { class: "faint" }, "asleep"),
    );
    return true;
  }
  if (item) {
    const l = item.loot;
    const when = l?.year ? `written in ${l.year}${l.year_or_older ? " or earlier" : ""}` : "";
    const who = l?.author ? `${when ? " " : ""}by ${l.author}` : "";
    replace(
      tip,
      h("div", { class: "tip-name t-loot" }, ITEM_NAMES[item.kind]),
      l ? h("div", null, `"${l.text}"`) : h("div", null, "Still warm."),
      when || who ? h("div", { class: "faint" }, when + who) : null,
      item.source ? h("div", { class: "faint" }, item.source) : null,
    );
    return true;
  }
  if (v && v.x === x && v.y === y) {
    replace(
      tip,
      h("div", { class: "tip-name t-loot" }, "the vendor"),
      v.sold ? h("div", { class: "dim" }, "Sold out on this floor.") : h("div", null, "Walk into them to see what's for sale."),
      ...(v.sold ? [] : v.offers.map((o) => h("div", { class: "faint" }, installLine(o.dep)))),
    );
    return true;
  }
  return false;
}

export function bindPointer(canvas: HTMLElement, tip: HTMLElement, stage: HTMLElement, host: PointerHost): void {
  const show = (clientX: number, clientY: number) => {
    const game = host.playing();
    const [x, y] = host.cellAt(clientX, clientY);
    if (!game || !fill(tip, game, x, y)) {
      tip.hidden = true;
      return;
    }
    const box = stage.getBoundingClientRect();
    tip.hidden = false;
    const left = Math.min(clientX - box.left + 16, box.width - tip.offsetWidth - 8);
    const top = Math.min(clientY - box.top + 16, box.height - tip.offsetHeight - 8);
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };
  canvas.addEventListener("mousemove", (e) => show(e.clientX, e.clientY));
  canvas.addEventListener("mouseleave", () => (tip.hidden = true));
  let touch = false;
  let tipped = "";
  canvas.addEventListener("pointerdown", (e) => {
    touch = e.pointerType !== "mouse";
  });
  canvas.addEventListener("click", (e) => {
    const game = host.playing();
    if (!game) return;
    const [x, y] = host.cellAt(e.clientX, e.clientY);
    const p = game.player;
    const dx = x - p.x;
    const dy = y - p.y;
    const near = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    if (touch && !near) {
      const cell = `${x},${y}`;
      if (game.isVisible(x, y) && (game.monsterAt(x, y) || game.itemAt(x, y)) && tipped !== cell) {
        tipped = cell;
        show(e.clientX, e.clientY);
        return;
      }
    }
    tipped = "";
    tip.hidden = true;
    if (near) {
      host.command(dx || dy ? { kind: "move", dx, dy } : { kind: "wait" });
      return;
    }
    const grid = game.floor.map.grid;
    if (!grid.inside(x, y) || !game.floor.seen[grid.idx(x, y)] || !walkable(grid.get(x, y))) return;
    host.travel([x, y]);
  });
}
