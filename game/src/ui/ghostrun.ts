// Racing a ghost: your best run on a dungeon (or a friend's, from a race
// link) replays as a faint @ that moves one step for each of your turns.
// Runs are their action logs, so a ghost costs a few hundred bytes.

import { Game } from "../game/game";
import type { ModId } from "../game/extras";
import { RULES, decodeLog } from "../game/record";
import type { DungeonSpec } from "../spec";

const KEY = "headcrawl.ghosts.v1";
const KEEP = 24;
const MAX_LOG = 60_000;
const MAX_TURNS = 20_000;

export interface GhostRun {
  log: string;
  won: boolean;
  floor: number;
  turns: number;
  /** Rules version and dungeon commit it was recorded on; anything else would replay off course. */
  rules: number;
  head: string;
}

function readAll(): Map<string, GhostRun> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return new Map();
    return new Map(
      raw.filter(
        (e): e is [string, GhostRun] =>
          Array.isArray(e) &&
          typeof e[0] === "string" &&
          typeof e[1]?.log === "string" &&
          typeof e[1]?.turns === "number" &&
          e[1]?.rules === RULES &&
          typeof e[1]?.head === "string",
      ),
    );
  } catch {
    return new Map();
  }
}

function better(a: GhostRun, b: GhostRun | undefined): boolean {
  if (!b) return true;
  if (a.won !== b.won) return a.won;
  if (a.floor !== b.floor) return a.floor > b.floor;
  return a.turns < b.turns;
}

/** Keeps the run as this dungeon's ghost if it beats the one stored. */
export function keepGhost(route: string, run: GhostRun): boolean {
  if (!route || run.log.length > MAX_LOG || run.turns < 5) return false;
  const all = readAll();
  if (!better(run, all.get(route))) return false;
  all.delete(route);
  all.set(route, run);
  const kept = [...all].slice(-KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    return false;
  }
  return true;
}

export function ghostFor(route: string, head: string): GhostRun | null {
  const g = readAll().get(route);
  return g && g.head === head ? g : null;
}

/** Where the ghost stands after each of its turns: floor, x, y. */
export type Track = Int16Array;

export function trackOf(spec: DungeonSpec, run: number, mods: ModId[], log: string): Track | null {
  const actions = decodeLog(log);
  if (!actions) return null;
  const game = new Game(spec, { run, mods });
  const out: number[] = [game.floor.index, game.player.x, game.player.y];
  for (const a of actions) {
    if (game.outcome !== "playing" || out.length / 3 > MAX_TURNS) break;
    const before = game.player.turns;
    game.act(a);
    if (game.player.turns !== before) out.push(game.floor.index, game.player.x, game.player.y);
  }
  return Int16Array.from(out);
}

/** The ghost's spot at your turn count, or null if it isn't on your floor (or is done). */
export function ghostAt(track: Track, turn: number, floor: number): [number, number] | null {
  const i = Math.min(turn, track.length / 3 - 1) * 3;
  return track[i] === floor ? [track[i + 1], track[i + 2]] : null;
}
