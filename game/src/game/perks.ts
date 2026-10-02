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
  | "monorepo";

export interface Perk {
  id: PerkId;
  name: string;
  text: string;
  /** Can be taken more than once. */
  stacks?: boolean;
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
};

export const ALL_PERKS = Object.keys(PERKS) as PerkId[];

/** Perks still on offer: everything not taken yet, plus the ones that stack. */
export function available(taken: readonly PerkId[]): PerkId[] {
  return ALL_PERKS.filter((id) => PERKS[id].stacks || !taken.includes(id));
}
