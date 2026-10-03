// Attract mode: behind the title screen the bot plays a random gallery
// dungeon, the way arcade cabinets played themselves between coins. It is a
// real game with its own run, so it looks exactly like playing, but it never
// saves, never makes a sound and never writes to the log.

import { botAction } from "./game/bot";
import { Game } from "./game/game";
import type { GameEvent } from "./game/types";
import { loadSpec } from "./spec";
import { loadGalleryDungeon, type GalleryEntry } from "./ui/gallery";

/** How long one demo runs before the next repo takes over. */
const DEMO_MS = 50_000;
/** Pause on a death or a won floor before cutting to the next demo. */
const CUT_MS = 1600;
/** Rests and waits are skipped in bulk so the demo keeps moving. */
const MAX_IDLE_STEPS = 40;

export interface AttractHooks {
  entries(): GalleryEntry[];
  events(game: Game, events: GameEvent[]): void;
  changed(caption: string): void;
  stepMs(): number;
}

export class Attract {
  game: Game | null = null;
  private timer = 0;
  private started = 0;
  private gen = 0;
  private last = "";
  private cache = new Map<string, string>();

  private hooks: AttractHooks;

  constructor(hooks: AttractHooks) {
    this.hooks = hooks;
  }

  get running(): boolean {
    return this.gen > 0;
  }

  start(): void {
    if (this.running) return;
    this.gen = 1;
    void this.next();
  }

  stop(): void {
    this.gen = 0;
    window.clearTimeout(this.timer);
    this.game = null;
  }

  caption(): string {
    const g = this.game;
    if (!g) return "";
    return `demo  ${this.last}  floor ${g.floor.index + 1} of ${g.spec.floors.length}`;
  }

  private async next(): Promise<void> {
    const gen = ++this.gen;
    window.clearTimeout(this.timer);
    const entries = this.hooks.entries();
    if (!entries.length) return;
    const choices = entries.filter((e) => e.slug !== this.last);
    const pick = (choices.length ? choices : entries)[Math.floor(Math.random() * (choices.length || entries.length))];
    const text = this.cache.get(pick.slug) ?? (await loadGalleryDungeon(pick.slug));
    if (gen !== this.gen) return;
    const res = text ? loadSpec(text) : null;
    if (!text || !res?.ok) return;
    this.cache.clear();
    this.cache.set(pick.slug, text);
    const run = 1 + Math.floor(Math.random() * 9999);
    this.game = new Game(res.spec, { run });
    this.game.drain();
    this.last = pick.slug;
    this.started = performance.now();
    this.hooks.changed(this.caption());
    this.tick(gen);
  }

  private tick(gen: number): void {
    const game = this.game;
    if (gen !== this.gen || !game) return;
    const floor = game.floor.index;
    // Resting is skipped in one go; walking and fighting play at normal speed.
    for (let steps = 0; steps < MAX_IDLE_STEPS && game.outcome === "playing"; steps++) {
      const action = botAction(game);
      game.act(action);
      if (action.type !== "wait") break;
    }
    this.hooks.events(game, game.drain());
    if (game.floor.index !== floor) this.hooks.changed(this.caption());
    const over = game.outcome !== "playing" || performance.now() - this.started > DEMO_MS;
    this.timer = window.setTimeout(() => (over ? void this.next() : this.tick(gen)), over ? CUT_MS : this.hooks.stepMs());
  }
}
