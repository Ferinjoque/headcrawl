// The numbers behind a fight, worked out the same way combat.ts and foes.ts
// use them, so the character sheet never says something the rules don't do.

import { HIT } from "./balance";
import { critChance } from "./combat";
import type { Game } from "./game";
import { describe, TRAITS } from "./gear";
import { PERKS } from "./perks";

export interface Stats {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  nextXp: number;
  /** Damage of a plain hit, before crits and perks. */
  attack: [number, number];
  /** 0..1 */
  hit: number;
  crit: number;
  critMult: number;
  defense: number;
  /** How often a monster's plain swing lands, 0..1. */
  struck: number;
  weapon: string;
  trait: string | null;
  armor: string;
  perks: string[];
  curses: number;
}

export function attackRange(g: Game): [number, number] {
  const p = g.player;
  const base = p.atk + (p.weapon?.bonus ?? 0) + (p.weapon?.trait === "heavy" ? 1 : 0);
  const max = base + 1 + Math.floor(p.level / 2);
  if (p.weapon?.trait === "loose") return [Math.max(1, Math.round(base / 2)), max * 2];
  return [base, max];
}

export function hitChance(g: Game): number {
  return g.player.weapon?.trait === "steady" ? 1 : HIT.player;
}

export function stats(g: Game): Stats {
  const p = g.player;
  const t = p.weapon && p.weapon.trait !== "plain" ? TRAITS[p.weapon.trait] : null;
  return {
    hp: p.hp,
    maxHp: p.maxHp,
    level: p.level,
    xp: p.xp,
    nextXp: p.nextXp,
    attack: attackRange(g),
    hit: hitChance(g),
    crit: critChance(g),
    critMult: p.weapon?.trait === "unsafe" ? 3 : 2,
    defense: p.armor?.bonus ?? 0,
    struck: HIT.monster,
    weapon: p.weapon ? describe(p.weapon) : "bare hands",
    trait: t ? `${t.name}: ${t.text}` : null,
    armor: p.armor ? describe(p.armor) : "none",
    perks: p.perks.map((id) => PERKS[id].name),
    curses: p.curses,
  };
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
