import { hashString } from "../core/rng";

/** Same repo and same rolls for everyone on a given UTC day. */
export function dailyPick<T extends { slug: string }>(entries: T[], date: Date): { entry: T; run: number; label: string } | null {
  if (!entries.length) return null;
  const label = date.toISOString().slice(0, 10);
  const run = Number(label.replace(/-/g, ""));
  const entry = entries[hashString(`daily/${label}`) % entries.length];
  return { entry, run, label };
}
