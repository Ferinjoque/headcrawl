// The settings screen and its keys. Each change saves at once.

import { settingsScreen, type TokenView } from "./screens";
import { cycle, difficulties, heatCleared, type Settings } from "./settings";
import { clearToken, saveToken, tokenPlace } from "./token";

export type SettingKey = "sound" | "music" | "text" | "colors" | "motion" | "level" | "code" | "tips";

const KEYS: Record<string, SettingKey> = { "1": "sound", "2": "music", "3": "text", "4": "colors", "5": "motion", "6": "level", "7": "code", "8": "tips" };

/** The next value of one setting. Pure, so a test can walk through them. */
export function nextSettings(s: Settings, which: SettingKey, cleared = heatCleared()): Settings {
  switch (which) {
    case "music":
      return { ...s, music: !s.music };
    case "text":
      return { ...s, text: cycle(["small", "normal", "large"] as const, s.text) };
    case "colors":
      return { ...s, colors: cycle(["glow", "colorblind", "contrast"] as const, s.colors) };
    case "motion":
      return { ...s, motion: cycle(["full", "calm"] as const, s.motion) };
    case "level":
      return { ...s, level: cycle(difficulties(cleared), s.level) };
    case "code":
      return { ...s, code: s.code === "all" ? "hover" : "all" };
    default:
      return s;
  }
}

export interface SettingsHost {
  settings(): Settings;
  /** Store and apply new settings everywhere. */
  apply(next: Settings): void;
  /** Sound has its own switch in the synth; returns whether it is on now. */
  toggleSound(): boolean;
  resetTips(): void;
  show(node: HTMLElement): void;
  close(): void;
}

export class SettingsMenu {
  private host: SettingsHost;

  constructor(host: SettingsHost) {
    this.host = host;
  }

  open(note = "", tokenNote?: TokenView["note"]): void {
    const h = this.host;
    h.show(
      settingsScreen(
        h.settings(),
        {
          sound: () => this.change("sound"),
          music: () => this.change("music"),
          text: () => this.change("text"),
          colors: () => this.change("colors"),
          motion: () => this.change("motion"),
          level: () => this.change("level"),
          code: () => this.change("code"),
          tips: () => this.change("tips"),
          saveToken: (text, remember) =>
            this.open(
              "",
              saveToken(text, remember)
                ? { text: "Saved. The next repo you build uses it.", ok: true }
                : { text: "That isn't a GitHub token. They start with github_pat_ or ghp_.", ok: false },
            ),
          clearToken: () => {
            clearToken();
            this.open("", { text: "Forgotten.", ok: true });
          },
          close: () => h.close(),
        },
        note,
        { place: tokenPlace(), note: tokenNote },
      ),
    );
  }

  change(which: SettingKey): void {
    const h = this.host;
    let next = nextSettings(h.settings(), which);
    let note = "";
    if (which === "sound") next = { ...next, sound: h.toggleSound() };
    if (which === "tips") {
      h.resetTips();
      note = "Tips will show up again as things happen.";
    }
    h.apply(next);
    this.open(note);
  }

  key(e: KeyboardEvent): void {
    // The token field takes any key; only Escape leaves it.
    if (e.target instanceof HTMLInputElement && e.key !== "Escape") return;
    const which = KEYS[e.key];
    if (which) this.change(which);
    else if (e.key === "Escape" || e.key === ",") {
      e.preventDefault();
      this.host.close();
    }
  }
}
