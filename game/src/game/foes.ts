// The monsters' side of a turn: waking, walking, winding up and hitting.

import { walkable } from "../map/grid";
import { BOSS, HIT, WAKE_RANGE } from "./balance";
import { TUNING } from "./abilities";
import { chaseMap, stepToward } from "./chase";
import { GHOST_DAMAGE, ghostStep } from "./extras";
import type { Game } from "./game";
import type { Monster } from "./types";

export function monstersAct(g: Game): void {
  const grid = g.floor.map.grid;
  const chase = chaseMap(grid, g.player);
  const taken = new Uint8Array(grid.width * grid.height);
  for (const m of g.floor.monsters) taken[grid.idx(m.x, m.y)] = 1;
  for (const n of [g.floor.vendor, g.floor.keeper]) if (n) taken[grid.idx(n.x, n.y)] = 1;
  for (const m of [...g.floor.monsters]) {
    if (!g.floor.monsters.includes(m)) continue;
    if (!m.awake && g.isVisible(m.x, m.y) && dist(m, g.player) <= (m.boss ? 3 : WAKE_RANGE)) m.awake = true;
    if (!m.awake) continue;
    if (m.archetype === "tangle" && !g.has("ci") && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + TUNING.tangleRegen);
    m.energy += m.speed;
    while (m.energy >= 100 && g.outcome === "playing") {
      m.energy -= 100;
      monsterTurn(g, m, chase, taken);
    }
    if (g.outcome !== "playing") return;
  }
}

function monsterTurn(g: Game, m: Monster, chase: Int16Array, taken: Uint8Array): void {
  const p = g.player;
  if (m.threat.length) {
    releaseWindup(g, m);
    return;
  }
  if (m.cooldown > 0) m.cooldown--;
  if (m.boss) {
    m.turns++;
    if (m.turns % TUNING.bossSweepEvery === 0 && dist(m, p) <= TUNING.bossSweepRadius + 1) {
      windUp(g, m, TUNING.bossSweepRadius, `${m.name} winds up. Get out of the red.`);
      return;
    }
  }
  if (Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1) {
    if (m.archetype === "nest" && m.cooldown === 0) {
      windUp(g, m, 1, `${m.name} digs in for a heavy hit.`);
      return;
    }
    monsterAttack(g, m);
    return;
  }
  if (m.boss && p.turns - m.lastTaunt >= BOSS.tauntEvery && g.isVisible(m.x, m.y)) g.taunt(m);
  const grid = g.floor.map.grid;
  const step = m.archetype === "ghost" ? ghostStep(m, p, grid, taken) : stepToward(grid, m, chase, taken);
  if (step) {
    taken[grid.idx(m.x, m.y)] = 0;
    [m.x, m.y] = step;
    taken[grid.idx(m.x, m.y)] = 1;
  }
}

/** Mark every open cell within `radius` as about to be hit. */
function windUp(g: Game, m: Monster, radius: number, message: string): void {
  const grid = g.floor.map.grid;
  m.threat = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if ((dx || dy) && walkable(grid.get(m.x + dx, m.y + dy))) m.threat.push([m.x + dx, m.y + dy]);
    }
  }
  g.emit({ t: "telegraph", x: m.x, y: m.y });
  g.say(message, "bad");
}

function releaseWindup(g: Game, m: Monster): void {
  const p = g.player;
  const hit = m.threat.some(([x, y]) => x === p.x && y === p.y);
  m.threat = [];
  // A wind-up you dodged leaves an opening: plain swings for a few turns.
  m.cooldown = TUNING.windupCooldown;
  if (!hit) {
    g.emit({ t: "miss", x: m.x, y: m.y });
    g.say(`${m.name} hits nothing but air.`);
    return;
  }
  const mult = m.boss ? TUNING.bossSweepMultiplier : TUNING.nestWindupMultiplier;
  monsterAttack(g, m, mult, true);
}

function monsterAttack(g: Game, m: Monster, mult = 1, sure = false): void {
  const p = g.player;
  if (!sure && !g.rng.chance(HIT.monster)) {
    g.emit({ t: "miss", x: p.x, y: p.y });
    return;
  }
  const roll = g.rng.int(Math.max(1, Math.ceil(m.damage / 2)), m.damage);
  let dmg = Math.max(1, Math.round(roll * mult * (m.archetype === "ghost" ? GHOST_DAMAGE : 1)));
  if (g.has("rubberduck") && p.hp < p.maxHp / 3) dmg = Math.max(1, dmg - 2);
  p.hp -= dmg;
  g.emit({ t: "hit", x: p.x, y: p.y, amount: dmg, crit: false, onPlayer: true });
  if (p.hp <= 0) {
    p.hp = 0;
    g.outcome = "dead";
    g.killer = m.name;
    const where = m.enemy ? ` at line ${m.enemy.line}` : "";
    g.say(`${m.name}${where} got you.`, "bad");
    g.emit({ t: "death", killer: m.name });
  }
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
