// The monsters' side of a turn: waking, walking, winding up and hitting.

import { walkable } from "../map/grid";
import { BOSS, HIT, WAKE_RANGE } from "./balance";
import { TUNING } from "./abilities";
import { chaseMap, stepToward } from "./chase";
import { GHOST_DAMAGE, ghostStep } from "./extras";
import { BOSS_MOVES, styleOf } from "./bossmoves";
import { callHelper } from "./combat";
import { REMOTE, lineCells } from "./elites";
import type { Game } from "./game";
import type { Monster } from "./types";
import { monsterLabel, nameOf } from "./names";

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
    // A god function rewrites itself while you can't reach it.
    if (m.boss && styleOf(m.boss) === "long" && dist(m, g.player) > 1 && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + BOSS_MOVES.longRegen);
    // A DeprecationWarning on you: everything else gets half a turn more.
    m.energy += g.player.slowed > 0 ? Math.round(m.speed * SLOW.factor) : m.speed;
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
  const before = g.floor.monsters.length;
  if (m.boss && bossTurn(g, m)) {
    // A helper called this turn holds its cell, or a monster moving after it walks into it.
    const grid = g.floor.map.grid;
    for (const x of g.floor.monsters.slice(before)) taken[grid.idx(x.x, x.y)] = 1;
    return;
  }
  if (m.archetype === "remote" && m.cooldown === 0 && aim(g, m)) return;
  if (Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1) {
    if (m.archetype === "nest" && m.cooldown === 0) {
      windUp(g, m, 1, `${nameOf(m)} digs in for a heavy hit.`);
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

/** What a boss does before walking or swinging. True if that used its turn. */
function bossTurn(g: Game, m: Monster): boolean {
  const style = styleOf(m.boss!);
  const mv = BOSS_MOVES;
  m.turns++;
  if (style === "hot" && m.turns % mv.hotEvery === 0 && m.speed < m.boss!.speed + mv.hotCap) {
    m.speed += mv.hotStep;
    g.say(`${nameOf(m)} speeds up. Somebody pushed another fix.`, "bad", true);
  }
  if (style === "sprawl" && m.turns % mv.sprawlEvery === 0) {
    const helpers = g.floor.monsters.filter((x) => x.archetype === "spawn").length;
    if (helpers < mv.sprawlMaxHelpers && callHelper(g, m)) {
      g.say(`${nameOf(m)} passes one more argument. A helper shows up.`, "boss");
      return true;
    }
  }
  const radius = style === "deep" ? mv.deepRadius : TUNING.bossSweepRadius;
  const every = style === "deep" ? mv.deepEvery : TUNING.bossSweepEvery;
  if (m.turns % every === 0 && dist(m, g.player) <= radius + 1) {
    windUp(g, m, radius, `${nameOf(m)} winds up. Get out of the red.`);
    return true;
  }
  return false;
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

/** A remote call in range lines up a shot. False if it has no clear line to you. */
function aim(g: Game, m: Monster): boolean {
  const p = g.player;
  const d = dist(m, p);
  if (d < 2 || d > REMOTE.range || !g.isVisible(m.x, m.y)) return false;
  const grid = g.floor.map.grid;
  const line = lineCells(m, p, (x, y) => walkable(grid.get(x, y)));
  const end = line.at(-1);
  if (!end || end[0] !== p.x || end[1] !== p.y) return false;
  m.threat = line;
  g.emit({ t: "telegraph", x: m.x, y: m.y, line: true });
  g.say(`${nameOf(m)} opens a connection. Get off the red line.`, "bad");
  return true;
}

function releaseWindup(g: Game, m: Monster): void {
  const p = g.player;
  const hit = m.threat.some(([x, y]) => x === p.x && y === p.y);
  m.threat = [];
  // A wind-up you dodged leaves an opening: plain swings for a few turns.
  m.cooldown = TUNING.windupCooldown;
  if (!hit) {
    g.emit({ t: "miss", x: m.x, y: m.y });
    g.say(`${nameOf(m)} hits nothing but air.`);
    return;
  }
  const mult = m.boss ? TUNING.bossSweepMultiplier : m.archetype === "nest" ? TUNING.nestWindupMultiplier : 1;
  monsterAttack(g, m, mult, true);
}

function monsterAttack(g: Game, m: Monster, mult = 1, sure = false): void {
  const p = g.player;
  if (!sure && !g.rng.chance(struckChance(g))) {
    g.emit({ t: "miss", x: p.x, y: p.y });
    return;
  }
  const roll = g.rng.int(Math.max(1, Math.ceil(m.damage / 2)), m.damage);
  let dmg = Math.max(1, Math.round(roll * mult * (m.archetype === "ghost" ? GHOST_DAMAGE : 1)));
  if (g.has("rubberduck") && p.hp < p.maxHp / 3) dmg = Math.max(1, dmg - 2);
  if (p.armor) dmg = Math.max(1, dmg - p.armor.bonus);
  p.hp -= dmg;
  g.emit({ t: "hit", x: p.x, y: p.y, amount: dmg, crit: false, onPlayer: true });
  if (m.enemy?.deprecated && p.hp > 0) {
    if (!p.slowed) g.say(`${nameOf(m)} is outdated code, and its hit slows you down.`, "bad");
    p.slowed = SLOW.turns;
  }
  if (p.hp <= 0 && g.cheats.god) p.hp = 1;
  if (p.hp <= 0 && g.has("flag") && g.flagUsedOn !== g.floor.index) {
    g.flagUsedOn = g.floor.index;
    p.hp = 1;
    g.say("Feature flag flipped. You stay up at 1 HP. Not again on this floor.", "good");
  }
  if (p.hp <= 0) {
    p.hp = 0;
    g.outcome = "dead";
    g.killer = m.name;
    g.killerLabel = monsterLabel(m);
    const where = m.enemy ? ` at line ${m.enemy.line}` : "";
    g.say(`${nameOf(m)} got you.`, "bad", false, `${nameOf(m)}${where} got you.`);
    g.emit({ t: "death", killer: m.name });
  }
}

/** How often a plain monster swing lands on you. */
export function struckChance(g: Game): number {
  return HIT.monster - (g.has("breaker") ? BREAKER : 0);
}

const BREAKER = 0.15;

/** What a deprecated function's hit does to you. */
export const SLOW = { turns: 3, factor: 1.5 };

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
