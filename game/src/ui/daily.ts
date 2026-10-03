import { hashString } from "../core/rng";
import { MODS, dailyMod, type ModId } from "../game/extras";

/** Same repo and same rolls for everyone on a given UTC day. */
export function dailyPick<T extends { slug: string }>(entries: T[], date: Date): { entry: T; run: number; label: string } | null {
  if (!entries.length) return null;
  const label = date.toISOString().slice(0, 10);
  const run = Number(label.replace(/-/g, ""));
  const entry = entries[hashString(`daily/${label}`) % entries.length];
  return { entry, run, label };
}

/**
 * The daily a gallery route belongs to, if any. Worked out from the route
 * alone, so a replay of an old daily still gets that day's twist.
 */
export function dailyOf<T extends { slug: string }>(entries: T[], slug: string, run: number): { label: string; mod: ModId | null } | null {
  const y = Math.floor(run / 10000);
  const m = Math.floor(run / 100) % 100;
  const d = run % 100;
  if (y < 2000 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  const pick = dailyPick(entries, date);
  if (!pick || pick.entry.slug !== slug || pick.run !== run) return null;
  return { label: pick.label, mod: dailyMod(run) };
}

// Wordle rules: the first time you start a day's run is the one that counts.
// Later starts the same day are practice. Kept in this browser only.
const KEY = "headcrawl.daily.v1";

function read(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** How many times this day's run has been started here. */
export function dailyStarts(label: string): number {
  const n = read()[label];
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
}

/** Counts a fresh start (not a resume). Returns which try this is, from 1. */
export function startDaily(label: string): number {
  const all = read();
  const next = dailyStarts(label) + 1;
  // Only the last week matters; older days drop out.
  const keep = Object.keys(all)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort()
    .slice(-6);
  const out: Record<string, number> = {};
  for (const k of keep) out[k] = all[k];
  out[label] = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    // Blocked storage: every try looks like the first. Fine.
  }
  return next;
}

/** "daily 2026-10-03 (legacy code)" for the share text, "practice" after the first try. Empty when not a daily. */
export function dailyLabel<T extends { slug: string }>(entries: T[], slug: string, run: number, tries: number): string {
  const daily = dailyOf(entries, slug, run);
  if (!daily) return "";
  const twist = daily.mod ? ` (${MODS[daily.mod].name})` : "";
  return `daily ${daily.label}${twist}${tries > 1 ? " practice" : ""}`;
}
