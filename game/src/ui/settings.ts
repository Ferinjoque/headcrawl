// Player settings, remembered in this browser.

import { HEATS, isLevel, type Level } from "../game/extras";
import type { CodeDetail } from "./detail";

export type TextSize = "small" | "normal" | "large";
export type Colors = "glow" | "colorblind" | "contrast";
export type Motion = "full" | "calm";
export type Difficulty = "normal" | Level;

export interface Settings {
  sound: boolean;
  /** Music plays only while sound is on; this turns just the music off. */
  music: boolean;
  text: TextSize;
  colors: Colors;
  motion: Motion;
  /** For new runs. A run keeps the difficulty it started with. */
  level: Difficulty;
  /** Where code facts show: in hover tips only, or everywhere. */
  code: CodeDetail;
}

const KEY = "headcrawl.settings.v1";

export const TEXT_SCALE: Record<TextSize, number> = { small: 0.85, normal: 1, large: 1.2 };

export function defaults(reducedMotion: boolean): Settings {
  return { sound: true, music: true, text: "normal", colors: "glow", motion: reducedMotion ? "calm" : "full", level: "normal", code: "hover" };
}

export function loadSettings(reducedMotion: boolean): Settings {
  const base = defaults(reducedMotion);
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!raw || typeof raw !== "object") return base;
    const r = raw as Record<string, unknown>;
    return {
      sound: typeof r.sound === "boolean" ? r.sound : base.sound,
      music: typeof r.music === "boolean" ? r.music : base.music,
      text: r.text === "small" || r.text === "large" || r.text === "normal" ? r.text : base.text,
      colors: r.colors === "colorblind" || r.colors === "contrast" || r.colors === "glow" ? r.colors : base.colors,
      motion: r.motion === "calm" || r.motion === "full" ? r.motion : base.motion,
      level: r.level === "normal" || isLevel(r.level) ? r.level : base.level,
      code: r.code === "all" || r.code === "hover" ? r.code : base.code,
    };
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Blocked storage: settings last until the tab closes.
  }
}

const HEAT_KEY = "headcrawl.heat.v1";

/** The hardest heat cleared in this browser, 0 for none. */
export function heatCleared(): number {
  try {
    const n = Number(localStorage.getItem(HEAT_KEY) ?? 0);
    return Number.isInteger(n) && n >= 0 && n <= HEATS.length ? n : 0;
  } catch {
    return 0;
  }
}

export function clearHeat(h: number): void {
  if (h <= heatCleared()) return;
  try {
    localStorage.setItem(HEAT_KEY, String(Math.min(h, HEATS.length)));
  } catch {
    // Blocked storage: the next heat stays locked.
  }
}

/** Normal, hard and every heat unlocked by clearing the one before, then story. */
export function difficulties(cleared: number): Difficulty[] {
  return ["normal", ...HEATS.slice(0, Math.max(1, cleared + 1)), "story"];
}

export function cycle<T>(options: readonly T[], current: T): T {
  return options[(options.indexOf(current) + 1) % options.length];
}
