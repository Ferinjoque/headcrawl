// What a finished run leaves behind in this browser: the best result per
// commit, the bestiary, trophies, and a ghost to race next time.

import type { Game } from "../game/game";
import { recordRun } from "./best";
import { addRun, loadCodex, saveCodex } from "./codex";
import { keepGhost } from "./ghostrun";
import { RULES } from "../game/record";
import { earnedBy } from "../game/trophies";
import { award } from "./trophycase";
import { heat } from "../game/extras";
import { clearHeat } from "./settings";

/**
 * `route` is the run's save key; empty for a dungeon with no route. Watched
 * runs are someone else's, so they only count toward nothing. Returns the
 * ids of trophies this run earned for the first time.
 */
export function recordFinished(game: Game, route: string, watched: boolean): string[] {
  const result = {
    floor: game.floor.index + 1,
    floors: game.spec.floors.length,
    won: game.outcome === "won",
    turns: game.player.turns,
  };
  if (watched) return [];
  if (route) {
    saveCodex(addRun(loadCodex(), game));
    keepGhost(route, { ...result, log: game.record(), rules: RULES, head: game.spec.repo.head });
  }
  recordRun(game.spec.repo.head, result);
  if (result.won) clearHeat(heat(game.mods));
  return award(earnedBy(game), game.spec.repo.name);
}
