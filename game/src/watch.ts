// Watching a recorded run: the action log plays back on a timer, with pause,
// single steps and speed keys.

import type { Game } from "./game/game";
import type { Action, Tone } from "./game/types";

export interface WatchHost {
  /** The game being watched, while the screen is still showing it. */
  game(): Game | null;
  /** One action played: animate it and redraw. */
  stepped(game: Game): void;
  say(text: string, tone: Tone): void;
  /** The recording ran out; `over` when the run itself ended there. */
  finished(over: boolean): void;
  leave(): void;
}

export class Watcher {
  private actions: Action[] = [];
  private at = 0;
  private perSecond = 8;
  private paused = false;
  private timer = 0;
  private on = false;
  private host: WatchHost;

  constructor(host: WatchHost) {
    this.host = host;
  }

  start(actions: Action[]): void {
    this.actions = actions;
    this.at = 0;
    this.perSecond = 8;
    this.paused = false;
    this.on = true;
    this.host.say("Watching a recorded run. Space pauses, + and - change speed, Esc leaves.", "lore");
    this.tick();
  }

  stop(): void {
    this.on = false;
    window.clearTimeout(this.timer);
  }

  private tick(): void {
    const game = this.host.game();
    window.clearTimeout(this.timer);
    if (!this.on || !game || this.paused) return;
    if (this.at >= this.actions.length || game.outcome !== "playing") {
      this.on = false;
      if (game.outcome === "playing") this.host.say("That's where the recording stops.", "lore");
      this.host.finished(game.outcome !== "playing");
      return;
    }
    game.act(this.actions[this.at++]);
    this.host.stepped(game);
    this.timer = window.setTimeout(() => this.tick(), 1000 / this.perSecond);
  }

  key(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.stop();
      this.host.leave();
      return;
    }
    if (!this.on) return;
    if (e.key === " ") {
      e.preventDefault();
      this.paused = !this.paused;
      this.host.say(this.paused ? "Paused. Space goes on, the right arrow steps." : "Playing.", "info");
      if (!this.paused) this.tick();
    } else if (e.key === "+" || e.key === "=") {
      this.perSecond = Math.min(64, this.perSecond * 2);
    } else if (e.key === "-") {
      this.perSecond = Math.max(1, this.perSecond / 2);
    } else if (e.key === "ArrowRight" && this.paused) {
      this.paused = false;
      this.tick();
      this.paused = true;
    }
  }
}
