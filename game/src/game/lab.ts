// The lab: a small dungeon that ships with the game, and tools to put any
// monster, weapon or perk in front of you. The same tools work in a practice
// run of a real dungeon. Nothing here runs in a run that counts.

import type { Boss, DungeonSpec, Enemy, Floor, Loot, Room } from "../spec";
import { BOSS_STYLE, type BossStyle } from "./bossmoves";
import { Tile } from "../map/grid";
import { AFFIX, makeElite, type Affix } from "./elites";
import { armor, armorBonus, weapon, weaponBonus } from "./gear";
import type { Game } from "./game";
import type { PerkId } from "./perks";
import type { ItemKind, Monster } from "./types";
import { fromBoss, fromEnemy } from "./world";

const LAB_SHA = "1abc0de1abc0de1abc0de1abc0de1abc0de1abc0";

export const LAB_KINDS = ["bug", "imp", "tangle", "nest", "hydra", "wall", "ghost", "remote"] as const;
export type LabKind = (typeof LAB_KINDS)[number];

/** Languages with a weapon trait each, for the gear buttons. */
export const LAB_LANGUAGES = ["rust", "go", "python", "typescript", "c", "java", "swift", "php"] as const;

let ids = 0;
const nextId = (p: string) => `${p}${++ids}`;

function enemy(name: string, archetype: Enemy["archetype"], over: Partial<Enemy> = {}): Enemy {
  return {
    id: nextId("e"),
    name,
    signature: `${name}()`,
    archetype,
    hp: 14,
    damage: 3,
    speed: 100,
    xp: 6,
    line: 1,
    ccn: 4,
    nesting: 2,
    params: 2,
    nloc: 20,
    ...over,
  };
}

function room(id: string, name: string, over: Partial<Room> & { wing: string }): Room {
  return {
    id,
    path: `lab/${name}`,
    name,
    language: "python",
    kind: "hall",
    loc: 120,
    size: 3,
    functions: 6,
    churn: 4,
    heat: 0.3,
    blurb: null,
    last_commit: null,
    enemies: [],
    loot: [],
    ...over,
  };
}

function loot(kind: Loot["kind"], tag: Loot["tag"], text: string): Loot {
  return { id: nextId("l"), kind, tag, text, line: 7, power: 4, year: 2019, year_or_older: false, author: "lab" };
}

function labFloor(index: number, final: boolean): Floor {
  const wing = `w${index + 1}`;
  const start = room(`r${index}0`, index ? "deeper/start.py" : "start.py", { wing, size: 3, loot: index ? [] : [loot("potion", "TODO", "write the docs")] });
  const arena = room(`r${index}1`, index ? "deeper/arena.py" : "arena.py", { wing, size: 5 });
  const range = room(`r${index}2`, index ? "deeper/range.py" : "range.py", {
    wing,
    size: 4,
    enemies: [enemy("fetch_page", "bug"), enemy("parse_config", "bug", { ccn: 9, nloc: 80 }), enemy("tiny", "imp", { hp: 5, speed: 140 })],
    loot: [loot("blade", "FIXME", "this leaks"), loot("scroll", "HACK", "works on my machine")],
  });
  const conflicted = room(`r${index}5`, index ? "deeper/merge.py" : "merge.py", {
    wing,
    size: 3,
    conflicts: 1,
    enemies: [enemy("resolve", "bug"), enemy("rebase", "bug", { deprecated: true })],
  });
  const tests = room(`r${index}3`, index ? "deeper/test_lab.py" : "test_lab.py", { wing, kind: "shrine", size: 2, functions: 24 });
  const lair = room(`r${index}4`, index ? "deeper/boss.py" : "boss.py", { wing, kind: "lair", size: 4 });
  const rooms = [start, arena, range, tests, lair, conflicted];
  const link = (a: Room, b: Room) => ({ a: a.id, b: b.id, kind: "import" as const, weight: 1 });
  return {
    id: `f${index}`,
    index,
    name: index ? "deeper" : "lab",
    path: index ? "lab/deeper" : "lab",
    wings: [{ id: wing, path: index ? "lab/deeper" : "lab", name: index ? "deeper" : "lab" }],
    rooms: rooms as Floor["rooms"],
    edges: [link(start, arena), link(arena, range), link(arena, tests), link(arena, lair), link(range, conflicted)],
    entry: start.id,
    lair: lair.id,
    boss: {
      id: nextId("b"),
      name: index ? "handle_everything" : "main",
      title: index ? "the Last Test" : "the Practice Dummy",
      signature: "main()",
      line: 1,
      hp: index ? 120 : 60,
      damage: index ? 8 : 5,
      speed: 100,
      xp: 60,
      ccn: index ? 30 : 12,
      churn: 20,
      taunts: ["Again.", "You're only practicing."],
      final,
    },
  };
}

/** The lab dungeon: two small floors with a range, a shrine and a boss each. */
export function labSpec(): DungeonSpec {
  return {
    schema_version: 1,
    generator: "lab",
    seed: LAB_SHA,
    repo: {
      name: "headcrawl/lab",
      head: LAB_SHA,
      committed_at: 0,
      commits_scanned: 0,
      languages: [],
      branches: [{ name: "feature/practice", head: LAB_SHA }],
    },
    floors: [labFloor(0, false), labFloor(1, true)],
    totals: { files: 10, rooms: 10, functions: 12, enemies: 6, loot: 3, loc: 1200, skipped: 0 },
  };
}

// ---- tools ----------------------------------------------------------------

/** A free floor cell two to four steps from you that you can see. */
function spotNear(g: Game): [number, number] | null {
  const { player: p } = g;
  const grid = g.floor.map.grid;
  for (let r = 2; r <= 5; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = p.x + dx;
        const y = p.y + dy;
        if (grid.get(x, y) !== Tile.Floor || g.monsterAt(x, y) || g.itemAt(x, y) || !g.isVisible(x, y)) continue;
        return [x, y];
      }
    }
  }
  return null;
}

const NAMES: Record<LabKind, Partial<Enemy> & { name: string; archetype: Enemy["archetype"] }> = {
  bug: { name: "parse_args", archetype: "bug" },
  imp: { name: "noop", archetype: "imp", hp: 6, speed: 140 },
  tangle: { name: "route_request", archetype: "tangle", hp: 26, ccn: 22 },
  nest: { name: "deep_merge", archetype: "nest", nesting: 7, damage: 4 },
  hydra: { name: "configure", archetype: "hydra", params: 9, hp: 20 },
  wall: { name: "render_page", archetype: "wall", nloc: 300, hp: 30, speed: 70 },
  ghost: { name: "old_helper", archetype: "ghost" },
  remote: { name: "fetch_feed", archetype: "bug" },
};

/** Put one monster of this kind near you, awake. Null if there is no room. */
export function spawn(g: Game, kind: LabKind, affix: Affix | null = null, deprecated = false, reverted = false): Monster | null {
  const at = spotNear(g);
  if (!at) return null;
  const { name, archetype, ...over } = NAMES[kind];
  const room = Math.max(0, g.floor.map.grid.roomAt(at[0], at[1]));
  const m = fromEnemy(enemy(name, archetype, { ...over, deprecated }), at[0], at[1], room, g.floor.index, g.spec.floors.length);
  if (affix) makeElite(m, affix);
  if (reverted) m.undo = 1;
  m.awake = true;
  g.floor.monsters.push(m);
  g.say(`lab: ${m.name}${affix ? ` (elite, ${AFFIX[affix].name})` : ""} appears.`, "lore");
  return m;
}

/** A boss of the given style next to you, not the floor's last one. */
export function spawnBoss(g: Game, style: BossStyle): Monster | null {
  const at = spotNear(g);
  if (!at) return null;
  const base = g.floorSpec.boss;
  const shape: Record<BossStyle, Partial<Boss>> = {
    deep: { nesting: 8, params: 1, nloc: 40, churn: 5 },
    sprawl: { nesting: 2, params: 7, nloc: 40, churn: 5 },
    long: { nesting: 2, params: 1, nloc: 240, churn: 5 },
    hot: { nesting: 2, params: 1, nloc: 40, churn: 80 },
    plain: { nesting: 2, params: 1, nloc: 40, churn: 5 },
  };
  const boss: Boss = { ...base, id: nextId("b"), name: `${style}_boss`, title: `a ${BOSS_STYLE[style].name} boss`, final: false, ...shape[style] };
  const room = Math.max(0, g.floor.map.grid.roomAt(at[0], at[1]));
  const m = fromBoss(boss, at[0], at[1], room, g.floor.index, g.spec.floors.length);
  m.awake = true;
  g.floor.monsters.push(m);
  g.say(`lab: ${m.name}, ${BOSS_STYLE[style].name}.`, "lore");
  return m;
}

export function giveWeapon(g: Game, language: string, bonus = weaponBonus(5, g.floor.index)): void {
  g.player.weapon = weapon(`lab_${language}_blade`, language, bonus);
  g.wielded.push(g.player.weapon);
  g.say(`lab: a ${language} weapon, +${bonus}.`, "lore");
}

export function giveArmor(g: Game, bonus = armorBonus(4, g.floor.index)): void {
  g.player.armor = bonus > 0 ? armor("lab suite", "python", bonus) : null;
  g.say(bonus > 0 ? `lab: armor, defense ${bonus}.` : "lab: armor off.", "lore");
}

export function grant(g: Game, id: PerkId): void {
  g.applyPerk(id);
}

/** Drop a TODO, HACK, XXX or coffee at your feet's nearest free cell. */
export function dropItem(g: Game, kind: Extract<ItemKind, "potion" | "scroll" | "curse" | "coffee">): void {
  const at = spotNear(g);
  if (!at) return;
  const tag = { potion: "TODO", scroll: "HACK", curse: "XXX", coffee: null }[kind];
  g.floor.items.push({
    id: nextId("x"),
    kind,
    x: at[0],
    y: at[1],
    loot: tag ? { id: nextId("l"), kind: kind as Loot["kind"], tag: tag as Loot["tag"], text: "from the lab", line: 1, power: 4, year: null, year_or_older: false, author: null } : null,
    source: "lab",
  });
}

export function healFull(g: Game): void {
  g.player.hp = g.player.maxHp;
}

export function levelUp(g: Game): void {
  g.gainXp(Math.max(1, g.player.nextXp - g.player.xp));
}

export function revealAll(g: Game): void {
  const grid = g.floor.map.grid;
  for (let i = 0; i < grid.tiles.length; i++) if (grid.tiles[i] !== Tile.Rock) g.floor.seen[i] = 1;
}

/** Remove every monster but the boss. */
export function clearMonsters(g: Game): void {
  g.floor.monsters = g.floor.monsters.filter((m) => m.boss);
}

/** Open the stairs as if the boss were dead. */
export function openStairs(g: Game): void {
  const [x, y] = g.floor.map.stairsDown;
  g.floor.map.grid.set(x, y, Tile.StairsDown);
  g.floor.bossDead = true;
}
