// Spec floor (a graph of rooms) -> tile grid.
//
// Rooms are placed one by one next to a neighbour they share an edge with,
// so files that import each other end up close together. Then every edge is
// dug as a corridor with weighted A*. Placement uses a forked RNG, so a floor
// always comes out the same for the same spec.

import { Rng } from "../core/rng";
import type { Floor, Room } from "../spec";
import { findPath } from "./astar";
import { Grid, Tile, Way, walkable } from "./grid";

export interface RoomRect {
  index: number;
  spec: Room;
  /** Outer box, walls included. */
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface FloorMap {
  floor: Floor;
  grid: Grid;
  rooms: RoomRect[];
  byId: Map<string, RoomRect>;
  entry: RoomRect;
  lair: RoomRect;
  start: [number, number];
  stairsDown: [number, number];
  /** Letters used to fill solid rock, taken from this floor's identifiers. */
  rockText: string;
  rowShift: Int16Array;
  /** Import cycles: the middle cell of each loop corridor and the two files. */
  loops: LoopTrap[];
}

export interface LoopTrap {
  cell: number;
  a: string;
  b: string;
}

const GAP = 3;
const MARGIN = 3;

function roomSize(room: Room, isLair: boolean, rng: Rng): [number, number] {
  const s = Math.max(room.size, isLair ? 3 : 1);
  const crowd = Math.ceil((room.enemies.length + room.loot.length) / 3);
  const w = 7 + 2 * s + rng.int(0, 2) + crowd;
  const h = 5 + s + rng.int(0, 1);
  return [w, h];
}

function overlaps(a: Box, b: Box, pad: number): boolean {
  return a.x - pad < b.x + b.w && b.x - pad < a.x + a.w && a.y - pad < b.y + b.h && b.y - pad < a.y + a.h;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function adjacency(floor: Floor): Map<string, string[]> {
  const adj = new Map<string, string[]>(floor.rooms.map((r) => [r.id, []]));
  for (const e of floor.edges) {
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  for (const list of adj.values()) list.sort();
  return adj;
}

function placeRooms(floor: Floor, rng: Rng): Map<string, Box> {
  const adj = adjacency(floor);
  const placed = new Map<string, Box>();
  const sizes = new Map(floor.rooms.map((r) => [r.id, roomSize(r, r.id === floor.lair, rng)]));
  const order: [string, string | null][] = [[floor.entry, null]];
  const queued = new Set([floor.entry]);
  for (let i = 0; i < order.length; i++) {
    for (const next of rng.shuffle(adj.get(order[i][0]) ?? [])) {
      if (!queued.has(next)) {
        queued.add(next);
        order.push([next, order[i][0]]);
      }
    }
  }
  // Anything the graph didn't reach (the spec says it can't happen) hangs off the entry.
  for (const r of floor.rooms) if (!queued.has(r.id)) order.push([r.id, floor.entry]);

  for (const [id, parent] of order) {
    const [w, h] = sizes.get(id)!;
    if (!parent) {
      placed.set(id, { x: 0, y: 0, w, h });
      continue;
    }
    const p = placed.get(parent)!;
    const pcx = p.x + p.w / 2;
    const pcy = p.y + p.h / 2;
    const base = (Math.max(p.w, p.h) + Math.max(w, h)) / 2 + GAP;
    // The search ring keeps growing, so this always ends. The cap is a guard
    // against a broken spec, not something a real floor gets near.
    for (let attempt = 0; attempt < 20000; attempt++) {
      const dist = base + attempt * 0.25;
      const angle = rng.next() * Math.PI * 2;
      // Cells are taller than wide, so spread further sideways.
      const box = {
        x: Math.round(pcx + Math.cos(angle) * dist * 1.4 - w / 2),
        y: Math.round(pcy + Math.sin(angle) * dist * 0.75 - h / 2),
        w,
        h,
      };
      if (![...placed.values()].some((b) => overlaps(box, b, GAP))) {
        placed.set(id, box);
        break;
      }
    }
    if (!placed.has(id)) {
      const right = Math.max(...[...placed.values()].map((b) => b.x + b.w));
      placed.set(id, { x: right + GAP * 2, y: p.y, w, h });
    }
  }
  return placed;
}

function rockText(floor: Floor): string {
  const words = new Set<string>();
  const add = (s: string) => {
    const w = s.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (w.length >= 3) words.add(w);
  };
  add(floor.boss.name);
  for (const r of floor.rooms) {
    add(r.name.replace(/\.[^.]+$/, ""));
    for (const e of r.enemies) add(e.name);
  }
  if (!words.size) words.add("head");
  return [...words].join(" ") + " ";
}

function carveRooms(grid: Grid, rects: RoomRect[]): void {
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
        grid.set(x, y, edge ? Tile.Wall : Tile.Floor);
        grid.room[grid.idx(x, y)] = r.index;
      }
    }
  }
}

function isCorner(r: RoomRect, x: number, y: number): boolean {
  return (x === r.x || x === r.x + r.w - 1) && (y === r.y || y === r.y + r.h - 1);
}

function digCorridors(grid: Grid, floor: Floor, rects: RoomRect[], byId: Map<string, RoomRect>): LoopTrap[] {
  const loops: LoopTrap[] = [];
  const edges = [...floor.edges].sort(
    (a, b) =>
      (a.kind === b.kind ? b.weight - a.weight : a.kind === "import" ? -1 : 1) ||
      (a.a < b.a ? -1 : a.a > b.a ? 1 : 0) ||
      (a.b < b.b ? -1 : a.b > b.b ? 1 : 0),
  );
  for (const edge of edges) {
    const a = byId.get(edge.a)!;
    const b = byId.get(edge.b)!;
    const way = edge.kind !== "import" ? Way.Passage : edge.loop ? Way.Loop : Way.Import;
    const path = findPath(grid.width, grid.height, [a.cx, a.cy], [b.cx, b.cy], (x, y) => {
      if (x === 0 || y === 0 || x === grid.width - 1 || y === grid.height - 1) return Infinity;
      const t = grid.get(x, y);
      const ri = grid.roomAt(x, y);
      if (ri === a.index || ri === b.index) {
        if (t === Tile.Wall) return isCorner(rects[ri], x, y) ? Infinity : 4;
        return 1;
      }
      if (ri >= 0) return t === Tile.Door ? 2 : 60;
      if (t === Tile.Corridor) return 1;
      return 2;
    });
    if (!path) continue;
    const dug: number[] = [];
    for (const [x, y] of path) {
      const t = grid.get(x, y);
      if (t === Tile.Rock) {
        grid.set(x, y, Tile.Corridor);
        grid.way[grid.idx(x, y)] = way;
        dug.push(grid.idx(x, y));
      } else if (t === Tile.Wall) {
        const ri = grid.roomAt(x, y);
        if (ri >= 0 && isCorner(rects[ri], x, y)) continue;
        grid.set(x, y, Tile.Door);
      }
    }
    // A loop needs a few cells of its own to hide the trap in.
    if (way === Way.Loop && dug.length >= 3) loops.push({ cell: dug[dug.length >> 1], a: a.spec.path, b: b.spec.path });
  }
  return loops;
}

/** Every walkable cell reachable from `from`. */
export function flood(grid: Grid, from: [number, number]): Uint8Array {
  const seen = new Uint8Array(grid.width * grid.height);
  const stack = [grid.idx(from[0], from[1])];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % grid.width;
    const y = (i - x) / grid.width;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (!grid.inside(nx, ny)) continue;
      const ni = grid.idx(nx, ny);
      if (!seen[ni] && walkable(grid.tiles[ni] as Tile)) {
        seen[ni] = 1;
        stack.push(ni);
      }
    }
  }
  return seen;
}

function buildOnce(floor: Floor, rng: Rng): FloorMap | null {
  const boxes = placeRooms(floor, rng);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes.values()) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const grid = new Grid(maxX - minX + MARGIN * 2, maxY - minY + MARGIN * 2);
  const rects: RoomRect[] = floor.rooms.map((spec, index) => {
    const b = boxes.get(spec.id)!;
    const x = b.x - minX + MARGIN;
    const y = b.y - minY + MARGIN;
    return { index, spec, x, y, w: b.w, h: b.h, cx: x + Math.floor(b.w / 2), cy: y + Math.floor(b.h / 2) };
  });
  const byId = new Map(rects.map((r) => [r.spec.id, r]));
  carveRooms(grid, rects);
  const loops = digCorridors(grid, floor, rects, byId);

  const entry = byId.get(floor.entry)!;
  const lair = byId.get(floor.lair)!;
  const reach = flood(grid, [entry.cx, entry.cy]);
  if (rects.some((r) => !reach[grid.idx(r.cx, r.cy)])) return null;

  if (floor.index > 0) grid.set(entry.cx, entry.cy, Tile.StairsUp);
  for (const r of rects) if (r.spec.kind === "shrine") grid.set(r.cx, r.cy, Tile.Shrine);

  const rowShift = new Int16Array(grid.height);
  for (let y = 0; y < grid.height; y++) rowShift[y] = rng.int(0, 400);

  return {
    floor,
    grid,
    rooms: rects,
    byId,
    entry,
    lair,
    start: [entry.cx, entry.cy],
    stairsDown: [lair.cx, lair.cy],
    rockText: rockText(floor),
    loops,
    rowShift,
  };
}

export function layoutFloor(floor: Floor, seed: string): FloorMap {
  const root = new Rng(`${seed}/floor/${floor.index}`);
  for (let attempt = 0; attempt < 8; attempt++) {
    const map = buildOnce(floor, root.fork(attempt));
    if (map) return map;
  }
  throw new Error(`could not lay out floor ${floor.index}`);
}

/** Interior cells of a room that are free for spawning things. */
export function roomCells(map: FloorMap, room: RoomRect): [number, number][] {
  const cells: [number, number][] = [];
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      if (map.grid.get(x, y) !== Tile.Floor) continue;
      if (x === room.cx && y === room.cy) continue;
      const nearDoor = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].some(([nx, ny]) => map.grid.get(nx, ny) === Tile.Door);
      if (!nearDoor) cells.push([x, y]);
    }
  }
  return cells;
}
