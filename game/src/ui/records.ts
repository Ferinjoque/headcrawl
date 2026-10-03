// What a finished run leaves behind in this browser: the best result per
// commit, the bestiary, and a ghost to race next time.

import type { Game } from "../game/game";
import { recordRun } from "./best";
import { addRun, loadCodex, saveCodex } from "./codex";
import { keepGhost } from "./ghostrun";

/**
 * `route` is the run's save key; empty for a dungeon with no route. Watched
 * runs are someone else's, so they only count toward nothing.
 */
export function recordFinished(game: Game, route: string, watched: boolean): void {
  const result = {
    floor: game.floor.index + 1,
    floors: game.spec.floors.length,
    won: game.outcome === "won",
    turns: game.player.turns,
  };
  if (watched) return;
  if (route) {
    saveCodex(addRun(loadCodex(), game));
    keepGhost(route, { log: game.record(), won: result.won, floor: result.floor, turns: result.turns });
  }
  recordRun(game.spec.repo.head, result);
}
