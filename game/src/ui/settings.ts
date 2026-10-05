// Player settings, remembered in this browser.

export type TextSize = "small" | "normal" | "large";
export type Colors = "glow" | "colorblind" | "contrast";
export type Motion = "full" | "calm";
export type Difficulty = "story" | "normal" | "hard";

export interface Settings {
  sound: boolean;
  /** Music plays only while sound is on; this turns just the music off. */
  music: boolean;
  text: TextSize;
  colors: Colors;
  motion: Motion;
  /** For new runs. A run keeps the difficulty it started with. */
  level: Difficulty;
}

const KEY = "headcrawl.settings.v1";

export const TEXT_SCALE: Record<TextSize, number> = { small: 0.85, normal: 1, large: 1.2 };

export function defaults(reducedMotion: boolean): Settings {
  return { sound: true, music: true, text: "normal", colors: "glow", motion: reducedMotion ? "calm" : "full", level: "normal" };
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
      level: r.level === "story" || r.level === "hard" || r.level === "normal" ? r.level : base.level,
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

export function cycle<T>(options: readonly T[], current: T): T {
  return options[(options.indexOf(current) + 1) % options.length];
}
