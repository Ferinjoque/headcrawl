import type { Boss, Enemy, Loot } from "../spec";
import type { Affix } from "./elites";
import type { Gear } from "./gear";
import type { PerkId } from "./perks";

export type Archetype = Enemy["archetype"];

export interface Monster {
  id: string;
  name: string;
  glyph: string;
  archetype: Archetype | "boss" | "spawn" | "remote";
  /** What makes it an elite, or null for an ordinary one. */
  affix: Affix | null;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  energy: number;
  xp: number;
  room: number;
  awake: boolean;
  boss: Boss | null;
  enemy: Enemy | null;
  phase: number;
  lastTaunt: number;
  /** Cells this monster will hit on its next turn. Empty when not winding up. */
  threat: [number, number][];
  /** Boss turns taken, for pacing the area attack. */
  turns: number;
  /** Turns until this monster may wind up again. */
  cooldown: number;
  split: boolean;
  /** From a file someone reverted: the first time it dies, it comes back at half HP. */
  undo: number;
}

/** FIXMEs from the spec come in as weapons. */
export type ItemKind = Exclude<Loot["kind"], "blade"> | "coffee" | "weapon" | "armor";

export interface Item {
  id: string;
  kind: ItemKind;
  x: number;
  y: number;
  loot: Loot | null;
  /** Set for weapons and armor. */
  gear?: Gear;
  /** Where it was found, for the pickup message. */
  source: string;
}

export interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  weapon: Gear | null;
  armor: Gear | null;
  /** Turns until you can leave another review comment (f). */
  review: number;
  /** Turns left of a DeprecationWarning: monsters move half again as often. */
  slowed: number;
  level: number;
  xp: number;
  nextXp: number;
  potions: Item[];
  scrolls: Item[];
  curses: number;
  perks: PerkId[];
  kills: number;
  bosses: number;
  killsBy: Record<string, number>;
  bossNames: string[];
  turns: number;
}

export type Tone = "info" | "good" | "bad" | "loot" | "boss" | "lore";

export type GameEvent =
  | { t: "msg"; text: string; tone: Tone; quiet?: boolean; full?: string }
  | { t: "hit"; x: number; y: number; amount: number; crit: boolean; onPlayer: boolean }
  | { t: "miss"; x: number; y: number }
  | { t: "kill"; x: number; y: number; name: string; boss: boolean }
  | { t: "heal"; x: number; y: number; amount: number }
  | { t: "pickup"; x: number; y: number; kind: ItemKind }
  | { t: "levelup"; level: number }
  | { t: "perk"; id: PerkId }
  | { t: "equip"; x: number; y: number; gear: Gear }
  /** Into a side branch, or merged back out of one. */
  | { t: "branch"; name: string; merged: boolean }
  /** A review comment flying from you to a monster. */
  | { t: "shot"; x: number; y: number; tx: number; ty: number }
  | { t: "descend"; floor: number }
  | { t: "taunt"; name: string; text: string }
  | { t: "intro"; name: string; title: string; where: string; text: string; final: boolean; style: string; code: string[] }
  /** A wind-up. "line" is a remote call aiming; the rest hit an area. */
  | { t: "telegraph"; x: number; y: number; line?: boolean }
  | { t: "dodge"; x: number; y: number }
  | { t: "split"; x: number; y: number }
  | { t: "reveal" }
  | { t: "loop" }
  | { t: "rewind" }
  | { t: "death"; killer: string }
  | { t: "victory" };

export type Action =
  | { type: "move"; dx: number; dy: number }
  | { type: "wait" }
  | { type: "descend" }
  | { type: "quaff" }
  | { type: "read" }
  | { type: "perk"; index: number }
  /** At the vendor: which offer, or -1 to walk away. */
  | { type: "buy"; index: number }
  /** Standing on gear with that slot full: take it (yours drops here) or leave it. */
  | { type: "gear"; take: boolean }
  /** A review comment at the monster this far from you. */
  | { type: "fire"; dx: number; dy: number };

export type Outcome = "playing" | "dead" | "won";
