// Level-up choices. Each perk is a dev tool and changes how a fight goes,
// so picking one is a real decision, not just bigger numbers.

export type PerkId =
  | "linter"
  | "typechecker"
  | "coverage"
  | "refactoring"
  | "caffeine"
  | "pairing"
  | "debugger"
  | "rubberduck"
  | "ci"
  | "di"
  | "monorepo"
  | "breaker"
  | "flag"
  | "stash"
  | "owners"
  | "lazy"
  | "static"
  | "logging"
  | "retry"
  | "fuzzing"
  | "gc";

export interface Perk {
  id: PerkId;
  name: string;
  text: string;
  /** Can be taken more than once. */
  stacks?: boolean;
  /** Shows up a third as often. */
  rare?: boolean;
}

export const PERKS: Record<PerkId, Perk> = {
  linter: { id: "linter", name: "Linter", text: "bugs can't dodge you, bugs and imps take 2 more damage" },
  typechecker: { id: "typechecker", name: "Type checker", text: "ignore wall armor, 2 more damage to walls" },
  coverage: { id: "coverage", name: "Test coverage", text: "shrines on this floor work again, max HP +6" },
  refactoring: { id: "refactoring", name: "Refactoring", text: "attack +2", stacks: true },
  caffeine: { id: "caffeine", name: "Caffeine", text: "coffee heals three times as much, regen faster" },
  pairing: { id: "pairing", name: "Pair programming", text: "one hit in five lands twice" },
  debugger: { id: "debugger", name: "Debugger", text: "crits twice as often" },
  rubberduck: { id: "rubberduck", name: "Rubber duck", text: "below a third of your HP, take 2 less damage" },
  ci: { id: "ci", name: "CI pipeline", text: "tangles stop regrowing, 2 more damage to them" },
  di: { id: "di", name: "Dependency injection", text: "hydras don't split, 2 more damage to them" },
  monorepo: { id: "monorepo", name: "Monorepo", text: "max HP +12", stacks: true },
  breaker: { id: "breaker", name: "Circuit breaker", text: "monsters land 15% fewer of their plain swings" },
  flag: { id: "flag", name: "Feature flag", text: "once a floor, a hit that would kill you leaves you at 1 HP", rare: true },
  stash: { id: "stash", name: "git stash", text: "every floor you reach, a TODO is waiting in your pack" },
  owners: { id: "owners", name: "Code owners", text: "vendors sell you both of their dependencies", rare: true },
  lazy: { id: "lazy", name: "Lazy loading", text: "the first hit on something asleep always crits" },
  static: { id: "static", name: "Static analysis", text: "3 more damage to anything winding up" },
  logging: { id: "logging", name: "Structured logging", text: "kills give a third more XP" },
  retry: { id: "retry", name: "Retry with backoff", text: "a miss swings once more" },
  fuzzing: { id: "fuzzing", name: "Fuzzing", text: "crits hit one time harder", rare: true },
  gc: { id: "gc", name: "Garbage collector", text: "double damage to ghosts and boss helpers" },
};

export const ALL_PERKS = Object.keys(PERKS) as PerkId[];

/** Perks still on offer: everything not taken yet, plus the ones that stack. */
export function available(taken: readonly PerkId[]): PerkId[] {
  return ALL_PERKS.filter((id) => PERKS[id].stacks || !taken.includes(id));
}

const RARE_WEIGHT = 1;
const COMMON_WEIGHT = 3;

/** Up to `n` different perks, rare ones less likely. `roll` gives 0 <= x < 1. */
export function offer(taken: readonly PerkId[], roll: () => number, n = 3): PerkId[] {
  const pool = available(taken);
  const out: PerkId[] = [];
  while (out.length < n && pool.length) {
    const weights = pool.map((id) => (PERKS[id].rare ? RARE_WEIGHT : COMMON_WEIGHT));
    let x = roll() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < pool.length - 1 && x >= weights[i]) x -= weights[i++];
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
