// Earned trophies, kept in this browser only. Storage can be missing or
// blocked, so every access is guarded and a failure just means no trophy.

import { TROPHIES } from "../game/trophies";

export interface Earned {
  /** Where it was first earned. */
  repo: string;
  at: number;
}

const KEY = "headcrawl.trophies.v1";
const KNOWN = new Set(TROPHIES.map((t) => t.id));

export function loadTrophies(): Map<string, Earned> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return new Map();
    return new Map(
      Object.entries(data).filter(
        (e): e is [string, Earned] =>
          KNOWN.has(e[0]) && typeof e[1] === "object" && e[1] !== null && typeof e[1].repo === "string" && typeof e[1].at === "number",
      ),
    );
  } catch {
    return new Map();
  }
}

/** Keeps what a run earned and returns the ids that are new. */
export function award(ids: string[], repo: string, now = Date.now()): string[] {
  const all = loadTrophies();
  const fresh = ids.filter((id) => KNOWN.has(id) && !all.has(id));
  if (!fresh.length) return [];
  for (const id of fresh) all.set(id, { repo: repo.slice(0, 80), at: now });
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(all)));
  } catch {
    return [];
  }
  return fresh;
}
