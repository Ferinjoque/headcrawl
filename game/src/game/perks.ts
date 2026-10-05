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
  /** What the real thing is, for anyone who doesn't code. */
  about: string;
  /** Can be taken more than once. */
  stacks?: boolean;
  /** Shows up a third as often. */
  rare?: boolean;
}

export const PERKS: Record<PerkId, Perk> = {
  linter: { id: "linter", name: "Linter", text: "bugs can't dodge you, bugs and imps take 2 more damage", about: "a program that nags you about small mistakes" },
  typechecker: { id: "typechecker", name: "Type checker", text: "ignore wall armor, 2 more damage to walls", about: "catches the wrong kind of value before the code runs" },
  coverage: { id: "coverage", name: "Test coverage", text: "shrines on this floor work again, max HP +6", about: "how much of the code the tests actually try" },
  refactoring: { id: "refactoring", name: "Refactoring", text: "attack +2", about: "rewriting code so it reads better and does the same", stacks: true },
  caffeine: { id: "caffeine", name: "Caffeine", text: "coffee heals three times as much, regen faster", about: "you know this one" },
  pairing: { id: "pairing", name: "Pair programming", text: "one hit in five lands twice", about: "two people, one keyboard" },
  debugger: { id: "debugger", name: "Debugger", text: "crits twice as often", about: "stops a program so you can look inside" },
  rubberduck: { id: "rubberduck", name: "Rubber duck", text: "below a third of your HP, take 2 less damage", about: "explain the bug to a duck and you find it" },
  ci: { id: "ci", name: "CI pipeline", text: "tangles stop regrowing, 2 more damage to them", about: "a robot that runs the tests on every change" },
  di: { id: "di", name: "Dependency injection", text: "hydras don't split, 2 more damage to them", about: "hand a function what it needs instead of letting it grab" },
  monorepo: { id: "monorepo", name: "Monorepo", text: "max HP +12", about: "every project in one giant folder", stacks: true },
  breaker: { id: "breaker", name: "Circuit breaker", text: "monsters land 15% fewer of their plain swings", about: "stop calling the thing that keeps failing" },
  flag: { id: "flag", name: "Feature flag", text: "once a floor, a hit that would kill you leaves you at 1 HP", about: "an off switch for new code", rare: true },
  stash: { id: "stash", name: "git stash", text: "every floor you reach, a potion is waiting in your pack", about: "put unfinished work aside for later" },
  owners: { id: "owners", name: "Code owners", text: "shops sell you both of their deals", about: "the people who have to sign off on a change", rare: true },
  lazy: { id: "lazy", name: "Lazy loading", text: "the first hit on something asleep always crits", about: "don't load anything until someone needs it" },
  static: { id: "static", name: "Static analysis", text: "3 more damage to anything winding up", about: "reading code for problems without running it" },
  logging: { id: "logging", name: "Structured logging", text: "kills give a third more XP", about: "logs you can search, not just scroll" },
  retry: { id: "retry", name: "Retry with backoff", text: "a miss swings once more", about: "if it fails, wait a bit and try again" },
  fuzzing: { id: "fuzzing", name: "Fuzzing", text: "crits hit one time harder", about: "throw random junk at code until it breaks", rare: true },
  gc: { id: "gc", name: "Garbage collector", text: "double damage to ghosts and boss helpers", about: "cleans up memory nobody uses any more" },
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
