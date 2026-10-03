import type { Boss, Enemy, Loot } from "../spec";
import type { PerkId } from "./perks";

export type Archetype = Enemy["archetype"];

export interface Monster {
  id: string;
  name: string;
  glyph: string;
  archetype: Archetype | "boss" | "spawn";
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
}

export type ItemKind = Loot["kind"] | "coffee";

export interface Item {
  id: string;
  kind: ItemKind;
  x: number;
  y: number;
  loot: Loot | null;
  /** Where it was found, for the pickup message. */
  source: string;
}

export interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  blade: number;
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
  | { t: "msg"; text: string; tone: Tone; quiet?: boolean }
  | { t: "hit"; x: number; y: number; amount: number; crit: boolean; onPlayer: boolean }
  | { t: "miss"; x: number; y: number }
  | { t: "kill"; x: number; y: number; name: string; boss: boolean }
  | { t: "heal"; x: number; y: number; amount: number }
  | { t: "pickup"; x: number; y: number; kind: ItemKind }
  | { t: "levelup"; level: number }
  | { t: "perk"; id: PerkId }
  | { t: "descend"; floor: number }
  | { t: "taunt"; name: string; text: string }
  | { t: "intro"; name: string; title: string; where: string; text: string; final: boolean }
  | { t: "telegraph"; x: number; y: number }
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
  | { type: "buy"; index: number };

export type Outcome = "playing" | "dead" | "won";
