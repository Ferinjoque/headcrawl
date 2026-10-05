// The player's side of a fight: hitting, killing, and what a kill sets off.

import { Tile } from "../map/grid";
import { BOSS, DROPS, HIT, TRAIT } from "./balance";
import { TUNING } from "./abilities";
import { npcAt } from "./extras";
import type { Game } from "./game";
import { ELITE } from "./elites";
import { drop, dropBossWeapon, dropGear } from "./items";
import type { Monster } from "./types";

export function playerAttack(g: Game, m: Monster): void {
  const p = g.player;
  const trait = p.weapon?.trait ?? "plain";
  const asleep = !m.awake;
  let missed = trait !== "steady" && !g.rng.chance(HIT.player);
  if (missed && g.has("retry") && g.rng.chance(HIT.player)) {
    missed = false;
    g.say("Retry with backoff. The second try lands.", "good", true);
  }
  if (missed) {
    g.emit({ t: "miss", x: m.x, y: m.y });
    g.say(`You miss ${m.name}.`);
    if (trait === "unsafe" && p.hp > 1) {
      p.hp--;
      g.emit({ t: "hit", x: p.x, y: p.y, amount: 1, crit: false, onPlayer: true });
      g.say("Undefined behavior. It nicks you.", "bad", true);
    }
    return;
  }
  m.awake = true;
  if (m.archetype === "bug" && !g.has("linter") && g.rng.chance(TUNING.bugDodge)) {
    g.emit({ t: "dodge", x: m.x, y: m.y });
    g.say(`${m.name} dodges. Can't reproduce.`);
    return;
  }
  const crit = g.rng.chance(critChance(g)) || (asleep && g.has("lazy"));
  let dmg = p.atk + (p.weapon?.bonus ?? 0) + g.rng.int(0, 1 + Math.floor(p.level / 2));
  if (trait === "loose") dmg = Math.max(1, Math.round((dmg * g.rng.int(50, 200)) / 100));
  if (crit) dmg *= critMultiplier(g);
  dmg += perkBonus(g, m) + (trait === "heavy" ? 1 : 0);
  if (g.has("gc") && (m.archetype === "ghost" || m.archetype === "spawn")) dmg *= 2;
  if (m.archetype === "wall" && !g.has("typechecker") && trait !== "pierce") dmg = Math.max(1, dmg - TUNING.wallArmor);
  if (m.affix === "deep" && trait !== "pierce") dmg = Math.max(1, dmg - ELITE.deepArmor);
  if (g.has("pairing") && g.rng.chance(0.2) && strike(g, m, dmg, crit)) return;
  if (strike(g, m, dmg, crit)) return;
  if (trait === "heavy") knockBack(g, m);
  if (trait === "cleave") cleave(g, m, Math.ceil(dmg / 2));
  if (trait === "async" && g.rng.chance(TRAIT.asyncFree)) g.freeTurn = true;
}

export function critChance(g: Game): number {
  const base = g.has("debugger") ? HIT.crit * 2 : HIT.crit;
  return base + (g.player.weapon?.trait === "unsafe" ? TRAIT.unsafeCrit : 0);
}

export function critMultiplier(g: Game): number {
  return 2 + (g.player.weapon?.trait === "unsafe" ? 1 : 0) + (g.has("fuzzing") ? 1 : 0);
}

/** One hit landing. True if it killed. */
function strike(g: Game, m: Monster, dmg: number, crit: boolean): boolean {
  m.hp -= dmg;
  g.emit({ t: "hit", x: m.x, y: m.y, amount: dmg, crit, onPlayer: false });
  if (m.hp <= 0) {
    killMonster(g, m);
    return true;
  }
  if (m.boss) bossPhase(g, m);
  else if (m.archetype === "hydra" && !m.split && !g.has("di")) splitHydra(g, m);
  return false;
}

/** Duck typing: if it stands next to you, it gets hit too. */
function cleave(g: Game, target: Monster, dmg: number): void {
  const p = g.player;
  const near = g.floor.monsters.filter((o) => o !== target && Math.abs(o.x - p.x) <= 1 && Math.abs(o.y - p.y) <= 1);
  for (const o of near) {
    o.awake = true;
    strike(g, o, dmg, false);
    if (g.outcome !== "playing") return;
  }
}

/** Enterprise weight: the target staggers one cell back if there is room. */
function knockBack(g: Game, m: Monster): void {
  if (m.boss) return;
  const p = g.player;
  const x = m.x + Math.sign(m.x - p.x);
  const y = m.y + Math.sign(m.y - p.y);
  if (g.floor.map.grid.get(x, y) !== Tile.Floor || g.monsterAt(x, y) || npcAt(g.floor, x, y)) return;
  m.x = x;
  m.y = y;
}

/** Extra damage from perks against this kind of monster. */
function perkBonus(g: Game, m: Monster): number {
  const k = m.archetype;
  if ((k === "bug" || k === "imp") && g.has("linter")) return 2;
  if (k === "wall" && g.has("typechecker")) return 2;
  if (k === "tangle" && g.has("ci")) return 2;
  if (k === "hydra" && g.has("di")) return 2;
  if (m.threat.length && g.has("static")) return 3;
  return 0;
}

export function killMonster(g: Game, m: Monster): void {
  const p = g.player;
  g.floor.monsters = g.floor.monsters.filter((x) => x !== m);
  p.kills++;
  p.killsBy[m.archetype] = (p.killsBy[m.archetype] ?? 0) + 1;
  const best = g.trophies[m.archetype];
  if (m.enemy && (!best || m.enemy.ccn > best.ccn)) g.trophies[m.archetype] = { name: m.name, ccn: m.enemy.ccn };
  if (m.affix) g.eliteKills[m.affix] = (g.eliteKills[m.affix] ?? 0) + 1;
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
    dropBossWeapon(g, m);
  } else {
    g.say(`${KILL_VERB[m.archetype] ?? "You fix"} ${m.name}.`);
    if (g.rng.chance(DROPS.coffee)) drop(g, m.x, m.y, "coffee");
    dropGear(g, m);
  }
  if (g.player.weapon?.trait === "arc") g.heal(TRAIT.arcHeal);
  g.gainXp(g.has("logging") ? Math.round((m.xp * 4) / 3) : m.xp);
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
    affix: null,
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
  remote: "You mock out",
  spawn: "You delete",
};
