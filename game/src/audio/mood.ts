// Which mood the music should be in, from the state of the game. Kept apart
// from the audio code so it can be tested without a browser.

import type { Game } from "../game/game";
import type { Mood } from "./score";

/** Turns without contact before a fight counts as over... */
const CALM_TURNS = 8;
/** ...and real seconds, so a quick lull doesn't flip the music back and forth. */
const CALM_MS = 6000;
const NEAR = 8;

export class MoodTracker {
  private contactTurn = -Infinity;
  private contactAt = -Infinity;
  private lastBoss: "boss" | "rage" | null = null;

  reset(): void {
    this.contactTurn = -Infinity;
    this.contactAt = -Infinity;
    this.lastBoss = null;
  }

  mood(game: Game, now: number): Mood {
    if (game.outcome === "won") return "won";
    if (game.outcome === "dead") return "lost";
    const p = game.player;
    // A new run in the same tracker: old contact means nothing.
    if (this.contactTurn > p.turns) this.reset();
    const awake = game.floor.monsters.filter((m) => m.awake && game.isVisible(m.x, m.y));
    const boss = awake.find((m) => m.boss);
    if (boss || awake.some((m) => Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) <= NEAR)) {
      this.contactTurn = p.turns;
      this.contactAt = now;
    }
    if (boss) {
      this.lastBoss = boss.phase > 0 ? "rage" : "boss";
      return this.lastBoss;
    }
    const fighting = p.turns - this.contactTurn < CALM_TURNS || now - this.contactAt < CALM_MS;
    // A boss that steps out of sight for a moment keeps its music.
    if (fighting && this.lastBoss && !game.floor.bossDead) return this.lastBoss;
    this.lastBoss = null;
    return fighting ? "combat" : "explore";
  }
}
