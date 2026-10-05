// How a boss fights, read off its own code. Every boss winds up area attacks
// and calls helpers when hurt; on top of that, the thing that stands out
// about the function sets its style.

import type { Boss } from "../spec";

export type BossStyle = "deep" | "sprawl" | "long" | "hot" | "plain";

export const BOSS_STYLE: Record<BossStyle, { name: string; text: string }> = {
  deep: { name: "deeply nested", text: "its sweep reaches 3 cells, but comes slower" },
  sprawl: { name: "too many arguments", text: "calls a helper every few turns, not just when hurt" },
  long: { name: "god function", text: "heals while you are out of reach" },
  hot: { name: "hot path", text: "gets faster the longer the fight goes" },
  plain: { name: "plain", text: "winds up an area attack, calls helpers at half health" },
};

export const BOSS_MOVES = {
  deepNesting: 5,
  sprawlParams: 4,
  longLines: 100,
  /** Older dungeons have no length for bosses; branches stand in for it. */
  longBranches: 25,
  hotChurn: 30,
  deepRadius: 3,
  deepEvery: 5,
  sprawlEvery: 4,
  sprawlMaxHelpers: 3,
  longRegen: 2,
  hotEvery: 8,
  hotStep: 8,
  hotCap: 40,
};

/** Parameters, from the field or counted off the signature for older dungeons. */
export function bossParams(b: Boss): number {
  if (b.params) return b.params;
  const inside = b.signature.match(/\(([^)]*)\)/)?.[1]?.trim();
  if (!inside) return 0;
  return inside.split(",").filter((p) => p.trim() && !/^(self|cls|this)$/.test(p.trim())).length;
}

/** "hot path: gets faster the longer the fight goes", or "" for a plain boss. */
export function styleLine(b: Boss): string {
  const s = styleOf(b);
  return s === "plain" ? "" : `${BOSS_STYLE[s].name}: ${BOSS_STYLE[s].text}`;
}

/** Deep beats sprawling beats long beats hot. */
export function styleOf(b: Boss): BossStyle {
  const m = BOSS_MOVES;
  if ((b.nesting ?? 0) >= m.deepNesting) return "deep";
  if (bossParams(b) >= m.sprawlParams) return "sprawl";
  if ((b.nloc ?? 0) >= m.longLines || (!b.nloc && b.ccn >= m.longBranches)) return "long";
  if (b.churn >= m.hotChurn) return "hot";
  return "plain";
}
