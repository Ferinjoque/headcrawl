// The title screen's state and keys: which tab is open, which repo is
// picked, and the shortcuts. Moving and picking tick, like a real menu.

import { dailyPick, dailyStarts } from "./daily";
import type { GalleryEntry } from "./gallery";
import { parseCode } from "./codes";
import { recentBuilds } from "./recent";
import { listSaves } from "./save";
import { parseRoute, type Route } from "./share";
import { TITLE_TABS, titleScreen, type TitleTab } from "./title";
import type { Level } from "../game/extras";

export interface TitleHost {
  gallery(): GalleryEntry[];
  show(node: HTMLElement): void;
  navigate(route: Route): void;
  /** A new run number for a fresh game. */
  freshRun(): number;
  /** The difficulty from settings, for runs started here. */
  level(): Level | undefined;
  build(target: string): void;
  compare(repo: string, ref: string): void;
  openFile(): void;
  openFolder(): void;
  help(): void;
  settings(): void;
  bestiary(): void;
  lab(): void;
  /** Menu feedback: a tick for moving, a click for picking. */
  tick(kind: "move" | "pick"): void;
}

export class TitleMenu {
  selected = 0;
  /** Shown once, after a link or file failed to open. */
  error: string | null = null;
  private tab: TitleTab = "repos";
  private host: TitleHost;

  constructor(host: TitleHost) {
    this.host = host;
  }

  private level(): { level?: Level } {
    const level = this.host.level();
    return level ? { level } : {};
  }

  /** Back to the repo list. */
  reset(): void {
    this.tab = "repos";
  }

  playDaily(): void {
    const daily = dailyPick(this.host.gallery(), new Date());
    if (daily) this.host.navigate({ kind: "gallery", slug: daily.entry.slug, run: daily.run });
  }

  private play(slug: string, practice = false): void {
    this.host.tick("pick");
    this.host.navigate({ kind: "gallery", slug, run: this.host.freshRun(), ...this.level(), ...(practice ? { practice: true } : {}) });
  }

  render(): void {
    const h = this.host;
    const gallery = h.gallery();
    const daily = dailyPick(gallery, new Date());
    h.show(
      titleScreen(
        {
          entries: gallery,
          selected: this.selected,
          tab: this.tab,
          error: this.error,
          daily: daily && { repo: daily.entry.repo, label: daily.label, played: dailyStarts(daily.label) > 0 },
          recent: recentBuilds(),
          saves: listSaves(),
        },
        {
          play: (slug, practice) => this.play(slug, practice),
          daily: () => this.playDaily(),
          build: (target) => h.build(target),
          reopen: (r) => h.navigate({ kind: "github", owner: r.owner, repo: r.repo, sha: r.sha, run: 0 }),
          resume: (s) => {
            location.hash = s.hash;
          },
          compare: (repo, ref) => h.compare(repo, ref),
          code: (text) => this.code(text),
          open: () => h.openFile(),
          help: () => h.help(),
          settings: () => h.settings(),
          tab: (id) => this.openTab(id),
          select: (i) => this.select(i),
          bestiary: () => h.bestiary(),
          lab: () => h.lab(),
          folder: () => h.openFolder(),
        },
      ),
    );
    document.querySelector<HTMLElement>(`.repos button[data-index="${this.selected}"]`)?.scrollIntoView({ block: "nearest" });
  }

  private select(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    this.host.tick("move");
    this.render();
  }

  /** Open a tab, and put the cursor in its first box if it has one. */
  openTab(id: TitleTab): void {
    if (id !== this.tab) this.host.tick("move");
    this.tab = id;
    this.render();
    document.querySelector<HTMLInputElement>(".title-main input")?.focus();
  }

  private code(text: string): void {
    // A whole link from someone else's copy works too: only the part after # matters.
    const hash = text.trim().match(/#\/\S*$/)?.[0];
    if (hash && parseRoute(hash).kind !== "title") {
      location.hash = hash;
      return;
    }
    const route = parseCode(text);
    const status = document.getElementById("code-status");
    if (route) this.host.navigate(route);
    else if (status) {
      status.className = "error";
      status.textContent = "Codes look like flask-4821 or owner/repo@abc1234-4821. Whole links work too.";
    }
  }

  private cycleTab(step: number): void {
    const i = TITLE_TABS.findIndex((t) => t.id === this.tab);
    this.openTab(TITLE_TABS[(i + step + TITLE_TABS.length) % TITLE_TABS.length].id);
  }

  key(e: KeyboardEvent): void {
    const h = this.host;
    // Tab and space only mean something when nothing has focus, so keyboard
    // users can still tab through the buttons.
    const idle = e.target === document.body || e.target === document.documentElement;
    if (e.key === "Tab" && idle) {
      e.preventDefault();
      return this.cycleTab(e.shiftKey ? -1 : 1);
    }
    // Typing a repo name must not trigger the shortcuts.
    if (e.target instanceof HTMLInputElement) {
      if (e.key === "Escape") this.openTab("repos");
      return;
    }
    const n = h.gallery().length;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === " " && idle) {
      const save = listSaves()[0];
      if (save) {
        e.preventDefault();
        location.hash = save.hash;
      }
      return;
    }
    const tab = TITLE_TABS.find((t) => t.cap === key);
    if (tab) {
      // Opening a tab focuses its text box; the key must not land in it as a character.
      e.preventDefault();
      return this.openTab(tab.id);
    }
    if (key === "Escape" && this.tab !== "repos") return this.openTab("repos");
    if (this.tab === "repos" && (key === "ArrowDown" || key === "j" || key === "ArrowUp" || key === "k")) {
      const down = key === "ArrowDown" || key === "j";
      e.preventDefault();
      return this.select(n ? (this.selected + (down ? 1 : n - 1)) % n : 0);
    }
    if (this.tab === "repos" && (key === "Enter" || key === "p")) {
      // Let a focused button handle its own Enter.
      if (key === "Enter" && document.activeElement instanceof HTMLButtonElement) return;
      const entry = h.gallery()[this.selected];
      if (entry) this.play(entry.slug, key === "p");
      return;
    }
    const actions: Record<string, () => void> = {
      c: () => this.openTab("code"),
      g: () => this.openTab("github"),
      o: () => h.openFile(),
      f: () => h.openFolder(),
      d: () => this.playDaily(),
      "?": () => h.help(),
      b: () => h.bestiary(),
      l: () => h.lab(),
    };
    const act = actions[key];
    if (act) {
      e.preventDefault();
      h.tick("pick");
      act();
    }
  }
}
