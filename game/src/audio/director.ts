// Picks what the music plays: the title theme, or the current floor's theme
// in the mood the game is in. The app calls sync() whenever something changes.

import type { Game } from "../game/game";
import { MoodTracker } from "./mood";
import { Music } from "./music";
import { depthOf, theme, type Mood, type Theme } from "./score";

/** The title has its own theme, the same for everyone. */
const TITLE_THEME = theme("HEADCRAWL", 0, "python", "HEADCRAWL");

export function mainLanguage(rooms: { language: string; loc: number }[]): string {
  const loc = new Map<string, number>();
  for (const r of rooms) loc.set(r.language, (loc.get(r.language) ?? 0) + r.loc);
  return [...loc].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
}

/** Screens that get their own music instead of the game's. */
export type Scene = "game" | "title" | "menu" | "shop" | "build";

export class MusicDirector {
  private music = new Music();
  private moods = new MoodTracker();
  private floorTheme: { key: string; theme: Theme } | null = null;

  /** A new run: forget the last one's fights. */
  reset(): void {
    this.moods.reset();
  }

  duck(): void {
    this.music.duck();
  }

  sync(ctx: AudioContext | null, enabled: boolean, game: Game | null, scene: Scene = "game"): void {
    this.music.attach(ctx);
    this.music.enabled = enabled;
    if (!enabled) return this.music.stop();
    if (!game) {
      this.moods.reset();
      this.music.set(TITLE_THEME, scene === "build" ? "build" : scene === "menu" ? "menu" : "title");
      return;
    }
    const f = game.floorSpec;
    const key = `${game.spec.repo.head}/${f.index}`;
    if (this.floorTheme?.key !== key) {
      this.floorTheme = {
        key,
        theme: theme(game.spec.repo.head, depthOf(f.index, game.spec.floors.length), mainLanguage(f.rooms), f.boss.name),
      };
    }
    const mood: Mood = scene === "shop" ? "shop" : scene === "menu" ? "menu" : this.moods.mood(game, performance.now());
    const ghost = game.floor.monsters.some((m) => m.archetype === "ghost" && game.isVisible(m.x, m.y));
    this.music.set(this.floorTheme.theme, mood, { ghost, daily: game.mods.length > 0 });
  }
}
