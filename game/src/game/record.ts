// A run is its seed plus the actions taken, so the action list is a save file
// and a replay at the same time. One letter per action, repeats folded:
// "l12" is twelve steps right.

import type { Action } from "./types";

const MOVES: Record<string, [number, number]> = {
  k: [0, -1],
  j: [0, 1],
  h: [-1, 0],
  l: [1, 0],
  y: [-1, -1],
  u: [1, -1],
  b: [-1, 1],
  n: [1, 1],
};
/**
 * Bumped whenever the same log would play out differently (new mechanics,
 * new rolls). Saves and links carry it so old ones can be spotted.
 */
export const RULES = 4;

const PERKS = "ABC";
// Vendor: first offer, second offer, walk away.
const BUYS = "VWX";
// Gear on the floor with that slot full: take it or leave it.
const TAKE = "T";
const LEAVE = "D";

export function actionCode(a: Action): string {
  switch (a.type) {
    case "move": {
      const hit = Object.entries(MOVES).find(([, [dx, dy]]) => dx === a.dx && dy === a.dy);
      if (!hit) throw new Error(`no code for move ${a.dx},${a.dy}`);
      return hit[0];
    }
    case "wait":
      return ".";
    case "descend":
      return ">";
    case "quaff":
      return "q";
    case "read":
      return "r";
    case "perk":
      return PERKS[a.index] ?? "A";
    case "buy":
      return a.index < 0 ? "X" : (BUYS[a.index] ?? "X");
    case "gear":
      return a.take ? TAKE : LEAVE;
  }
}

export function codeAction(c: string): Action | null {
  const move = MOVES[c];
  if (move) return { type: "move", dx: move[0], dy: move[1] };
  if (c === ".") return { type: "wait" };
  if (c === ">") return { type: "descend" };
  if (c === "q") return { type: "quaff" };
  if (c === "r") return { type: "read" };
  if (c === TAKE || c === LEAVE) return { type: "gear", take: c === TAKE };
  const buy = BUYS.indexOf(c);
  if (buy >= 0) return { type: "buy", index: buy === 2 ? -1 : buy };
  const perk = PERKS.indexOf(c);
  return perk >= 0 ? { type: "perk", index: perk } : null;
}

export function encodeLog(codes: readonly string[]): string {
  let out = "";
  for (let i = 0; i < codes.length; ) {
    let j = i;
    while (j < codes.length && codes[j] === codes[i]) j++;
    out += codes[i] + (j - i > 1 ? String(j - i) : "");
    i = j;
  }
  return out;
}

const MAX_ACTIONS = 200_000;

/** Null if the text isn't a valid log. */
export function decodeLog(text: string): Action[] | null {
  const out: Action[] = [];
  const re = /([hjklyubn.>qrABCVWXTD])(\d{0,6})/gy;
  let m: RegExpExecArray | null;
  let at = 0;
  while (at < text.length && (m = re.exec(text))) {
    const action = codeAction(m[1])!;
    const count = m[2] ? Number(m[2]) : 1;
    if (count < 1 || out.length + count > MAX_ACTIONS) return null;
    for (let k = 0; k < count; k++) out.push(action);
    at = re.lastIndex;
  }
  return at === text.length ? out : null;
}
