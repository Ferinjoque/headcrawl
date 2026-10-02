// Player settings, remembered in this browser.

export type TextSize = "small" | "normal" | "large";
export type Colors = "glow" | "colorblind" | "contrast";
export type Motion = "full" | "calm";

export interface Settings {
  sound: boolean;
  text: TextSize;
  colors: Colors;
  motion: Motion;
}

const KEY = "headcrawl.settings.v1";

export const TEXT_SCALE: Record<TextSize, number> = { small: 0.85, normal: 1, large: 1.2 };

export function defaults(reducedMotion: boolean): Settings {
  return { sound: false, text: "normal", colors: "glow", motion: reducedMotion ? "calm" : "full" };
}

export function loadSettings(reducedMotion: boolean): Settings {
  const base = defaults(reducedMotion);
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!raw || typeof raw !== "object") return base;
    const r = raw as Record<string, unknown>;
    return {
      sound: typeof r.sound === "boolean" ? r.sound : base.sound,
      text: r.text === "small" || r.text === "large" || r.text === "normal" ? r.text : base.text,
      colors: r.colors === "colorblind" || r.colors === "contrast" || r.colors === "glow" ? r.colors : base.colors,
      motion: r.motion === "calm" || r.motion === "full" ? r.motion : base.motion,
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
