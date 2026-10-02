// One floor's live state: the map plus everything standing or lying on it.

import { Rng } from "../core/rng";
import type { Boss, Enemy, Floor } from "../spec";
import { layoutFloor, roomCells, type FloorMap } from "../map/layout";
import { capsFor, depthScale, softCap } from "./balance";
import type { Item, Monster } from "./types";

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
}

// Skip prefixes that half the functions share, or every monster on a test
// floor would be a "t".
const PREFIX = /^(?:_+|test_?|get_?|set_?|is_?|has_?|on_?|handle_?|do_?|make_?|new_?|to_?)(?=[A-Za-z])/i;

export function glyphFor(name: string): string {
  const base = name.replace(/^.*[.:]/, "");
  const m = base.replace(PREFIX, "").match(/[A-Za-z]/) ?? name.match(/[A-Za-z]/);
  return m ? m[0] : "?";
}

function fromEnemy(e: Enemy, x: number, y: number, room: number, depth: number, floors: number): Monster {
  const k = depthScale(depth);
  const cap = capsFor(depth, floors);
  const hp = Math.max(1, Math.round(softCap(e.hp, cap.hp) * k));
  const tough = e.archetype === "tangle" || e.archetype === "wall";
  const g = glyphFor(e.name);
  return {
    id: e.id,
    name: e.name,
    glyph: tough ? g.toUpperCase() : g.toLowerCase(),
    archetype: e.archetype,
    x,
    y,
    hp,
    maxHp: hp,
    damage: Math.max(1, Math.round(softCap(e.damage, cap.damage) * k)),
    speed: e.speed,
    energy: 0,
    xp: e.xp,
    room,
    awake: false,
    boss: null,
    enemy: e,
    phase: 0,
    lastTaunt: -99,
  };
}

function fromBoss(b: Boss, x: number, y: number, room: number, depth: number, floors: number): Monster {
  const cap = capsFor(depth, floors);
  const hp = Math.max(1, Math.round(softCap(b.hp, cap.bossHp)));
  return {
    id: b.id,
    name: b.name,
    glyph: glyphFor(b.name).toUpperCase(),
    archetype: "boss",
    x,
    y,
    hp,
    maxHp: hp,
    damage: Math.max(1, Math.round(softCap(b.damage, cap.bossDamage))),
    speed: b.speed,
    energy: 0,
    xp: b.xp,
    room,
    awake: false,
    boss: b,
    enemy: null,
    phase: 0,
    lastTaunt: -99,
  };
}

export function buildFloor(floor: Floor, seed: string, floors = 1): FloorState {
  const map = layoutFloor(floor, seed);
  const rng = new Rng(`${seed}/spawn/${floor.index}`);
  const monsters: Monster[] = [];
  const items: Item[] = [];

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
    for (const e of enemies) {
      const c = cells.pop();
      if (c) monsters.push(fromEnemy(e, c[0], c[1], rect.index, floor.index, floors));
    }
    for (const l of room.loot) {
      const c = cells.pop();
      if (c) items.push({ id: l.id, kind: l.kind, x: c[0], y: c[1], loot: l, source: `${room.path}:${l.line}` });
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
  };
}
