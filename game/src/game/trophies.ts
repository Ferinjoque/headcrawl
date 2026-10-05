// Trophies: small goals checked when a run ends. Each says how to get it, so
// the list doubles as a set of ideas for the next run.

import { heat } from "./extras";
import type { Game } from "./game";

export interface Trophy {
  id: string;
  name: string;
  /** How to earn it, shown greyed out until you do. */
  how: string;
  earned(game: Game): boolean;
}

const won = (g: Game) => g.outcome === "won";

export const TROPHIES: Trophy[] = [
  { id: "boss", name: "first boss", how: "beat a boss", earned: (g) => g.player.bosses >= 1 },
  { id: "bottom", name: "all the way down", how: "clear a dungeon", earned: won },
  { id: "deep", name: "eight floors deep", how: "clear a dungeon with 8 floors", earned: (g) => won(g) && g.spec.floors.length >= 8 },
  { id: "hard", name: "the hard way", how: "clear a dungeon on hard", earned: (g) => won(g) && heat(g.mods) >= 1 },
  { id: "hard4", name: "on call", how: "clear a dungeon on hard 4", earned: (g) => won(g) && heat(g.mods) >= 4 },
  { id: "bare", name: "bare hands", how: "clear a dungeon with no weapon in hand", earned: (g) => won(g) && !g.player.weapon },
  { id: "cursed", name: "works on my machine", how: "clear a dungeon carrying 3 curses", earned: (g) => won(g) && g.player.curses >= 3 },
  { id: "quick", name: "ship it", how: "clear a dungeon in under 300 turns a floor", earned: (g) => won(g) && g.player.turns < 300 * g.spec.floors.length },
  { id: "hoard", name: "backlog", how: "finish a run holding 5 potions", earned: (g) => g.player.potions.length >= 5 },
  { id: "tools", name: "full toolbox", how: "have 8 tools at once", earned: (g) => g.player.perks.length >= 8 },
  { id: "elites", name: "elite hunter", how: "beat 5 elites in one run", earned: (g) => Object.values(g.eliteKills).reduce((a, b) => a + b, 0) >= 5 },
  { id: "hundred", name: "a hundred down", how: "beat 100 monsters in one run", earned: (g) => g.player.kills >= 100 },
];

/** Ids of the trophies this finished run earns. */
export function earnedBy(game: Game): string[] {
  return TROPHIES.filter((t) => t.earned(game)).map((t) => t.id);
}
