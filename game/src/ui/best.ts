// Best run per dungeon, kept in this browser only. Storage can be missing or
// blocked (private windows, embedded previews), so every access is guarded.

export interface Best {
  floor: number;
  floors: number;
  won: boolean;
  turns: number;
}

const KEY = "headcrawl.best.v1";

function valid(b: unknown): b is Best {
  if (typeof b !== "object" || b === null) return false;
  const r = b as Record<string, unknown>;
  const int = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9;
  return int(r.floor) && int(r.floors) && int(r.turns) && typeof r.won === "boolean";
}

/** Keyed by commit sha. A Map, so a key like "__proto__" is just a key. */
function readAll(): Map<string, Best> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return new Map();
    return new Map(Object.entries(data).filter((entry): entry is [string, Best] => valid(entry[1])));
  } catch {
    return new Map();
  }
}

export function bestFor(head: string): Best | null {
  return readAll().get(head) ?? null;
}

function better(a: Best, b: Best | null): boolean {
  if (!b) return true;
  if (a.won !== b.won) return a.won;
  if (a.floor !== b.floor) return a.floor > b.floor;
  return a.turns < b.turns;
}

/** Saves the run if it beats the stored one. Returns true when it did. */
export function recordRun(head: string, run: Best): boolean {
  const all = readAll();
  if (!better(run, all.get(head) ?? null)) return false;
  all.set(head, run);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(all)));
  } catch {
    return false;
  }
  return true;
}

export function bestLabel(b: Best | null): string {
  if (!b) return "";
  return b.won ? `cleared in ${b.turns} turns` : `best: floor ${b.floor}/${b.floors}`;
}
