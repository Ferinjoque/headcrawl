// Aiming a review comment: f picks the nearest monster in range, tab or the
// arrows move to the next one, f or enter fires, esc lets it go.

import type { Game } from "../game/game";
import { flightPath, targets } from "../game/ranged";
import type { Action, Monster } from "../game/types";

export interface AimHost {
  /** The game, while the player is free to act. */
  game(): Game | null;
  step(action: Action): void;
  say(text: string): void;
  /** Redraw: the target moved. */
  redraw(): void;
}

export class Aim {
  private list: Monster[] = [];
  private index = 0;
  private host: AimHost;

  constructor(host: AimHost) {
    this.host = host;
  }

  /** f: start aiming, or fire if already aiming. */
  command(): void {
    const game = this.host.game();
    if (!game) return;
    if (this.active) return this.shoot(game);
    if (game.player.review > 0) return this.host.say(`Your last comment is still open. ${game.player.review} more turns.`);
    if (!this.start(game)) return this.host.say("No one in range to review. Comments reach 5 cells.");
    this.host.say("Aiming a review comment: tab for the next target, f to send, esc to drop it.");
    this.host.redraw();
  }

  /** A key while aiming. False if not aiming, or the key drops the aim and should act normally. */
  onKey(e: KeyboardEvent): boolean {
    const game = this.host.game();
    if (!this.active || !game) return false;
    const what = this.key(e);
    e.preventDefault();
    if (what === "fire") this.shoot(game);
    else if (what === "cycle") this.host.redraw();
    else {
      this.cancel();
      this.host.redraw();
      return what === "cancel";
    }
    return true;
  }

  /** A click on the map while aiming: fire at a target there. */
  aimAt(x: number, y: number): boolean {
    const game = this.host.game();
    if (!this.active || !game || !this.pick(x, y)) return false;
    this.shoot(game);
    return true;
  }

  private shoot(game: Game): void {
    const action = this.fire(game);
    if (action) this.host.step(action);
  }

  get active(): boolean {
    return this.list.length > 0;
  }

  /** Start aiming. False, with nothing changed, if no one is in range. */
  start(game: Game): boolean {
    this.list = targets(game);
    this.index = 0;
    return this.active;
  }

  cancel(): void {
    this.list = [];
  }

  cycle(step: number): void {
    if (this.list.length) this.index = (this.index + step + this.list.length) % this.list.length;
  }

  /** Aim straight at whatever stands on (x, y), if it is a target. */
  pick(x: number, y: number): boolean {
    const i = this.list.findIndex((m) => m.x === x && m.y === y);
    if (i >= 0) this.index = i;
    return i >= 0;
  }

  target(): Monster | null {
    return this.list[this.index] ?? null;
  }

  /** The fire action for the current target, and aiming ends. */
  fire(game: Game): Action | null {
    const m = this.target();
    this.cancel();
    return m ? { type: "fire", dx: m.x - game.player.x, dy: m.y - game.player.y } : null;
  }

  /** What the renderer draws: the target and the cells on the way. */
  view(game: Game): { at: [number, number]; path: [number, number][] } | null {
    const m = this.target();
    return m ? { at: [m.x, m.y], path: flightPath(game, m.x, m.y) } : null;
  }

  /** Keys while aiming. Returns what happened, or null if the key means nothing here. */
  key(e: KeyboardEvent): "fire" | "cancel" | "cycle" | null {
    switch (e.key) {
      case "f":
      case "Enter":
      case ".":
        return "fire";
      case "Escape":
        return "cancel";
      case "Tab":
      case "ArrowRight":
      case "ArrowDown":
      case "l":
      case "j":
        this.cycle(e.shiftKey ? -1 : 1);
        return "cycle";
      case "ArrowLeft":
      case "ArrowUp":
      case "h":
      case "k":
        this.cycle(-1);
        return "cycle";
      default:
        return null;
    }
  }
}
