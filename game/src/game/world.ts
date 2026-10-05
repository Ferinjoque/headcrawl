// One floor's live state: the map plus everything standing or lying on it.

import { Rng } from "../core/rng";
import type { Boss, Enemy, Floor } from "../spec";
import { layoutFloor, roomCells, type FloorMap } from "../map/layout";
import { TUNING } from "./abilities";
import { FLOOR_CAP, XP_PASSED_ON, bossScale, capsFor, depthScale, softCap } from "./balance";
import { affixFor, eliteOf, isRemote, makeElite } from "./elites";
import { fromFixme, fromTests } from "./gear";
import type { Item, Monster } from "./types";
import type { KeeperNpc, Vendor } from "./extras";

export interface FloorState {
  index: number;
  map: FloorMap;
  monsters: Monster[];
  items: Item[];
  seen: Uint8Array;
  visible: Uint8Array;
  bossDead: boolean;
  bossMet: boolean;
  shrinesUsed: Set<number>;
  vendor: Vendor | null;
  keeper: KeeperNpc | null;
  /** Loop traps already sprung on this floor. */
  loopsDone: Set<number>;
  /** A git checkout HACK already sent this floor back a year. */
  rewound: boolean;
  /** XP multiplier for this floor's monsters, above 1 when the cap left some out. */
  xpScale: number;
}

/**
 * Big repos have hundreds of functions a floor. Fighting every one makes a
 * run drag, so a floor keeps its most complex ones (elites always) and the
 * ones it leaves out pass part of their XP on, so you still level.
 */
export function rosterFor(floor: Floor, entry: string, cap = FLOOR_CAP): { keep: Set<Enemy>; xpScale: number } {
  const all = floor.rooms.filter((r) => r.id !== entry || floor.rooms.length === 1).flatMap((r) => r.enemies);
  if (all.length <= cap) return { keep: new Set(all), xpScale: 1 };
  const elites = new Set(floor.rooms.map(eliteOf).filter((e): e is Enemy => !!e));
  const ranked = [...all].sort(
    (a, b) => Number(elites.has(b)) - Number(elites.has(a)) || b.ccn - a.ccn || b.nloc - a.nloc || a.id.localeCompare(b.id),
  );
  const keep = new Set(ranked.slice(0, cap));
  const xp = (list: Enemy[]) => list.reduce((s, e) => s + e.xp, 0);
  const kept = xp(ranked.slice(0, cap));
  const lost = xp(ranked.slice(cap));
  return { keep, xpScale: kept > 0 ? 1 + (XP_PASSED_ON * lost) / kept : 1 };
}

// Skip prefixes that half the functions share, or every monster on a test
// floor would be a "t".
const PREFIX = /^(?:_+|test_?|get_?|set_?|is_?|has_?|on_?|handle_?|do_?|make_?|new_?|to_?)(?=[A-Za-z])/i;

export function glyphFor(name: string): string {
  const base = name.replace(/^.*[.:]/, "");
  const m = base.replace(PREFIX, "").match(/[A-Za-z]/) ?? name.match(/[A-Za-z]/);
  return m ? m[0] : "?";
}

export function fromEnemy(e: Enemy, x: number, y: number, room: number, depth: number, floors: number): Monster {
  const k = depthScale(depth);
  const cap = capsFor(depth, floors);
  const hp = Math.max(1, Math.round(softCap(e.hp, cap.hp) * k));
  const tough = e.archetype === "tangle" || e.archetype === "wall";
  const g = glyphFor(e.name);
  return {
    id: e.id,
    name: e.name,
    glyph: tough ? g.toUpperCase() : g.toLowerCase(),
    archetype: isRemote(e) ? "remote" : e.archetype,
    affix: null,
    x,
    y,
    hp,
    maxHp: hp,
    damage: Math.max(1, Math.round(softCap(e.damage, cap.damage) * k)),
    speed:
      e.archetype === "imp"
        ? Math.max(e.speed, TUNING.impSpeed)
        : e.archetype === "wall"
          ? Math.min(e.speed, TUNING.wallSpeed)
          : e.speed,
    energy: 0,
    xp: e.xp,
    room,
    awake: false,
    boss: null,
    enemy: e,
    phase: 0,
    lastTaunt: -99,
    threat: [],
    turns: 0,
    cooldown: 0,
    split: false,
  };
}

function fromBoss(b: Boss, x: number, y: number, room: number, depth: number, floors: number): Monster {
  const cap = capsFor(depth, floors);
  const k = bossScale(depth);
  const hp = Math.max(1, Math.round(softCap(b.hp * k, cap.bossHp)));
  return {
    id: b.id,
    name: b.name,
    glyph: glyphFor(b.name).toUpperCase(),
    archetype: "boss",
    affix: null,
    x,
    y,
    hp,
    maxHp: hp,
    damage: Math.max(1, Math.round(softCap(b.damage * k, cap.bossDamage))),
    speed: b.speed,
    energy: 0,
    xp: b.xp,
    room,
    awake: false,
    boss: b,
    enemy: null,
    phase: 0,
    lastTaunt: -99,
    threat: [],
    turns: 0,
    cooldown: 0,
    split: false,
  };
}

export function buildFloor(floor: Floor, seed: string, floors = 1): FloorState {
  const map = layoutFloor(floor, seed);
  const rng = new Rng(`${seed}/spawn/${floor.index}`);
  const monsters: Monster[] = [];
  const items: Item[] = [];
  const roster = rosterFor(floor, map.entry.spec.id);
  // The biggest test file on the floor leaves its suite lying around as armor.
  const shrines = map.rooms.filter((r) => r.spec.kind === "shrine");
  const suite = shrines.sort((a, b) => b.spec.functions - a.spec.functions || a.index - b.index)[0] ?? null;

  for (const rect of map.rooms) {
    let cells = rng.shuffle(roomCells(map, rect));
    const room = rect.spec;
    if (rect === map.lair) {
      // Near the middle of its room. If you start in the lair (a floor with
      // one file), as far from you as the room allows instead.
      const [sx, sy] = rect === map.entry ? map.start : [rect.cx, rect.cy];
      const off = (c: [number, number]) => Math.abs(c[0] - sx) + Math.abs(c[1] - sy);
      const sorted = [...cells].sort((a, b) => off(a) - off(b) || a[1] - b[1] || a[0] - b[0]);
      const spot = (rect === map.entry ? sorted.at(-1) : sorted[0]) ?? [rect.cx, rect.cy];
      cells = cells.filter((c) => c !== spot);
      monsters.push(fromBoss(floor.boss, spot[0], spot[1], rect.index, floor.index, floors));
    }
    // You arrive in the entry room. Nobody should be waiting there.
    const enemies = rect === map.entry && map.rooms.length > 1 ? [] : room.enemies;
    const elite = eliteOf(room);
    for (const e of enemies) {
      if (!roster.keep.has(e)) continue;
      const c = cells.pop();
      if (!c) continue;
      const m = fromEnemy(e, c[0], c[1], rect.index, floor.index, floors);
      m.xp = Math.round(m.xp * roster.xpScale);
      if (e === elite) makeElite(m, affixFor(e, room)!);
      monsters.push(m);
    }
    for (const l of room.loot) {
      const c = cells.pop();
      if (!c) continue;
      const source = `${room.path}:${l.line}`;
      if (l.kind === "blade") items.push({ id: l.id, kind: "weapon", x: c[0], y: c[1], loot: l, source, gear: fromFixme(l, room, floor.index) });
      else items.push({ id: l.id, kind: l.kind, x: c[0], y: c[1], loot: l, source });
    }
    if (rect === suite) {
      const c = cells.pop();
      if (c) items.push({ id: `suite-${room.id}`, kind: "armor", x: c[0], y: c[1], loot: null, source: room.path, gear: fromTests(room, floor.index) });
    }
  }
  const size = map.grid.width * map.grid.height;
  return {
    index: floor.index,
    map,
    monsters,
    items,
    seen: new Uint8Array(size),
    visible: new Uint8Array(size),
    bossDead: false,
    bossMet: false,
    shrinesUsed: new Set(),
    vendor: null,
    keeper: null,
    loopsDone: new Set(),
    rewound: false,
    xpScale: roster.xpScale,
  };
}
