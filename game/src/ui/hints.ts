// One-time tips that show up the first time something happens, Brogue style.
// Remembered in this browser so a returning player isn't told twice.

import type { Game } from "../game/game";

const KEY = "headcrawl.hints.v1";

const TIPS = {
  monster: "Tip: walk into a monster to hit it.",
  item: "Tip: walk over things to take them. ! potions heal, / is a weapon, [ is armor.",
  telegraph: "Tip: red cells get hit next turn. Step out of them, then hit back.",
  lowhp: "Tip: low on HP. z rests when nothing is chasing you, q drinks a potion.",
  stairs: "Tip: the boss left stairs (>) in its room. Stand on them and press >.",
  explore: "Tip: x explores for you and stops when something shows up.",
} as const;

export type Tip = keyof typeof TIPS;

export class Hints {
  private seen: Set<string>;

  constructor() {
    try {
      this.seen = new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
    } catch {
      this.seen = new Set();
    }
  }

  private once(tip: Tip | "welcome", out: string[]): void {
    if (this.seen.has(tip)) return;
    this.seen.add(tip);
    if (tip !== "welcome") out.push(TIPS[tip]);
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.seen]));
    } catch {
      // Blocked storage: tips may repeat next visit, which is fine.
    }
  }

  reset(): void {
    this.seen.clear();
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing stored to clear.
    }
  }

  /** True only the first time it is asked, in this browser: the welcome card. */
  firstVisit(): boolean {
    if (this.seen.has("welcome")) return false;
    this.once("welcome", []);
    return true;
  }

  /** Marks a tip as learned without showing it, e.g. explore once you press x. */
  learned(tip: Tip): void {
    if (this.seen.has(tip)) return;
    this.once(tip, []);
  }

  /** Tips that apply to the state the game is in right now. */
  check(game: Game): string[] {
    const out: string[] = [];
    const p = game.player;
    if (p.turns >= 15) this.once("explore", out);
    if (game.floor.monsters.some((m) => game.isVisible(m.x, m.y))) this.once("monster", out);
    if (game.floor.items.some((i) => game.isVisible(i.x, i.y))) this.once("item", out);
    if (game.threatened().size) this.once("telegraph", out);
    if (p.hp <= p.maxHp * 0.3) this.once("lowhp", out);
    if (game.floor.bossDead) this.once("stairs", out);
    return out;
  }
}
