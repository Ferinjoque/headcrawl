// Side branches. A floor can have a door (Y) to one of the repo's other
// branches: stand on it and press > to check it out. The branch is the same
// folder laid out differently, without its boss, with a weapon waiting by the
// stairs at the far end, and those stairs merge you back where you left.
// Only command line builds list branches, so browser links never change.

import { Rng } from "../core/rng";
import type { DungeonSpec } from "../spec";
import { Tile } from "../map/grid";
import { roomCells } from "../map/layout";
import { weapon, weaponBonus } from "./gear";
import { npcAt } from "./extras";
import { buildFloor, type FloorState } from "./world";

export interface BranchDoor {
  x: number;
  y: number;
  name: string;
  /** Checked out already; a branch is visited once. */
  used: boolean;
}

/** One branch per floor, in order, for as long as the list lasts. */
/** `from` is the first floor with side doors, so the first branch goes there. */
export function placeBranch(state: FloorState, spec: DungeonSpec, from = 0): BranchDoor | null {
  const branch = spec.repo.branches?.[state.index - from];
  if (!branch) return null;
  const { map } = state;
  const rooms = map.rooms.filter((r) => r !== map.entry && r !== map.lair && r.spec.kind !== "shrine");
  if (!rooms.length) return null;
  const rng = new Rng(`${spec.seed}/branch/${state.index}`);
  const room = rooms[rng.int(0, rooms.length - 1)];
  const free = rng
    .shuffle(roomCells(map, room))
    .find(([x, y]) => map.grid.get(x, y) === Tile.Floor && !state.monsters.some((m) => m.x === x && m.y === y) && !state.items.some((i) => i.x === x && i.y === y) && !npcAt(state, x, y));
  return free ? { x: free[0], y: free[1], name: branch.name, used: false } : null;
}

/** The floor as it is on that branch: a different layout of the same code, no boss, a weapon by the exit. */
export function branchFloor(spec: DungeonSpec, index: number, name: string): FloorState {
  const floor = buildFloor(spec.floors[index], `${spec.seed}/branch/${name}`, spec.floors.length);
  floor.monsters = floor.monsters.filter((m) => !m.boss);
  floor.bossDead = true;
  floor.bossMet = true;
  const [sx, sy] = floor.map.stairsDown;
  floor.map.grid.set(sx, sy, Tile.StairsDown);
  const lair = floor.map.lair.spec;
  const spot = roomCells(floor.map, floor.map.lair).find(
    ([x, y]) => (x !== sx || y !== sy) && floor.map.grid.get(x, y) === Tile.Floor && !floor.items.some((i) => i.x === x && i.y === y),
  );
  if (spot) {
    floor.items.push({
      id: `branch-${index}`,
      kind: "weapon",
      x: spot[0],
      y: spot[1],
      loot: null,
      source: `${name}:${lair.path}`,
      gear: weapon(name.split("/").pop() || name, lair.language, weaponBonus(6, index + 1)),
    });
  }
  return floor;
}
