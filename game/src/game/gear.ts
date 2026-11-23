// Weapons and armor. A weapon is a function you took from the code, and it
// fights the way its language does: Rust pierces armor, Go never misses, C
// crits hard and bites back. Armor is the error handling wrapped around a
// function, spelled the way that language spells it.

import type { Loot, Room } from "../spec";

export type Slot = "weapon" | "armor";

export type Trait = "pierce" | "cleave" | "async" | "steady" | "unsafe" | "heavy" | "arc" | "loose" | "plain";

export interface Gear {
  slot: Slot;
  /** A function name, a FIXME or a test file. Shown as is. */
  name: string;
  language: string;
  /** Weapons only. Armor is always plain. */
  trait: Trait;
  /** Attack for a weapon, defense for armor. */
  bonus: number;
}

/** `name` is the programmer joke, `title` what a player calls it. */
export const TRAITS: Record<Trait, { name: string; title: string; text: string }> = {
  pierce: { name: "borrow checked", title: "piercing", text: "ignores armor" },
  cleave: { name: "duck typed", title: "sweeping", text: "half damage to everything else next to you" },
  async: { name: "async", title: "quick", text: "one swing in four takes no time" },
  steady: { name: "boring", title: "steady", text: "never misses" },
  unsafe: { name: "unsafe", title: "reckless", text: "crits hit three times as hard, a miss costs you 1 HP" },
  heavy: { name: "enterprise", title: "heavy", text: "+1 damage and knocks back" },
  arc: { name: "ref counted", title: "leeching", text: "every kill heals 2" },
  loose: { name: "loosely typed", title: "wild", text: "hits for anywhere from half to double" },
  plain: { name: "plain", title: "plain", text: "no tricks" },
};

const TRAIT_OF: Record<string, Trait> = {
  rust: "pierce",
  python: "cleave",
  ruby: "cleave",
  lua: "cleave",
  javascript: "async",
  typescript: "async",
  go: "steady",
  c: "unsafe",
  cpp: "unsafe",
  java: "heavy",
  kotlin: "heavy",
  csharp: "heavy",
  scala: "heavy",
  swift: "arc",
  php: "loose",
};

/** Languages whose weapons have this trait, for hints like "find a Rust weapon". */
export function languagesWith(trait: Trait): string[] {
  return Object.keys(TRAIT_OF).filter((l) => TRAIT_OF[l] === trait);
}

export function traitFor(language: string): Trait {
  return TRAIT_OF[language] ?? "plain";
}

/** How each language wraps something that might fail. */
const GUARD: Record<string, (fn: string) => string> = {
  python: (f) => `try/except around ${f}`,
  ruby: (f) => `begin/rescue around ${f}`,
  javascript: (f) => `try/catch around ${f}`,
  typescript: (f) => `try/catch around ${f}`,
  go: (f) => `if err != nil after ${f}`,
  rust: (f) => `Result<> from ${f}`,
  java: (f) => `throws on ${f}`,
  kotlin: (f) => `runCatching { ${f} }`,
  csharp: (f) => `try/catch around ${f}`,
  scala: (f) => `Try(${f})`,
  swift: (f) => `do/catch around ${f}`,
  php: (f) => `try/catch around ${f}`,
  c: (f) => `if (${f}() < 0)`,
  cpp: (f) => `noexcept ${f}`,
  lua: (f) => `pcall(${f})`,
};

export function guardName(fn: string, language: string): string {
  return (GUARD[language] ?? ((f: string) => `a guard around ${f}`))(fn);
}

/** Grows a little every other floor so a floor 1 find doesn't carry the run. */
export function weaponBonus(power: number, depth: number): number {
  return 1 + Math.floor(power / 4) + Math.floor(depth / 3);
}

/** Armor stays small: every point comes off every hit, so 3 is a lot. */
export function armorBonus(power: number, depth: number): number {
  return 1 + Math.floor(power / 6) + Math.floor(depth / 4);
}

export function weapon(name: string, language: string, bonus: number): Gear {
  return { slot: "weapon", name, language, trait: traitFor(language), bonus };
}

export function armor(name: string, language: string, bonus: number): Gear {
  return { slot: "armor", name, language, trait: "plain", bonus };
}

/** A FIXME lying in a file: you fight with the comment itself. */
export function fromFixme(l: Loot, room: Room, depth: number): Gear {
  const text = (l.text || l.tag).slice(0, 40);
  return weapon(`FIXME "${text}"`, room.language, weaponBonus(l.power, depth));
}

/** A test file's suite, worn as armor. Bigger suites cover more. */
export function fromTests(room: Room, depth: number): Gear {
  const power = Math.min(8, Math.round(Math.log2(room.functions + 1) * 1.5));
  return armor(`${room.name} suite`, room.language, armorBonus(power, depth));
}

/** Higher is better, for comparing two things for the same slot. */
export function score(g: Gear | null): number {
  if (!g) return 0;
  return g.bonus * 10 + (g.trait === "plain" ? 0 : 3);
}

/** "parse_args +4, async" or "try/except around x, defense 2". */
export function describe(g: Gear): string {
  if (g.slot === "armor") return `${g.name}, defense ${g.bonus}`;
  return g.trait === "plain" ? `${g.name} +${g.bonus}` : `${g.name} +${g.bonus}, ${TRAITS[g.trait].name}`;
}
