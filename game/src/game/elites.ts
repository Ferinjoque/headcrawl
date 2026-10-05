// Monsters that stand out from the rest of their room, and the ones that hit
// from a distance. Both come from data the spec already has, so a dungeon
// built in the browser gets the same ones as one built on the command line.

import type { Enemy, Room } from "../spec";
import type { Monster } from "./types";

export type Affix = "god" | "deep" | "hot";

export const AFFIX: Record<Affix, { name: string; text: string }> = {
  god: { name: "huge", text: "a function too long to read in one sitting. Half again as much HP" },
  deep: { name: "deep", text: "nested many levels deep. Armored, takes 2 less damage" },
  hot: { name: "hot", text: "from a file that changes all the time. Faster, and worth more" },
};

export const ELITE = {
  /** Rooms with fewer monsters than this have no elite. */
  minRoom: 3,
  godLines: 60,
  deepNesting: 5,
  hotHeat: 0.5,
  godHp: 1.5,
  deepArmor: 2,
  hotSpeed: 30,
  xp: 1.5,
  /** Chance an elite leaves a weapon or armor behind. */
  gear: 0.3,
};

/** What makes this function stand out, if anything. Long beats deep beats hot. */
export function affixFor(e: Enemy, room: Room): Affix | null {
  if (e.nloc >= ELITE.godLines) return "god";
  if (e.nesting >= ELITE.deepNesting) return "deep";
  if (room.heat >= ELITE.hotHeat) return "hot";
  return null;
}

/** The one enemy per room that gets to be an elite: the most branches, first in the file on a tie. */
export function eliteOf(room: Room): Enemy | null {
  if (room.enemies.length < ELITE.minRoom) return null;
  const top = room.enemies.reduce((a, b) => (b.ccn > a.ccn || (b.ccn === a.ccn && b.line < a.line) ? b : a));
  return affixFor(top, room) ? top : null;
}

export function makeElite(m: Monster, affix: Affix): void {
  m.affix = affix;
  m.xp = Math.round(m.xp * ELITE.xp);
  if (affix === "god") {
    m.hp = Math.round(m.hp * ELITE.godHp);
    m.maxHp = m.hp;
  }
  if (affix === "hot") m.speed += ELITE.hotSpeed;
}

// ---- remote calls ---------------------------------------------------------

const NETWORK = /fetch|request|send|post|upload|download|http|url|socket|remote|rpc|api|client|emit|publish|dispatch|notify|webhook/i;

/** A small function that talks to the network keeps its distance and shoots. Tests don't count. */
export function isRemote(e: Enemy): boolean {
  if (e.archetype !== "bug" && e.archetype !== "imp") return false;
  const base = e.name.replace(/^.*[.:]/, "");
  return !/^test/i.test(base) && NETWORK.test(base);
}

export const REMOTE = {
  range: 4,
};

/** Cells from `a` towards `b`, not including `a`, stopping before anything solid. */
export function lineCells(a: { x: number; y: number }, b: { x: number; y: number }, open: (x: number, y: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (!open(x, y)) break;
    out.push([x, y]);
  }
  return out;
}
