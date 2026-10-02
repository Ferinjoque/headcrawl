// Best run per dungeon, kept in this browser only. Storage can be missing or
// blocked (private windows, embedded previews), so every access is guarded.

export interface Best {
  floor: number;
  floors: number;
  won: boolean;
  turns: number;
}

const KEY = "headcrawl.best.v1";

function readAll(): Record<string, Best> {
  try {
    const raw = localStorage.getItem(KEY);
    const data: unknown = raw ? JSON.parse(raw) : {};
    return data && typeof data === "object" ? (data as Record<string, Best>) : {};
  } catch {
    return {};
  }
}

export function bestFor(head: string): Best | null {
  const b = readAll()[head];
  return b && typeof b.floor === "number" ? b : null;
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
  if (!better(run, all[head] ?? null)) return false;
  all[head] = run;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    return false;
  }
  return true;
}

export function bestLabel(b: Best | null): string {
  if (!b) return "";
  return b.won ? `cleared in ${b.turns} turns` : `best: floor ${b.floor}/${b.floors}`;
}
