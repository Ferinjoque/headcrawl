// The title screen: the repo list, its keys, and what is folded away behind tab.

import { dailyPick, dailyStarts } from "./daily";
import type { GalleryEntry } from "./gallery";
import { parseCode } from "./codes";
import { recentBuilds } from "./recent";
import { listSaves } from "./save";
import { titleScreen, type TitleView } from "./screens";
import { parseRoute, type Route } from "./share";
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
  caption(): string;
}

export class TitleMenu {
  selected = 0;
  /** Shown once, after a link or file failed to open. */
  error: string | null = null;
  private view: TitleView = { more: false, code: false };
  private host: TitleHost;

  constructor(host: TitleHost) {
    this.host = host;
  }

  private level(): { level?: Level } {
    const level = this.host.level();
    return level ? { level } : {};
  }

  /** Back to the plain list: nothing unfolded. */
  reset(): void {
    this.view = { more: false, code: false };
  }

  playDaily(): void {
    const daily = dailyPick(this.host.gallery(), new Date());
    if (daily) this.host.navigate({ kind: "gallery", slug: daily.entry.slug, run: daily.run });
  }

  render(): void {
    const h = this.host;
    const gallery = h.gallery();
    const daily = dailyPick(gallery, new Date());
    h.show(
      titleScreen(
        gallery,
        this.selected,
        this.error,
        daily && { repo: daily.entry.repo, label: daily.label, played: dailyStarts(daily.label) > 0 },
        {
          play: (slug) => h.navigate({ kind: "gallery", slug, run: h.freshRun(), ...this.level() }),
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
          toggleMore: () => this.toggleMore(),
          bestiary: () => h.bestiary(),
          folder: () => h.openFolder(),
          showCode: () => this.showCode(),
        },
        recentBuilds(),
        listSaves(),
        this.view,
      ),
    );
    document.querySelector<HTMLElement>(`.repos button[data-index="${this.selected}"]`)?.scrollIntoView({ block: "nearest" });
    const caption = document.getElementById("attract");
    if (caption) caption.textContent = h.caption();
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

  toggleMore(): void {
    this.view = { ...this.view, more: !this.view.more };
    this.render();
    if (this.view.more) document.querySelector<HTMLInputElement>('input[name="repo"]')?.focus();
  }

  showCode(): void {
    this.view = { ...this.view, code: true };
    this.render();
    document.querySelector<HTMLInputElement>('input[name="code"]')?.focus();
  }

  key(e: KeyboardEvent): void {
    const h = this.host;
    // Tab and space only mean something when nothing has focus, so keyboard
    // users can still tab through the buttons.
    const idle = e.target === document.body || e.target === document.documentElement;
    if (e.key === "Tab" && !e.shiftKey && idle) {
      e.preventDefault();
      return this.toggleMore();
    }
    // Typing a repo name must not trigger the list shortcuts.
    if (e.target instanceof HTMLInputElement) {
      if (e.key === "Escape") {
        this.reset();
        this.render();
      }
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
    if (key === "ArrowDown" || key === "j" || key === "ArrowUp" || key === "k") {
      const down = key === "ArrowDown" || key === "j";
      this.selected = n ? (this.selected + (down ? 1 : n - 1)) % n : 0;
      e.preventDefault();
      return this.render();
    }
    if (key === "Enter") {
      // Let a focused button handle its own Enter.
      if (document.activeElement instanceof HTMLButtonElement) return;
      const entry = h.gallery()[this.selected];
      if (entry) h.navigate({ kind: "gallery", slug: entry.slug, run: h.freshRun(), ...this.level() });
      return;
    }
    const actions: Record<string, () => void> = {
      c: () => this.showCode(),
      o: () => h.openFile(),
      d: () => this.playDaily(),
      "?": () => h.help(),
      b: () => h.bestiary(),
      ...(this.view.more ? { f: () => h.openFolder() } : {}),
    };
    const act = actions[key];
    if (act) {
      e.preventDefault();
      act();
    }
  }
}
