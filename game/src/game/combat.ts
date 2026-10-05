// The player's side of a fight: hitting, killing, and what a kill sets off.

import { Tile } from "../map/grid";
import { BOSS, DROPS, HIT } from "./balance";
import { TUNING } from "./abilities";
import type { Game } from "./game";
import { drop } from "./items";
import type { Monster } from "./types";

export function playerAttack(g: Game, m: Monster): void {
  const p = g.player;
  if (!g.rng.chance(HIT.player)) {
    g.emit({ t: "miss", x: m.x, y: m.y });
    g.say(`You miss ${m.name}.`);
    return;
  }
  m.awake = true;
  if (m.archetype === "bug" && !g.has("linter") && g.rng.chance(TUNING.bugDodge)) {
    g.emit({ t: "dodge", x: m.x, y: m.y });
    g.say(`${m.name} dodges. Can't reproduce.`);
    return;
  }
  const crit = g.rng.chance(g.has("debugger") ? HIT.crit * 2 : HIT.crit);
  let dmg = p.atk + p.blade + g.rng.int(0, 1 + Math.floor(p.level / 2));
  if (crit) dmg *= 2;
  dmg += perkBonus(g, m);
  if (m.archetype === "wall" && !g.has("typechecker")) dmg = Math.max(1, dmg - TUNING.wallArmor);
  if (g.has("pairing") && g.rng.chance(0.2)) {
    g.emit({ t: "hit", x: m.x, y: m.y, amount: dmg, crit, onPlayer: false });
    m.hp -= dmg;
    if (m.hp <= 0) {
      killMonster(g, m);
      return;
    }
  }
  m.hp -= dmg;
  g.emit({ t: "hit", x: m.x, y: m.y, amount: dmg, crit, onPlayer: false });
  if (m.hp <= 0) killMonster(g, m);
  else if (m.boss) bossPhase(g, m);
  else if (m.archetype === "hydra" && !m.split && !g.has("di")) splitHydra(g, m);
}

/** Extra damage from perks against this kind of monster. */
function perkBonus(g: Game, m: Monster): number {
  const k = m.archetype;
  if ((k === "bug" || k === "imp") && g.has("linter")) return 2;
  if (k === "wall" && g.has("typechecker")) return 2;
  if (k === "tangle" && g.has("ci")) return 2;
  if (k === "hydra" && g.has("di")) return 2;
  return 0;
}

export function killMonster(g: Game, m: Monster): void {
  const p = g.player;
  g.floor.monsters = g.floor.monsters.filter((x) => x !== m);
  p.kills++;
  p.killsBy[m.archetype] = (p.killsBy[m.archetype] ?? 0) + 1;
  if (g.mods.includes("review")) g.heal(1);
  g.emit({ t: "kill", x: m.x, y: m.y, name: m.name, boss: !!m.boss });
  if (m.boss) {
    p.bosses++;
    p.bossNames.push(`${m.name}, ${m.boss.title}`);
    g.floor.bossDead = true;
    g.say(`${m.name} falls. ${m.boss.final ? "HEAD is yours." : "The way down opens."}`, "boss");
    if (m.boss.final) {
      g.outcome = "won";
      g.emit({ t: "victory" });
      return;
    }
    const [sx, sy] = g.floor.map.stairsDown;
    g.floor.map.grid.set(sx, sy, Tile.StairsDown);
    g.emit({ t: "reveal" });
    for (let i = 0; i < DROPS.bossCoffee; i++) drop(g, m.x, m.y, "coffee");
  } else {
    g.say(`${KILL_VERB[m.archetype] ?? "You fix"} ${m.name}.`);
    if (g.rng.chance(DROPS.coffee)) drop(g, m.x, m.y, "coffee");
  }
  g.gainXp(m.xp);
}

/** Hit hard enough, a boss gets faster and calls helpers. */
export function bossPhase(g: Game, m: Monster): void {
  if (m.phase !== 0 || m.hp > m.maxHp * BOSS.phaseAt) return;
  m.phase = 1;
  m.speed += BOSS.phaseSpeed;
  g.taunt(m);
  const grid = g.floor.map.grid;
  let made = 0;
  for (const [dx, dy] of RING) {
    if (made >= BOSS.spawns) break;
    const x = m.x + dx;
    const y = m.y + dy;
    if (grid.get(x, y) !== Tile.Floor || g.monsterAt(x, y) || (x === g.player.x && y === g.player.y)) continue;
    g.floor.monsters.push(spawnHelper(g, m, x, y));
    made++;
  }
  if (made) g.say(`${m.name} calls its helpers.`, "boss");
}

/** Too many parameters: hurt it and it comes apart into two smaller calls. */
function splitHydra(g: Game, m: Monster): void {
  m.split = true;
  if (m.hp < TUNING.hydraMinHp) return;
  const spot = g.freeNeighbour(m.x, m.y);
  if (!spot) return;
  const half = Math.ceil(m.hp / 2);
  m.hp -= half;
  const n = g.spawnCount++;
  g.floor.monsters.push({ ...m, id: `h${n}`, name: `${m.name}'`, x: spot[0], y: spot[1], hp: half, threat: [], energy: 0 });
  g.emit({ t: "split", x: spot[0], y: spot[1] });
  g.say(`${m.name} splits in two.`, "bad");
}

function spawnHelper(g: Game, boss: Monster, x: number, y: number): Monster {
  const n = g.spawnCount++;
  const depth = g.floor.index;
  const name = `_${boss.name}_helper${n ? n : ""}`.slice(0, 40);
  return {
    id: `s${n}`,
    name,
    glyph: "_",
    archetype: "spawn",
    x,
    y,
    hp: 6 + depth * 2,
    maxHp: 6 + depth * 2,
    damage: 1 + Math.ceil(depth / 2),
    speed: 110,
    energy: 0,
    xp: 3,
    room: boss.room,
    awake: true,
    boss: null,
    enemy: null,
    phase: 0,
    lastTaunt: 0,
    threat: [],
    turns: 0,
    cooldown: 0,
    split: true,
  };
}

const RING = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
] as const;

const KILL_VERB: Record<string, string> = {
  tangle: "You untangle",
  nest: "You flatten",
  hydra: "You curry away",
  wall: "You split up",
  imp: "You inline",
  bug: "You fix",
  ghost: "You garbage-collect",
  spawn: "You delete",
};
