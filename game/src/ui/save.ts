// Runs in progress, kept in this browser. A save is the route plus the action
// log; loading replays the log from the seed, so there's no game state to
// serialise and nothing to migrate between versions of the save format.

export interface SavedRun {
  /** RULES when saved. A save from older rules would replay into another game. */
  rules?: number;
  /** The route hash of the dungeon and run (no replay attached). */
  hash: string;
  repo: string;
  log: string;
  floor: number;
  floors: number;
  at: number;
}

import { RULES } from "../game/record";

const KEY = "headcrawl.saves.v1";
const KEEP = 5;

function valid(s: unknown): s is SavedRun {
  if (typeof s !== "object" || s === null) return false;
  const r = s as Record<string, unknown>;
  return (
    typeof r.hash === "string" &&
    r.hash.startsWith("#/") &&
    typeof r.repo === "string" &&
    typeof r.log === "string" &&
    /^[hjklyubn.>qrABCVWX\d]*$/.test(r.log) &&
    r.rules === RULES &&
    typeof r.floor === "number" &&
    typeof r.floors === "number" &&
    typeof r.at === "number"
  );
}

export function listSaves(): SavedRun[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(data) ? data.filter(valid).slice(0, KEEP) : [];
  } catch {
    return [];
  }
}

export function findSave(hash: string): SavedRun | null {
  return listSaves().find((s) => s.hash === hash) ?? null;
}

function write(saves: SavedRun[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saves.slice(0, KEEP)));
  } catch {
    // Full or blocked storage: the run just won't survive a reload.
  }
}

export function putSave(save: SavedRun): void {
  write([save, ...listSaves().filter((s) => s.hash !== save.hash)]);
}

export function dropSave(hash: string): void {
  write(listSaves().filter((s) => s.hash !== hash));
}
