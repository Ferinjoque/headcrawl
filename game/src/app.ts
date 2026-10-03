// Ties the rules, the renderer and the DOM together.

import { ABILITY } from "./game/abilities";
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
import { h, plural, replace } from "./ui/dom";
import { loadGallery, loadGalleryDungeon, type GalleryEntry } from "./ui/gallery";
import { renderHud } from "./ui/hud";
import { keyToCommand, touchPad, type Command } from "./ui/input";
import { Log } from "./ui/log";
import { renderPanel } from "./ui/panel";
import { compareScreen, endScreen, helpScreen, pauseScreen, perkCard, settingsScreen, titleScreen, type TokenView } from "./ui/screens";
import { TEXT_SCALE, cycle, loadSettings, saveSettings, type Settings } from "./ui/settings";
import { setColors } from "./render/palette";
import { recordRun } from "./ui/best";
import { dailyPick } from "./ui/daily";
import { parseCode, runCode } from "./ui/codes";
import { analyzeInBrowser } from "./lite/client";
import { clearToken, loadToken, saveToken, tokenPlace } from "./ui/token";
import { parseRepo } from "./lite/protocol";
import { recentBuilds, rememberBuild } from "./ui/recent";
import { dropSave, findSave, listSaves, putSave } from "./ui/save";
import { decodeLog } from "./game/record";
import { compareSpecs } from "./lite/compare";
import { validRef } from "./lite/protocol";
import type { Action } from "./game/types";
import { Hints } from "./ui/hints";
import { Sound } from "./ui/sound";
import { downloadText, logFileName, runLog } from "./ui/morgue";
import { decodeSpec, encodeSpec, parseRoute, playRoute, resultText, routeHash, shareLink, type PlayRoute, type Route } from "./ui/share";

type Mode = "title" | "play" | "watch" | "dying" | "help" | "pause" | "settings" | "compare" | "end" | "loading";

const $ = (id: string) => document.getElementById(id)!;

/** A new run number for a fresh game. Shown to the player as part of the run code. */
const freshRun = () => 1 + Math.floor(Math.random() * 9999);

/** Frames per second when nothing is happening but the light still flickers. */
const IDLE_FPS = 12;

export class App {
  private renderer: Renderer;
  private fx = new Effects();
  private sound = new Sound();
  private hints = new Hints();
  private log: Log;
  private mode: Mode = "loading";
  private returnMode: Mode = "title";
  private gallery: GalleryEntry[] = [];
  private selected = 0;
  private titleError: string | null = null;
  game: Game | null = null;
  /** The dungeon being played, or the title. Comparisons live outside it. */
  private route: PlayRoute | { kind: "title" } = { kind: "title" };
  private demo: FloorState | null = null;
  private auto: AutoMode | null = null;
  private autoTimer = 0;
  private endTimer = 0;
  /** Bumped on every navigation so a slow fetch can't replace a newer game. */
  private navSeq = 0;
  private built = new Map<string, string>();
  private saveTimer = 0;
  private watching: { actions: Action[]; at: number; perSecond: number; paused: boolean; timer: number } | null = null;
  private copied = false;
  private lastDraw = 0;
  private dirty = true;
  private osReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private reduced = this.osReduced;
  private settings: Settings;

  constructor() {
    this.renderer = new Renderer($("view") as HTMLCanvasElement);
    this.renderer.reduced = this.reduced;
    this.fx.reduced = this.reduced;
    this.log = new Log($("log"));
    this.settings = { ...loadSettings(this.osReduced), sound: this.sound.enabled };
    this.applySettings();
  }

  private applySettings(): void {
    const s = this.settings;
    document.documentElement.dataset.text = s.text;
    document.documentElement.dataset.colors = s.colors;
    setColors(s.colors);
    this.reduced = this.osReduced || s.motion === "calm";
    this.renderer.reduced = this.reduced;
    this.fx.reduced = this.reduced;
    this.renderer.textScale = TEXT_SCALE[s.text];
    this.renderer.rockBase = s.colors === "contrast" ? 0.07 : 0.15;
    this.renderer.resize();
    this.touch();
    saveSettings(s);
  }

  private openSettings(note = "", tokenNote?: TokenView["note"]): void {
    if (this.mode !== "settings") this.returnMode = this.mode === "dying" ? "play" : this.mode;
    this.mode = "settings";
    this.showScreen(
      settingsScreen(this.settings, {
        sound: () => this.changeSetting("sound"),
        text: () => this.changeSetting("text"),
        colors: () => this.changeSetting("colors"),
        motion: () => this.changeSetting("motion"),
        tips: () => this.changeSetting("tips"),
        saveToken: (text, remember) =>
          this.openSettings(
            "",
            saveToken(text, remember)
              ? { text: "Saved. The next repo you build uses it.", ok: true }
              : { text: "That isn't a GitHub token. They start with github_pat_ or ghp_.", ok: false },
          ),
        clearToken: () => {
          clearToken();
          this.openSettings("", { text: "Forgotten.", ok: true });
        },
        close: () => this.closeOverlay(),
      }, note, { place: tokenPlace(), note: tokenNote }),
    );
  }

  private changeSetting(which: "sound" | "text" | "colors" | "motion" | "tips"): void {
    const s = this.settings;
    let note = "";
    if (which === "sound") s.sound = this.sound.toggle();
    if (which === "text") s.text = cycle(["small", "normal", "large"] as const, s.text);
    if (which === "colors") s.colors = cycle(["glow", "colorblind", "contrast"] as const, s.colors);
    if (which === "motion") s.motion = cycle(["full", "calm"] as const, s.motion);
    if (which === "tips") {
      this.hints.reset();
      note = "Tips will show up again as things happen.";
    }
    this.applySettings();
    this.openSettings(note);
    if (this.game) this.refreshUi();
  }

  private settingsKey(e: KeyboardEvent): void {
    // The token field takes any key; only Escape leaves it.
    if (e.target instanceof HTMLInputElement && e.key !== "Escape") return;
    const keys = { "1": "sound", "2": "text", "3": "colors", "4": "motion", "5": "tips" } as const;
    const which = keys[e.key as keyof typeof keys];
    if (which) this.changeSetting(which);
    else if (e.key === "Escape" || e.key === ",") {
      e.preventDefault();
      this.closeOverlay();
    }
  }

  async start(): Promise<void> {
    await document.fonts.load("20px VT323").catch(() => undefined);
    this.renderer.resize();
    new ResizeObserver(() => {
      this.renderer.resize();
      this.touch();
    }).observe($("stage"));
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("pagehide", () => this.scheduleSave(true));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.scheduleSave(true);
    });
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


  private async follow(route: Route): Promise<void> {
    const seq = ++this.navSeq;
    window.clearTimeout(this.endTimer);
    if (route.kind === "title") {
      this.game = null;
      this.showTitle();
      return;
    }
    if (route.kind === "compare") {
      this.game = null;
      return this.showCompare(route.owner, route.repo, route.a, route.b, seq);
    }
    this.mode = "loading";
    let text: string | null;
    if (route.kind === "gallery") {
      const known = !this.gallery.length || this.gallery.some((g) => g.slug === route.slug);
      text = known ? await loadGalleryDungeon(route.slug) : null;
      if (seq !== this.navSeq) return;
      if (!text) return this.failToTitle(`No dungeon called "${route.slug}" here.`);
    } else if (route.kind === "github") {
      text = await this.buildGitHub(route.owner, route.repo, route.sha);
      if (seq !== this.navSeq) return;
      if (!text) return;
    } else {
      text = decodeSpec(route.data);
      if (!text) return this.failToTitle("That link is broken or too big.");
    }
    const res = loadSpec(text);
    if (!res.ok) return this.failToTitle(res.error);
    this.route = route;
    if (route.watch) {
      const raw = decodeSpec(route.watch);
      const actions = raw === null ? null : decodeLog(raw);
      if (!actions) return this.failToTitle("That replay link is broken.");
      this.begin(res.spec, route.run);
      this.startWatch(actions);
      return;
    }
    this.begin(res.spec, route.run, findSave(this.saveKey())?.log);
  }

  private saveKey(): string {
    return this.route.kind === "title" ? "" : routeHash(playRoute(this.route));
  }

  /** Saves a little after the last move, and right away when the page goes away. */
  private scheduleSave(now = false): void {
    window.clearTimeout(this.saveTimer);
    const write = () => {
      const game = this.game;
      if (!game || this.mode === "watch" || this.route.kind === "title" || this.route.watch) return;
      if (game.outcome !== "playing") return dropSave(this.saveKey());
      if (!game.log.length) return;
      putSave({
        hash: this.saveKey(),
        repo: game.spec.repo.name,
        log: game.record(),
        floor: game.floor.index + 1,
        floors: game.spec.floors.length,
        at: Date.now(),
      });
    };
    if (now) write();
    else this.saveTimer = window.setTimeout(write, 400);
  }

  private startWatch(actions: Action[]): void {
    this.mode = "watch";
    this.watching = { actions, at: 0, perSecond: 8, paused: false, timer: 0 };
    this.log.push("Watching a recorded run. Space pauses, + and - change speed, Esc leaves.", "lore");
    this.log.render();
    this.tickWatch();
  }

  private tickWatch(): void {
    const w = this.watching;
    const game = this.game;
    if (!w || !game || this.mode !== "watch") return;
    window.clearTimeout(w.timer);
    if (w.paused) return;
    if (w.at >= w.actions.length || game.outcome !== "playing") {
      this.watching = null;
      if (game.outcome === "playing") {
        this.log.push("That's where the recording stops.", "lore");
        this.log.render();
        this.mode = "play";
        return;
      }
      window.setTimeout(() => this.showEnd(), this.reduced ? 200 : 900);
      return;
    }
    game.act(w.actions[w.at++]);
    this.handleEvents(game.drain());
    this.refreshUi();
    w.timer = window.setTimeout(() => this.tickWatch(), 1000 / w.perSecond);
  }

  private watchKey(e: KeyboardEvent): void {
    const w = this.watching;
    if (e.key === "Escape") {
      if (w) window.clearTimeout(w.timer);
      this.watching = null;
      this.navigate({ kind: "title" });
      return;
    }
    if (!w) return;
    if (e.key === " ") {
      e.preventDefault();
      w.paused = !w.paused;
      this.log.push(w.paused ? "Paused. Space goes on, the right arrow steps." : "Playing.", "info");
      this.log.render();
      if (!w.paused) this.tickWatch();
    } else if (e.key === "+" || e.key === "=") {
      w.perSecond = Math.min(64, w.perSecond * 2);
    } else if (e.key === "-") {
      w.perSecond = Math.max(1, w.perSecond / 2);
    } else if (e.key === "ArrowRight" && w.paused) {
      w.paused = false;
      this.tickWatch();
      w.paused = true;
    }
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


  private showScreen(node: HTMLElement | null, clear = false): void {
    this.touch();
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
    const daily = dailyPick(this.gallery, new Date());
    this.showScreen(
      titleScreen(this.gallery, this.selected, this.titleError, daily && { repo: daily.entry.repo, label: daily.label }, {
        play: (slug) => this.navigate({ kind: "gallery", slug, run: freshRun() }),
        daily: () => this.playDaily(),
        build: (target) => void this.buildFromGitHub(target),
        reopen: (r) => this.navigate({ kind: "github", owner: r.owner, repo: r.repo, sha: r.sha, run: 0 }),
        resume: (s) => {
          location.hash = s.hash;
        },
        compare: (repo, ref) => void this.buildCompare(repo, ref),
        code: (text) => {
          // A whole link from someone else's copy works too: only the part after # matters.
          const hash = text.trim().match(/#\/\S*$/)?.[0];
          if (hash && parseRoute(hash).kind !== "title") {
            location.hash = hash;
            return;
          }
          const route = parseCode(text);
          const status = document.getElementById("code-status");
          if (route) this.navigate(route);
          else if (status) {
            status.className = "error";
            status.textContent = "Codes look like flask-4821 or owner/repo@abc1234-4821. Whole links work too.";
          }
        },
        open: () => ($("file") as HTMLInputElement).click(),
        help: () => this.openHelp(),
        settings: () => this.openSettings(),
      },
      recentBuilds(),
      listSaves(),
      ),
      true,
    );
    const current = document.querySelector<HTMLElement>(`.repos button[data-index="${this.selected}"]`);
    current?.scrollIntoView({ block: "nearest" });
  }

  private dailyLabel(): string {
    const daily = dailyPick(this.gallery, new Date());
    const r = this.route;
    return daily && r.kind === "gallery" && r.slug === daily.entry.slug && r.run === daily.run ? `daily ${daily.label}` : "";
  }

  private saveLog(): void {
    if (this.game) downloadText(logFileName(this.game), runLog(this.game, shareLink(location.href)));
  }

  private buildStatus(text: string, tone = "dim"): void {
    const el = document.getElementById("build-status");
    if (!el) return;
    el.className = tone;
    el.textContent = text;
  }

  /** Runs the in-browser analyzer, remembering results so a link opens instantly. */
  private async buildGitHub(owner: string, repo: string, sha?: string): Promise<string | null> {
    const key = `${owner}/${repo}@${sha ?? "latest"}`.toLowerCase();
    const cached = this.built.get(key);
    if (cached) return cached;
    if (this.mode !== "title") this.showTitle();
    this.mode = "loading";
    this.buildStatus(`Building ${owner}/${repo}`, "t-loot");
    document.getElementById("build-status")?.scrollIntoView({ block: "center" });
    try {
      const json = await analyzeInBrowser(owner, repo, (text) => this.buildStatus(text, "t-loot"), sha, loadToken() ?? undefined);
      this.built.set(key, json);
      return json;
    } catch (err) {
      this.mode = "title";
      this.buildStatus(err instanceof Error ? err.message : String(err), "error");
      return null;
    }
  }

  /** Build the same repo at an old ref and at its latest commit, then compare. */
  private async buildCompare(target: string, ref: string): Promise<void> {
    const repo = parseRepo(target);
    if (!repo) return this.buildStatus("That doesn't look like owner/repo or a GitHub link.", "error");
    const then = ref.trim();
    if (!validRef(then)) return this.buildStatus("For then, give a tag, a branch or a commit, like v1.0.0.", "error");
    const old = await this.buildGitHub(repo.owner, repo.repo, then);
    if (!old) return;
    const latest = await this.buildGitHub(repo.owner, repo.repo);
    if (!latest) return;
    const a = loadSpec(old);
    const b = loadSpec(latest);
    if (!a.ok || !b.ok) return this.buildStatus("One of the two builds came out broken.", "error");
    for (const [json, spec] of [[old, a.spec], [latest, b.spec]] as const) {
      this.built.set(`${repo.owner}/${repo.repo}@${spec.repo.head}`.toLowerCase(), json);
    }
    this.navigate({ kind: "compare", owner: repo.owner, repo: repo.repo, a: a.spec.repo.head, b: b.spec.repo.head });
  }

  private compareRoutes: { then: PlayRoute; now: PlayRoute } | null = null;

  private async showCompare(owner: string, repo: string, a: string, b: string, seq: number): Promise<void> {
    const old = await this.buildGitHub(owner, repo, a);
    if (seq !== this.navSeq || !old) return;
    const latest = await this.buildGitHub(owner, repo, b);
    if (seq !== this.navSeq || !latest) return;
    const then = loadSpec(old);
    const now = loadSpec(latest);
    if (!then.ok || !now.ok) return this.failToTitle("One of the two builds came out broken.");
    this.mode = "compare";
    this.route = { kind: "title" };
    this.compareRoutes = {
      then: { kind: "github", owner, repo, sha: a, run: freshRun() },
      now: { kind: "github", owner, repo, sha: b, run: freshRun() },
    };
    document.body.classList.add("titling");
    this.showScreen(
      compareScreen(`${owner}/${repo}`, compareSpecs(then.spec, now.spec), {
        playThen: () => this.compareRoutes && this.navigate(this.compareRoutes.then),
        playNow: () => this.compareRoutes && this.navigate(this.compareRoutes.now),
        menu: () => this.navigate({ kind: "title" }),
      }),
      true,
    );
  }

  private async buildFromGitHub(target: string): Promise<void> {
    const repo = parseRepo(target);
    if (!repo) return this.buildStatus("That doesn't look like owner/repo or a GitHub link.", "error");
    const json = await this.buildGitHub(repo.owner, repo.repo);
    if (!json) return;
    const res = loadSpec(json);
    if (!res.ok) return this.buildStatus(res.error, "error");
    const sha = res.spec.repo.head;
    this.built.set(`${repo.owner}/${repo.repo}@${sha}`.toLowerCase(), json);
    rememberBuild({ owner: repo.owner, repo: repo.repo, sha });
    this.navigate({ kind: "github", owner: repo.owner, repo: repo.repo, sha, run: 0 });
  }

  private playDaily(): void {
    const daily = dailyPick(this.gallery, new Date());
    if (daily) this.navigate({ kind: "gallery", slug: daily.entry.slug, run: daily.run });
  }

  private openHelp(): void {
    this.returnMode = this.mode === "help" ? this.returnMode : this.mode;
    this.mode = "help";
    this.showScreen(helpScreen(() => this.closeOverlay()));
  }

  private openPause(): void {
    this.returnMode = this.game?.outcome === "playing" ? "play" : "end";
    this.mode = "pause";
    this.scheduleSave(true);
    this.showScreen(
      pauseScreen({
        resume: () => this.closeOverlay(),
        restart: () => this.restart(),
        settings: () => this.openSettings(),
        menu: () => this.navigate({ kind: "title" }),
      }, this.code()),
    );
  }

  private code(): string | null {
    return this.route.kind === "title" ? null : runCode(playRoute(this.route), this.game?.spec.repo.head);
  }

  private closeOverlay(): void {
    if (this.returnMode === "title" || !this.game) return this.showTitle();
    if (this.returnMode === "pause") return this.openPause();
    if (this.returnMode === "end") return this.showEnd();
    this.mode = "play";
    this.showScreen(null);
  }

  private showEnd(): void {
    const game = this.game;
    if (!game || game.outcome === "playing") return;
    if (this.mode !== "end") {
      recordRun(game.spec.repo.head, {
        floor: game.floor.index + 1,
        floors: game.spec.floors.length,
        won: game.outcome === "won",
        turns: game.player.turns,
      });
    }
    this.mode = "end";
    this.stopAuto();
    const share = resultText(game, shareLink(location.href), this.dailyLabel(), this.code());
    this.showScreen(
      endScreen(game, share, this.copied, {
        again: () => this.again(),
        copy: () => this.copyResult(share),
        save: () => this.saveLog(),
        replay: () => this.copyReplay(),
        menu: () => this.navigate({ kind: "title" }),
      }, this.route.kind !== "title" && !!this.route.watch),
    );
  }

  private restart(): void {
    dropSave(this.saveKey());
    if (this.route.kind === "title") return;
    this.navigate({ ...playRoute(this.route), run: freshRun() });
  }

  private replayLink(): string {
    if (!this.game || this.route.kind === "title") return shareLink(location.href);
    const route: PlayRoute = { ...playRoute(this.route), watch: encodeSpec(this.game.record()) };
    return shareLink(location.href.split("#")[0] + routeHash(route));
  }

  private again(): void {
    if (!this.game || this.route.kind === "title") return;
    // After watching someone's run, "again" means: your turn, same dungeon, same rolls.
    if (this.route.watch) return this.navigate(playRoute(this.route));
    this.restart();
  }

  private copyReplay(): void {
    void navigator.clipboard?.writeText(this.replayLink()).then(
      () => {
        this.log.push("Replay link copied.", "good");
        this.log.render();
      },
      () => undefined,
    );
  }

  private copyResult(text: string): void {
    void navigator.clipboard?.writeText(text).then(
      () => {
        this.copied = true;
        if (this.mode === "end") this.showEnd();
      },
      () => undefined,
    );
  }


  private begin(spec: DungeonSpec, run: number, resume?: string): void {
    window.clearTimeout(this.endTimer);
    this.titleError = null;
    this.copied = false;
    this.stopAuto();
    this.fx.clear();
    this.log.clear();
    const resumed = resume ? Game.replay(spec, run, resume) : null;
    this.game = resumed ?? new Game(spec, { run });
    document.body.classList.remove("titling");
    this.renderer.snapCamera();
    document.title = `${spec.repo.name} | HEADCRAWL`;
    this.mode = "play";
    this.showScreen(null);
    this.handleEvents(this.game.drain());
    this.floorCard();
    if (resumed) this.log.push(`Picked up where you left off, turn ${resumed.player.turns}. Esc then n starts over.`, "good");
    this.refreshUi();
  }

  private pickPerk(index: number): void {
    const game = this.game;
    if (!game?.perkChoice) return;
    game.act({ type: "perk", index });
    this.scheduleSave();
    this.handleEvents(game.drain());
    replace($("banner"));
    this.refreshUi();
  }

  private refreshUi(): void {
    this.touch();
    if (!this.game) return;
    const card = $("banner").querySelector(".choice");
    if (this.game.perkChoice && !card) {
      replace($("banner"), perkCard(this.game.perkChoice, (i) => this.pickPerk(i)));
    } else if (!this.game.perkChoice && card) {
      replace($("banner"));
    }
    if (this.mode !== "watch") for (const tip of this.hints.check(this.game)) this.log.push(tip, "lore");
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
    if (c.kind === "sound") {
      const on = this.sound.toggle();
      this.settings.sound = on;
      saveSettings(this.settings);
      this.log.push(on ? "Sound on. m turns it off." : "Sound off.", "info");
      this.log.render();
      return;
    }
    if (this.mode !== "play" || !this.game) return;
    this.stopAuto();
    if (this.game.perkChoice) {
      if (c.kind === "perk") this.pickPerk(c.index);
      return;
    }
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

  step(action: Parameters<Game["act"]>[0]): boolean {
    const game = this.game!;
    const took = game.act(action);
    this.handleEvents(game.drain());
    this.refreshUi();
    this.scheduleSave(game.outcome !== "playing");
    if (game.outcome !== "playing" && this.mode === "play") {
      // A short beat to see the last hit land. Input stops right away.
      this.mode = "dying";
      this.stopAuto();
      window.clearTimeout(this.endTimer);
      this.endTimer = window.setTimeout(() => {
        if (this.game === game) this.showEnd();
      }, this.reduced ? 200 : 900);
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
      this.sound.play(e);
      switch (e.t) {
        case "msg":
          this.log.push(e.text, e.tone);
          break;
        case "hit":
          fx.float(e.x, e.y, e.crit ? `${e.amount}!` : String(e.amount), e.onPlayer ? C.danger : e.crit ? C.gold : C.text, now);
          fx.flash(e.x, e.y, e.onPlayer ? C.danger : C.player, now);
          if (e.onPlayer && e.amount >= 5) fx.shake(4, now);
          if (e.crit) {
            fx.shake(3, now);
            fx.burst(e.x, e.y, "*+*+", C.gold, now, 0.7);
          }
          break;
        case "miss":
          fx.float(e.x, e.y, "miss", C.dim, now);
          break;
        case "kill":
          fx.flash(e.x, e.y, e.boss ? C.boss : C.ember, now);
          fx.burst(e.x, e.y, e.name, e.boss ? C.boss : C.ember, now, e.boss ? 1.6 : 1);
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
        case "intro":
          this.log.push(`${e.name}, ${e.title}: "${e.text}"`, "boss");
          this.card(e.final ? "the last boss" : "boss", e.name, "boss", `${e.title}. ${e.where}`, e.text);
          fx.shake(5, now);
          break;
        case "descend":
          this.renderer.snapCamera();
          fx.clear();
          this.floorCard();
          break;
        case "death":
          fx.shake(10, now);
          break;
        case "telegraph":
          fx.flash(e.x, e.y, C.danger, now);
          break;
        case "dodge":
          fx.float(e.x, e.y, "dodge", C.dim, now);
          break;
        case "split":
          fx.float(e.x, e.y, "split", C.danger, now);
          fx.flash(e.x, e.y, C.danger, now);
          break;
        case "reveal":
        case "victory":
          break;
      }
    }
  }

  private card(kicker: string, name: string, kind: "boss" | "floor", sub: string, quote?: string): void {
    const el = $("banner");
    replace(
      el,
      h(
        "div",
        { class: "card" },
        h("div", { class: "card-kicker" }, kicker),
        h("div", { class: `card-name ${kind}${name.length > 14 ? " long" : ""}` }, name),
        h("div", { class: "card-sub" }, sub),
        quote ? h("div", { class: "card-quote" }, `"${quote}"`) : null,
      ),
    );
  }

  private floorCard(): void {
    const game = this.game!;
    const f = game.floorSpec;
    this.card(`floor ${f.index + 1} of ${game.spec.floors.length}`, f.name, "floor", `${f.rooms.length} files. Somewhere in here: ${f.boss.name}.`);
  }


  private onKey(e: KeyboardEvent): void {
    this.sound.wake();
    if (this.mode === "settings") return this.settingsKey(e);
    const typing = e.target instanceof HTMLInputElement;
    if (e.key === "," && !typing && (this.mode === "title" || this.mode === "play" || this.mode === "pause")) {
      e.preventDefault();
      return this.openSettings();
    }
    if (this.mode === "title") return this.titleKey(e);
    if (this.mode === "watch") return this.watchKey(e);
    if (this.mode === "compare") {
      if (e.target instanceof HTMLInputElement || !this.compareRoutes) return;
      if (e.key === "1") this.navigate(this.compareRoutes.then);
      else if (e.key === "2") this.navigate(this.compareRoutes.now);
      else if (e.key === "Escape") this.navigate({ kind: "title" });
      return;
    }
    if (this.mode === "dying" || this.mode === "loading") return;
    if (this.mode === "end") {
      if (e.key === "r" || e.key === "R") this.again();
      else if (e.key === "c" || e.key === "C") this.copyResult(resultText(this.game!, shareLink(location.href), this.dailyLabel(), this.code()));
      else if (e.key === "s" || e.key === "S") this.saveLog();
      else if (e.key === "w" || e.key === "W") this.copyReplay();
      else if (e.key === "Escape") this.navigate({ kind: "title" });
      return;
    }
    if (this.mode === "pause" && (e.key === "m" || e.key === "M")) {
      this.navigate({ kind: "title" });
      return;
    }
    if (this.mode === "pause" && (e.key === "n" || e.key === "N")) {
      this.restart();
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
    // Typing a repo name must not trigger the list shortcuts.
    if (e.target instanceof HTMLInputElement) return;
    const n = this.gallery.length;
    if (e.key === "ArrowDown" || e.key === "j") this.selected = n ? (this.selected + 1) % n : 0;
    else if (e.key === "ArrowUp" || e.key === "k") this.selected = n ? (this.selected - 1 + n) % n : 0;
    else if (e.key === "Enter") {
      // Let a focused button handle its own Enter.
      if (document.activeElement instanceof HTMLButtonElement) return;
      const entry = this.gallery[this.selected];
      if (entry) this.navigate({ kind: "gallery", slug: entry.slug, run: freshRun() });
      return;
    } else if (e.key === "o" || e.key === "O") {
      ($("file") as HTMLInputElement).click();
      return;
    } else if (e.key === "d" || e.key === "D") {
      this.playDaily();
      return;
    } else if (e.key === "?") {
      this.openHelp();
      return;
    } else return;
    e.preventDefault();
    this.renderTitle();
  }

  private showTip(clientX: number, clientY: number): void {
    const tip = $("tip");
    const game = this.game;
    if (this.mode !== "play" || !game) {
      tip.hidden = true;
      return;
    }
    const [x, y] = this.renderer.cellAt(clientX, clientY);
    const m = game.isVisible(x, y) ? game.monsterAt(x, y) : undefined;
    const item = game.isVisible(x, y) ? game.itemAt(x, y) : undefined;
    if (!m && !item) {
      tip.hidden = true;
      return;
    }
    if (m) {
      const e = m.enemy;
      replace(
        tip,
        h("div", { class: m.boss ? "tip-name t-boss" : "tip-name t-bad" }, m.name),
        h("div", { class: "dim" }, e?.signature ?? m.boss?.signature ?? "spawned by its boss"),
        h("div", null, `HP ${m.hp}/${m.maxHp}, hits up to ${m.damage}, speed ${m.speed}`),
        h("div", { class: "t-lore" }, ABILITY[m.archetype]),
        e ? h("div", { class: "faint" }, `${plural(e.ccn, "branch")}, depth ${e.nesting}, ${plural(e.params, "arg")}, ${plural(e.nloc, "line")}, line ${e.line}`) : null,
        m.boss ? h("div", { class: "faint" }, `${m.boss.title}. changed in ${m.boss.churn} commits`) : null,
        m.awake ? null : h("div", { class: "faint" }, "asleep"),
      );
    } else if (item) {
      const names = { potion: "TODO", blade: "FIXME", scroll: "HACK", curse: "XXX", coffee: "coffee" } as const;
      replace(
        tip,
        h("div", { class: "tip-name t-loot" }, names[item.kind]),
        item.loot ? h("div", null, `"${item.loot.text}"`) : h("div", null, "Still warm."),
        item.loot?.year
          ? h("div", { class: "faint" }, `written in ${item.loot.year}${item.loot.year_or_older ? " or earlier" : ""}`)
          : null,
        item.source ? h("div", { class: "faint" }, item.source) : null,
      );
    }
    const stage = $("stage").getBoundingClientRect();
    tip.hidden = false;
    const left = Math.min(clientX - stage.left + 16, stage.width - tip.offsetWidth - 8);
    const top = Math.min(clientY - stage.top + 16, stage.height - tip.offsetHeight - 8);
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }

  private bindPointer(): void {
    const canvas = $("view");
    canvas.addEventListener("mousemove", (e) => this.showTip(e.clientX, e.clientY));
    canvas.addEventListener("mouseleave", () => ($("tip").hidden = true));
    // Phones have no hover. The first tap on a monster or item shows what it
    // is; tapping the same cell again walks there.
    let touch = false;
    let tipped = "";
    canvas.addEventListener("pointerdown", (e) => {
      touch = e.pointerType !== "mouse";
    });
    canvas.addEventListener("click", (e) => {
      if (this.mode !== "play" || !this.game) return;
      const [x, y] = this.renderer.cellAt(e.clientX, e.clientY);
      const p = this.game.player;
      const dx = x - p.x;
      const dy = y - p.y;
      const near = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
      if (touch && !near) {
        const cell = `${x},${y}`;
        const visible = this.game.isVisible(x, y);
        if (visible && (this.game.monsterAt(x, y) || this.game.itemAt(x, y)) && tipped !== cell) {
          tipped = cell;
          this.showTip(e.clientX, e.clientY);
          return;
        }
      }
      tipped = "";
      $("tip").hidden = true;
      if (near) {
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


  private async makeDemo(): Promise<void> {
    const entry = this.gallery[0];
    if (!entry) return;
    const text = await loadGalleryDungeon(entry.slug);
    const res = text ? loadSpec(text) : null;
    if (!res?.ok) return;
    const floor = res.spec.floors[res.spec.floors.length - 1];
    this.demo = buildFloor(floor, res.spec.seed, res.spec.floors.length);
  }

  /** Ask for a fresh frame: something on screen changed. */
  private touch(): void {
    this.dirty = true;
  }

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    if (document.hidden) return;
    const moving = this.fx.busy(now) || this.renderer.settling || this.dirty;
    // Idle frames only keep the ambient glow alive. With motion turned down
    // there is nothing ambient to draw, so idle frames stop altogether.
    const idleGap = this.reduced ? Infinity : 1000 / IDLE_FPS;
    if (!moving && now - this.lastDraw < idleGap) return;
    this.dirty = false;
    this.lastDraw = now;
    if (this.game && this.mode !== "title") {
      const dim = this.mode === "play" || this.mode === "dying" || this.mode === "watch" ? 0 : 0.55;
      this.renderer.render(
        { floor: this.game.floor, player: this.game.player, sight: PLAYER.sight, dim, threat: this.game.threatened() },
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
