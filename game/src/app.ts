// Ties the rules, the renderer and the DOM together.

import { autoAction, type AutoMode } from "./game/auto";
import { Game } from "./game/game";
import type { GameEvent } from "./game/types";
import { buildFloor, type FloorState } from "./game/world";
import { PLAYER } from "./game/balance";
import { walkable } from "./map/grid";
import { Effects } from "./render/effects";
import { C } from "./render/palette";
import { Renderer } from "./render/renderer";
import { loadSpec, type DungeonSpec } from "./spec";
import { replace } from "./ui/dom";
import { loadGallery, loadGalleryDungeon, type GalleryEntry } from "./ui/gallery";
import { renderHud } from "./ui/hud";
import { keyToCommand, touchPad, type Command } from "./ui/input";
import { Log } from "./ui/log";
import { renderPanel } from "./ui/panel";
import { endScreen, helpScreen, messageScreen, titleScreen } from "./ui/screens";
import { decodeSpec, encodeSpec, parseRoute, resultText, routeHash, type Route } from "./ui/share";

type Mode = "title" | "play" | "help" | "pause" | "end" | "loading";

const $ = (id: string) => document.getElementById(id)!;

export class App {
  private renderer: Renderer;
  private fx = new Effects();
  private log: Log;
  private mode: Mode = "loading";
  private returnMode: Mode = "title";
  private gallery: GalleryEntry[] = [];
  private selected = 0;
  private titleError: string | null = null;
  private game: Game | null = null;
  private route: Route = { kind: "title" };
  private demo: FloorState | null = null;
  private auto: AutoMode | null = null;
  private autoTimer = 0;
  private copied = false;
  private lastDraw = 0;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor() {
    this.renderer = new Renderer($("view") as HTMLCanvasElement);
    this.renderer.reduced = this.reduced;
    this.fx.reduced = this.reduced;
    this.log = new Log($("log"));
  }

  async start(): Promise<void> {
    await document.fonts.load("20px VT323").catch(() => undefined);
    this.renderer.resize();
    new ResizeObserver(() => this.renderer.resize()).observe($("stage"));
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("hashchange", () => void this.follow(parseRoute(location.hash)));
    this.bindPointer();
    this.bindFiles();
    if (window.matchMedia("(pointer: coarse)").matches) {
      const pad = $("touch");
      pad.hidden = false;
      touchPad(pad, (c) => this.command(c));
    }
    this.gallery = await loadGallery();
    void this.makeDemo();
    requestAnimationFrame((t) => this.frame(t));
    await this.follow(parseRoute(location.hash));
  }

  // ---- routing -------------------------------------------------------------

  private async follow(route: Route): Promise<void> {
    if (route.kind === "title") {
      this.game = null;
      this.showTitle();
      return;
    }
    this.mode = "loading";
    let text: string | null;
    if (route.kind === "gallery") {
      const known = !this.gallery.length || this.gallery.some((g) => g.slug === route.slug);
      text = known ? await loadGalleryDungeon(route.slug) : null;
      if (!text) return this.failToTitle(`No dungeon called "${route.slug}" here.`);
    } else {
      text = decodeSpec(route.data);
      if (!text) return this.failToTitle("That link is broken or too big.");
    }
    const res = loadSpec(text);
    if (!res.ok) return this.failToTitle(res.error);
    this.route = route;
    this.begin(res.spec, route.run);
  }

  private navigate(route: Route): void {
    const hash = routeHash(route);
    if (location.hash === hash) void this.follow(route);
    else location.hash = hash;
  }

  private failToTitle(msg: string): void {
    this.titleError = msg;
    history.replaceState(null, "", "#/");
    this.showTitle();
  }

  // ---- screens -------------------------------------------------------------

  private showScreen(node: HTMLElement | null, clear = false): void {
    const screen = $("screen");
    if (!node) {
      screen.hidden = true;
      screen.replaceChildren();
      return;
    }
    screen.classList.toggle("clear", clear);
    replace(screen, node);
    screen.hidden = false;
  }

  private showTitle(): void {
    this.mode = "title";
    document.body.classList.add("titling");
    this.stopAuto();
    this.log.clear();
    renderHud($("hud"), null);
    replace($("panel"));
    document.title = "HEADCRAWL";
    this.renderTitle();
  }

  private renderTitle(): void {
    this.showScreen(
      titleScreen(this.gallery, this.selected, this.titleError, {
        play: (slug) => this.navigate({ kind: "gallery", slug, run: 0 }),
        open: () => ($("file") as HTMLInputElement).click(),
        help: () => this.openHelp(),
      }),
      true,
    );
    const current = document.querySelector<HTMLElement>(`.repos button[data-index="${this.selected}"]`);
    current?.scrollIntoView({ block: "nearest" });
  }

  private openHelp(): void {
    this.returnMode = this.mode === "help" ? this.returnMode : this.mode;
    this.mode = "help";
    this.showScreen(helpScreen(() => this.closeOverlay()));
  }

  private openPause(): void {
    this.returnMode = "play";
    this.mode = "pause";
    const node = messageScreen("paused", "Esc to resume. M for the repo list, your run will be lost.", () => this.closeOverlay());
    this.showScreen(node);
  }

  private closeOverlay(): void {
    if (this.returnMode === "title" || !this.game) return this.showTitle();
    if (this.returnMode === "end") return this.showEnd();
    this.mode = "play";
    this.showScreen(null);
  }

  private showEnd(): void {
    const game = this.game!;
    this.mode = "end";
    this.stopAuto();
    const share = resultText(game, location.href);
    this.showScreen(
      endScreen(game, share, this.copied, {
        again: () => this.again(),
        copy: () => this.copyResult(share),
        menu: () => this.navigate({ kind: "title" }),
      }),
    );
  }

  private again(): void {
    if (!this.game || this.route.kind === "title") return;
    const run = this.route.run + 1 + Math.floor(Math.random() * 1000);
    this.navigate({ ...this.route, run });
  }

  private copyResult(text: string): void {
    void navigator.clipboard?.writeText(text).then(
      () => {
        this.copied = true;
        this.showEnd();
      },
      () => undefined,
    );
  }

  // ---- game ----------------------------------------------------------------

  private begin(spec: DungeonSpec, run: number): void {
    this.titleError = null;
    this.copied = false;
    this.stopAuto();
    this.fx.clear();
    this.log.clear();
    this.game = new Game(spec, { run });
    document.body.classList.remove("titling");
    this.renderer.snapCamera();
    document.title = `${spec.repo.name} | HEADCRAWL`;
    this.mode = "play";
    this.showScreen(null);
    this.handleEvents(this.game.drain());
    this.refreshUi();
  }

  private refreshUi(): void {
    if (!this.game) return;
    renderHud($("hud"), this.game);
    renderPanel($("panel"), this.game);
    this.log.render();
  }

  private command(c: Command): void {
    if (this.mode === "title") return;
    if (c.kind === "help") return this.openHelp();
    if (c.kind === "menu") return this.mode === "play" ? this.openPause() : this.closeOverlay();
    if (c.kind === "panel") {
      $("panel").classList.toggle("open");
      return;
    }
    if (this.mode !== "play" || !this.game) return;
    this.stopAuto();
    switch (c.kind) {
      case "move":
        this.step({ type: "move", dx: c.dx, dy: c.dy });
        break;
      case "wait":
        this.step({ type: "wait" });
        break;
      case "descend":
        this.step({ type: "descend" });
        break;
      case "quaff":
        this.step({ type: "quaff" });
        break;
      case "read":
        this.step({ type: "read" });
        break;
      case "explore":
        this.startAuto({ kind: "explore" });
        break;
      case "rest":
        this.startAuto({ kind: "rest", startHp: this.game.player.hp });
        break;
    }
  }

  private step(action: Parameters<Game["act"]>[0]): boolean {
    const game = this.game!;
    const took = game.act(action);
    this.handleEvents(game.drain());
    this.refreshUi();
    if (game.outcome !== "playing") {
      this.stopAuto();
      window.setTimeout(() => this.showEnd(), this.reduced ? 200 : 900);
    }
    return took;
  }

  private startAuto(mode: AutoMode): void {
    this.auto = mode;
    const tick = () => {
      if (!this.auto || !this.game || this.mode !== "play") return this.stopAuto();
      const action = autoAction(this.game, this.auto);
      if (!action) {
        if (this.auto.kind === "explore" && !this.game.floor.monsters.some((m) => this.game!.isVisible(m.x, m.y))) {
          this.log.push("Nothing left to explore here.", "info");
          this.log.render();
        }
        return this.stopAuto();
      }
      const hpBefore = this.game.player.hp;
      if (!this.step(action) || this.game.player.hp < hpBefore) return this.stopAuto();
      this.autoTimer = window.setTimeout(tick, this.auto.kind === "rest" ? 8 : this.reduced ? 0 : 32);
    };
    tick();
  }

  private stopAuto(): void {
    this.auto = null;
    window.clearTimeout(this.autoTimer);
  }

  private handleEvents(events: GameEvent[]): void {
    const now = performance.now();
    const fx = this.fx;
    for (const e of events) {
      switch (e.t) {
        case "msg":
          this.log.push(e.text, e.tone);
          break;
        case "hit":
          fx.float(e.x, e.y, e.crit ? `${e.amount}!` : String(e.amount), e.onPlayer ? C.danger : e.crit ? C.gold : C.text, now);
          fx.flash(e.x, e.y, e.onPlayer ? C.danger : C.player, now);
          if (e.onPlayer && e.amount >= 5) fx.shake(4, now);
          if (e.crit) fx.shake(3, now);
          break;
        case "miss":
          fx.float(e.x, e.y, "miss", C.dim, now);
          break;
        case "kill":
          fx.flash(e.x, e.y, e.boss ? C.boss : C.ember, now);
          if (e.boss) fx.shake(9, now);
          break;
        case "heal":
          if (e.amount > 0) fx.float(e.x, e.y, `+${e.amount}`, C.hp, now);
          break;
        case "pickup":
          fx.flash(e.x, e.y, C.loot, now);
          break;
        case "levelup": {
          const p = this.game!.player;
          fx.float(p.x, p.y, `LEVEL ${e.level}`, C.gold, now);
          break;
        }
        case "taunt":
          this.log.push(`${e.name}: "${e.text}"`, "boss");
          break;
        case "descend":
          this.renderer.snapCamera();
          fx.clear();
          break;
        case "death":
          fx.shake(10, now);
          break;
        case "reveal":
        case "victory":
          break;
      }
    }
  }

  // ---- input ---------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    if (this.mode === "title") return this.titleKey(e);
    if (this.mode === "end") {
      if (e.key === "r" || e.key === "R") this.again();
      else if (e.key === "c" || e.key === "C") this.copyResult(resultText(this.game!, location.href));
      else if (e.key === "Escape") this.navigate({ kind: "title" });
      return;
    }
    if (this.mode === "pause" && (e.key === "m" || e.key === "M")) {
      this.navigate({ kind: "title" });
      return;
    }
    if ((this.mode === "help" || this.mode === "pause") && (e.key === "Escape" || e.key === "?")) {
      e.preventDefault();
      this.closeOverlay();
      return;
    }
    const cmd = keyToCommand(e);
    if (!cmd) {
      if (e.key === "Enter" && this.mode === "play") this.command({ kind: "descend" });
      return;
    }
    e.preventDefault();
    this.command(cmd);
  }

  private titleKey(e: KeyboardEvent): void {
    const n = this.gallery.length;
    if (e.key === "ArrowDown" || e.key === "j") this.selected = n ? (this.selected + 1) % n : 0;
    else if (e.key === "ArrowUp" || e.key === "k") this.selected = n ? (this.selected - 1 + n) % n : 0;
    else if (e.key === "Enter") {
      // Let a focused button handle its own Enter.
      if (document.activeElement instanceof HTMLButtonElement) return;
      const entry = this.gallery[this.selected];
      if (entry) this.navigate({ kind: "gallery", slug: entry.slug, run: 0 });
      return;
    } else if (e.key === "o" || e.key === "O") {
      ($("file") as HTMLInputElement).click();
      return;
    } else if (e.key === "?") {
      this.openHelp();
      return;
    } else return;
    e.preventDefault();
    this.renderTitle();
  }

  private bindPointer(): void {
    const canvas = $("view");
    canvas.addEventListener("click", (e) => {
      if (this.mode !== "play" || !this.game) return;
      const [x, y] = this.renderer.cellAt(e.clientX, e.clientY);
      const p = this.game.player;
      const dx = x - p.x;
      const dy = y - p.y;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        if (dx || dy) this.command({ kind: "move", dx, dy });
        else this.command({ kind: "wait" });
        return;
      }
      const grid = this.game.floor.map.grid;
      if (!grid.inside(x, y) || !this.game.floor.seen[grid.idx(x, y)] || !walkable(grid.get(x, y))) return;
      this.stopAuto();
      this.startAuto({ kind: "travel", to: [x, y] });
    });
  }

  private bindFiles(): void {
    const input = $("file") as HTMLInputElement;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void this.openFile(file);
      input.value = "";
    });
    let depth = 0;
    window.addEventListener("dragenter", (e) => {
      e.preventDefault();
      depth++;
      document.body.classList.add("dragging");
    });
    window.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (!depth) document.body.classList.remove("dragging");
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      depth = 0;
      document.body.classList.remove("dragging");
      const file = e.dataTransfer?.files?.[0];
      if (file) void this.openFile(file);
    });
  }

  private async openFile(file: File): Promise<void> {
    if (file.size > 8 * 1024 * 1024) return this.failToTitle("That file is too big for a dungeon.");
    const text = await file.text();
    const res = loadSpec(text);
    if (!res.ok) return this.failToTitle(res.error);
    // Re-serialise so the link holds exactly what was validated.
    this.navigate({ kind: "custom", run: 0, data: encodeSpec(JSON.stringify(res.spec)) });
  }

  // ---- drawing -------------------------------------------------------------

  private async makeDemo(): Promise<void> {
    const entry = this.gallery[0];
    if (!entry) return;
    const text = await loadGalleryDungeon(entry.slug);
    const res = text ? loadSpec(text) : null;
    if (!res?.ok) return;
    const floor = res.spec.floors[res.spec.floors.length - 1];
    this.demo = buildFloor(floor, res.spec.seed, res.spec.floors.length);
  }

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    if (document.hidden) return;
    const busy = this.fx.busy(now);
    // Ambient light still moves when idle, just at a calmer frame rate.
    if (!busy && now - this.lastDraw < (this.reduced ? 250 : 33)) return;
    this.lastDraw = now;
    if (this.game && this.mode !== "title") {
      const dim = this.mode === "play" ? 0 : 0.55;
      this.renderer.render(
        { floor: this.game.floor, player: this.game.player, sight: PLAYER.sight, dim },
        this.fx,
        now,
      );
    } else if (this.demo) {
      const g = this.demo.map.grid;
      const t = this.reduced ? 0 : now / 26000;
      const focus: [number, number] = [g.width / 2 + Math.cos(t) * g.width * 0.3, g.height / 2 + Math.sin(t * 1.3) * g.height * 0.3];
      this.renderer.render({ floor: this.demo, player: null, sight: PLAYER.sight, revealAll: true, dim: 0.35 }, this.fx, now, focus);
    }
  }
}
