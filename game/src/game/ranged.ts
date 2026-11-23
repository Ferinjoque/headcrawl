// Review comments: the one thing you can do at a distance. Pick a monster
// you can see within a few cells and leave a comment on it. It lands on the
// first thing along the line, for half a normal hit, and then you wait a few
// turns before the next one.

import { walkable } from "../map/grid";
import { HIT } from "./balance";
import { critChance, critMultiplier, killMonster, bossPhase } from "./combat";
import { lineCells } from "./elites";
import type { Game } from "./game";
import type { Monster } from "./types";
import { nameOf } from "./names";

export const REVIEW = {
  range: 5,
  cooldown: 6,
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Monsters you could comment on right now, nearest first. */
export function targets(g: Game): Monster[] {
  const p = g.player;
  return g.floor.monsters
    .filter((m) => g.isVisible(m.x, m.y) && dist(m, p) <= REVIEW.range && firstOnLine(g, m.x, m.y) === m)
    .sort((a, b) => dist(a, p) - dist(b, p) || a.y - b.y || a.x - b.x);
}

/** The cells a comment flies through towards (x, y), up to what it hits. */
export function flightPath(g: Game, x: number, y: number): [number, number][] {
  const grid = g.floor.map.grid;
  const path: [number, number][] = [];
  for (const c of lineCells(g.player, { x, y }, (cx, cy) => walkable(grid.get(cx, cy)))) {
    path.push(c);
    if (g.monsterAt(c[0], c[1])) break;
  }
  return path;
}

function firstOnLine(g: Game, x: number, y: number): Monster | null {
  const end = flightPath(g, x, y).at(-1);
  return end ? (g.monsterAt(end[0], end[1]) ?? null) : null;
}

/** Fire at the monster standing at this offset from you. False if nothing happened. */
export function review(g: Game, dx: number, dy: number): boolean {
  const p = g.player;
  if (p.review > 0) {
    g.say(`Not ready yet: ${p.review} more turns.`);
    return false;
  }
  if (Math.max(Math.abs(dx), Math.abs(dy)) > REVIEW.range || (!dx && !dy)) return false;
  const m = firstOnLine(g, p.x + dx, p.y + dy);
  if (!m || !g.isVisible(m.x, m.y)) {
    g.say("Nothing there to shoot.");
    return false;
  }
  p.review = REVIEW.cooldown;
  g.emit({ t: "shot", x: p.x, y: p.y, tx: m.x, ty: m.y });
  m.awake = true;
  if (!g.rng.chance(HIT.player)) {
    g.emit({ t: "miss", x: m.x, y: m.y });
    g.say(`Your shot misses ${nameOf(m)}.`, "info", false, `Your shot misses ${nameOf(m)}. Resolved without a change.`);
    return true;
  }
  const crit = g.rng.chance(critChance(g));
  let dmg = Math.ceil((p.atk + (p.weapon?.bonus ?? 0) + g.rng.int(0, 1 + Math.floor(p.level / 2))) / 2);
  if (crit) dmg *= critMultiplier(g);
  m.hp -= dmg;
  g.emit({ t: "hit", x: m.x, y: m.y, amount: dmg, crit, onPlayer: false });
  g.say(`Your shot hits ${nameOf(m)} for ${dmg}.`, "good", true, `Your shot hits ${nameOf(m)} for ${dmg}. nit.`);
  if (m.hp <= 0) killMonster(g, m);
  else if (m.boss) bossPhase(g, m);
  return true;
}
