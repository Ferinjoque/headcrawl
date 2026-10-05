// Ties the rules, the renderer and the DOM together.

import { autoAction, type AutoMode } from "./game/auto";
import { Game } from "./game/game";
import type { GameEvent } from "./game/types";
import { Attract } from "./attract";
import { Watcher } from "./watch";
import { TitleMenu } from "./ui/titlemenu";
import { SettingsMenu } from "./ui/settingsmenu";
import { MusicDirector, type Scene } from "./audio/director";
import { PLAYER } from "./game/balance";
import { Effects } from "./render/effects";
import { eventFx } from "./render/eventfx";
import { Renderer } from "./render/renderer";
import { loadSpec, type DungeonSpec } from "./spec";
import { replace } from "./ui/dom";
import { loadGallery, loadGalleryDungeon, type GalleryEntry } from "./ui/gallery";
import { renderHud } from "./ui/hud";
import { keyToCommand, touchPad, type Command } from "./ui/input";
import { Log } from "./ui/log";
import { renderPanel } from "./ui/panel";
import { bestiaryScreen } from "./ui/bestiary";
import { bannerCard, compareScreen, floorBanner, endScreen, helpScreen, pauseScreen } from "./ui/screens";
import { choiceAction, syncChoice } from "./ui/choices";
import { sheetScreen } from "./ui/sheet";
import { TEXT_SCALE, loadSettings, saveSettings, type Settings } from "./ui/settings";
import { setColors } from "./render/palette";
import { recordFinished } from "./ui/records";
import { dailyLabel, dailyOf, dailyStarts, startDaily } from "./ui/daily";
import { MODS, dailyMod, type Level, type ModId } from "./game/extras";
import { runCode } from "./ui/codes";
import { dropSave, findSave, putSave } from "./ui/save";
import { RULES, decodeLog } from "./game/record";
import { compareSpecs } from "./lite/compare";
import { Builder, bindFiles } from "./ui/builder";
import { bindPointer } from "./ui/pointer";
import { copyText, runLink, saveCast, saveGif, saveLog } from "./ui/exports";
import { Hints } from "./ui/hints";
import { loadCodex } from "./ui/codex";
import { ghostAt, ghostFor, trackOf, type Track } from "./ui/ghostrun";
import { Sound } from "./ui/sound";
import { decodeSpec, parseRoute, playRoute, resultText, routeHash, shareLink, type PlayRoute, type Route } from "./ui/share";

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
  private director = new MusicDirector();
  private builder: Builder;
  /** Which try at today's daily this is: 1 counts, later ones are practice. 0 when not a daily. */
  private dailyTry = 0;
  private dailyMod: ModId | null = null;
  /** The run being raced, step by step, and whose it is. */
  private race: { track: Track; whose: string } | null = null;
  private endMore = false;
  /** The finished run went into the bestiary, ghosts and bests already. */
  private recorded = false;
  private hints = new Hints();
  private log: Log;
  private mode: Mode = "loading";
  private returnMode: Mode = "title";
  private gallery: GalleryEntry[] = [];
  game: Game | null = null;
  /** The dungeon being played, or the title. Comparisons live outside it. */
  private route: PlayRoute | { kind: "title" } = { kind: "title" };
  private attract: Attract;
  private title: TitleMenu;
  private settingsMenu: SettingsMenu;
  private auto: AutoMode | null = null;
  private autoTimer = 0;
  private endTimer = 0;
  /** Bumped on every navigation so a slow fetch can't replace a newer game. */
  private navSeq = 0;
  private saveTimer = 0;
  private watcher: Watcher;
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
    this.log = new Log($("log"), window.matchMedia("(max-width: 900px)").matches ? 2 : 3);
    this.settings = { ...loadSettings(this.osReduced), sound: this.sound.enabled };
    this.applySettings();
    this.builder = new Builder({
      status: (text, tone) => this.buildStatus(text, tone),
      busy: (on) => {
        if (on && this.mode !== "title") this.showTitle();
        this.mode = on ? "loading" : "title";
        this.syncMusic();
      },
      navigate: (route) => this.navigate(route),
      fail: (msg) => this.failToTitle(msg),
      level: () => this.levelForNewRuns(),
    });
    this.settingsMenu = new SettingsMenu({
      settings: () => this.settings,
      apply: (next) => {
        this.settings = next;
        this.applySettings();
        this.syncMusic();
        if (this.game) this.refreshUi();
      },
      toggleSound: () => this.sound.toggle(),
      resetTips: () => this.hints.reset(),
      show: (node) => this.showScreen(node),
      close: () => this.closeOverlay(),
    });
    this.title = new TitleMenu({
      gallery: () => this.gallery,
      show: (node) => this.showScreen(node, true),
      navigate: (route) => this.navigate(route),
      freshRun,
      level: () => this.levelForNewRuns(),
      build: (target) => void this.builder.fromGitHub(target),
      compare: (repo, ref) => void this.builder.compare(repo, ref),
      openFile: () => ($("file") as HTMLInputElement).click(),
      openFolder: () => ($("folder") as HTMLInputElement).click(),
      help: () => this.openHelp(),
      settings: () => this.openSettings(),
      bestiary: () => this.overlay((close) => bestiaryScreen(loadCodex(), close)),
      caption: () => this.attract.caption(),
    });
    this.watcher = new Watcher({
      game: () => (this.mode === "watch" ? this.game : null),
      stepped: (game) => {
        this.handleEvents(game.drain());
        this.refreshUi();
      },
      say: (text, tone) => {
        this.log.push(text, tone);
        this.log.render();
      },
      finished: (over) => {
        if (!over) this.mode = "play";
        else window.setTimeout(() => this.showEnd(), this.reduced ? 200 : 900);
      },
      leave: () => this.navigate({ kind: "title" }),
    });
    this.attract = new Attract({
      entries: () => this.gallery,
      events: (game, events) => {
        this.handleEvents(events, game, true);
        this.touch();
      },
      changed: (caption) => {
        const el = document.getElementById("attract");
        if (el) el.textContent = caption;
        this.renderer.snapCamera();
        this.fx.clear();
      },
      stepMs: () => (this.reduced ? 320 : 130),
    });
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
    this.renderer.rockBase = s.colors === "contrast" ? 0.1 : 0.2;
    this.renderer.resize();
    this.touch();
    saveSettings(s);
  }

  private openSettings(): void {
    if (this.mode !== "settings") this.returnMode = this.mode === "dying" ? "play" : this.mode;
    this.mode = "settings";
    this.settingsMenu.open();
  }

  async start(): Promise<void> {
    await document.fonts.load("20px VT323").catch(() => undefined);
    this.renderer.resize();
    new ResizeObserver(() => {
      this.renderer.resize();
      this.touch();
    }).observe($("stage"));
    window.addEventListener("keydown", (e) => this.onKey(e));
    // Fights end by the clock as well as by turns, so check the mood now and then.
    window.setInterval(() => this.syncMusic(), 1000);
    window.addEventListener("pagehide", () => this.scheduleSave(true));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.scheduleSave(true);
    });
    window.addEventListener("hashchange", () => void this.follow(parseRoute(location.hash)));
    bindPointer($("view"), $("tip"), $("stage"), {
      playing: () => (this.mode === "play" ? this.game : null),
      cellAt: (x, y) => this.renderer.cellAt(x, y),
      command: (c) => this.command(c),
      travel: (to) => {
        this.stopAuto();
        this.startAuto({ kind: "travel", to });
      },
    });
    bindFiles(this.builder);
    if (window.matchMedia("(pointer: coarse)").matches) {
      const pad = $("touch");
      pad.hidden = false;
      touchPad(pad, (c) => this.command(c));
    }
    this.gallery = await loadGallery();
    requestAnimationFrame((t) => this.frame(t));
    await this.follow(parseRoute(location.hash));
  }

  private async follow(route: Route): Promise<void> {
    const seq = ++this.navSeq;
    this.watcher.stop();
    window.clearTimeout(this.endTimer);
    if (route.kind === "title") {
      this.game = null;
      this.showTitle();
      return;
    }
    this.attract.stop();
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
      text = await this.builder.github(route.owner, route.repo, route.sha);
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
      this.begin(res.spec, route.run, undefined, true);
      this.mode = "watch";
      this.watcher.start(actions);
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
        rules: RULES,
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

  private navigate(route: Route): void {
    const hash = routeHash(route);
    if (location.hash === hash) void this.follow(route);
    else location.hash = hash;
  }

  private failToTitle(msg: string): void {
    this.title.error = msg;
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
    this.syncMusic();
  }

  private showTitle(): void {
    this.mode = "title";
    this.title.reset();
    this.attract.start();
    this.syncMusic();
    document.body.classList.add("titling");
    this.stopAuto();
    this.log.clear();
    renderHud($("hud"), null);
    replace($("panel"));
    document.title = "HEADCRAWL";
    this.title.render();
  }

  /** Keeps the music in step with the screen. */
  private syncMusic(): void {
    const game = this.route.kind === "title" ? null : this.game;
    const menu = this.mode === "help" || this.mode === "settings" || this.mode === "pause";
    const scene: Scene =
      this.mode === "loading" && !game ? "build" : menu ? "menu" : game?.vendorChoice && this.mode === "play" ? "shop" : "game";
    this.director.sync(this.sound.context, this.sound.enabled && this.settings.music, game, scene);
  }

  private levelForNewRuns(): Level | undefined {
    return this.settings.level === "normal" ? undefined : this.settings.level;
  }

  private dailyLabel(): string {
    return this.route.kind === "gallery" ? dailyLabel(this.gallery, this.route.slug, this.route.run, this.dailyTry) : "";
  }

  private buildStatus(text: string, tone = "dim"): void {
    const el = document.getElementById("build-status");
    if (!el) return;
    el.className = tone;
    el.textContent = text;
  }

  private compareRoutes: { then: PlayRoute; now: PlayRoute } | null = null;

  private async showCompare(owner: string, repo: string, a: string, b: string, seq: number): Promise<void> {
    const pair = await this.builder.pair(owner, repo, a, b, () => seq === this.navSeq);
    if (!pair) return;
    this.mode = "compare";
    this.route = { kind: "title" };
    this.compareRoutes = {
      then: { kind: "github", owner, repo, sha: a, run: freshRun() },
      now: { kind: "github", owner, repo, sha: b, run: freshRun() },
    };
    document.body.classList.add("titling");
    this.showScreen(
      compareScreen(`${owner}/${repo}`, compareSpecs(...pair), {
        playThen: () => this.compareRoutes && this.navigate(this.compareRoutes.then),
        playNow: () => this.compareRoutes && this.navigate(this.compareRoutes.now),
        menu: () => this.navigate({ kind: "title" }),
      }),
      true,
    );
  }

  /** Help, the bestiary and the character sheet: read, then esc back to where you were. */
  private overlay(make: (close: () => void) => HTMLElement): void {
    this.returnMode = this.mode === "help" ? this.returnMode : this.mode;
    this.mode = "help";
    this.showScreen(make(() => this.closeOverlay()));
  }

  private openHelp(): void {
    this.overlay(helpScreen);
  }

  private openPause(): void {
    this.returnMode = this.game?.outcome === "playing" ? "play" : "end";
    this.mode = "pause";
    this.scheduleSave(true);
    this.showScreen(
      pauseScreen({
        copy: () => {
          const code = this.code();
          if (code) void copyText(code);
        },
        resume: () => this.closeOverlay(),
        sheet: () => this.openSheet(),
        restart: () => this.restart(),
        settings: () => this.openSettings(),
        menu: () => this.navigate({ kind: "title" }),
      }, this.code(), this.game ? `${this.game.spec.repo.name} @${this.game.spec.repo.head.slice(0, 7)}, turn ${this.game.player.turns}` : ""),
    );
  }

  private openSheet(): void {
    const game = this.game;
    if (game && (this.mode === "play" || this.mode === "pause" || this.mode === "help")) this.overlay((close) => sheetScreen(game, close));
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
    if (!this.recorded) {
      this.recorded = true;
      recordFinished(game, this.saveKey(), this.route.kind !== "title" && !!this.route.watch);
    }
    this.mode = "end";
    this.stopAuto();
    const level = this.route.kind !== "title" && this.route.level && !this.dailyMod ? this.route.level : "";
    const share = resultText(game, shareLink(location.href), [this.dailyLabel(), level].filter(Boolean).join(" "), this.code());
    this.showScreen(
      endScreen(game, share, this.copied, {
        again: () => this.again(),
        copy: () => this.copyResult(share),
        save: () => this.game && saveLog(this.game),
        replay: () => this.copyReplay(),
        race: () => this.copyReplay(true),
        gif: () => this.exportGif(),
        cast: () => this.game && saveCast(this.game),
        menu: () => this.navigate({ kind: "title" }),
        more: () => {
          this.endMore = !this.endMore;
          this.showEnd();
        },
      }, this.route.kind !== "title" && !!this.route.watch, this.endMore),
    );
  }

  private restart(): void {
    dropSave(this.saveKey());
    if (this.route.kind === "title") return;
    this.navigate({ ...playRoute(this.route), run: freshRun() });
  }

  private again(): void {
    if (!this.game || this.route.kind === "title") return;
    // After watching someone's run, "again" means: your turn, same dungeon, same rolls.
    if (this.route.watch) return this.navigate(playRoute(this.route));
    this.restart();
  }

  private copyReplay(race = false): void {
    if (!this.game || this.route.kind === "title") return;
    void copyText(runLink(this.game, this.route, race)).then((ok) => {
      if (!ok) return;
      this.log.push(race ? "Race link copied. Whoever opens it plays against your run." : "Replay link copied.", "good");
      this.log.render();
    });
  }

  private copyResult(text: string): void {
    void copyText(text).then((ok) => {
      this.copied = ok;
      if (ok && this.mode === "end") this.showEnd();
    });
  }

  private exportGif(): void {
    if (!this.game) return;
    this.log.push("Drawing the GIF...", "info");
    this.log.render();
    void saveGif(this.game);
  }

  private begin(spec: DungeonSpec, run: number, resume?: string, watching = false): void {
    window.clearTimeout(this.endTimer);
    this.title.error = null;
    this.copied = false;
    this.endMore = false;
    this.stopAuto();
    this.fx.clear();
    this.log.clear();
    const daily = this.route.kind === "gallery" ? dailyOf(this.gallery, this.route.slug, run) : null;
    // The twist comes from the run number alone, so a replay of an old daily
    // keeps it even after the gallery changes.
    const mod = this.route.kind === "gallery" ? dailyMod(run) : null;
    // Dailies are always normal, so everyone's result means the same thing.
    const level = !mod && this.route.kind !== "title" ? this.route.level : undefined;
    const mods: ModId[] = [...(mod ? [mod] : []), ...(level ? [level] : [])];
    this.dailyMod = mod;
    this.director.reset();
    this.recorded = false;
    const resumed = resume ? Game.replay(spec, run, resume, mods) : null;
    this.game = resumed ?? new Game(spec, { run, mods });
    this.dailyTry = !daily ? 0 : watching ? 1 : resumed ? Math.max(1, dailyStarts(daily.label)) : startDaily(daily.label);
    this.race = watching ? null : this.findRace(spec, run, mods);
    document.body.classList.remove("titling");
    this.renderer.snapCamera();
    document.title = `${spec.repo.name} | HEADCRAWL`;
    this.mode = "play";
    this.showScreen(null);
    this.handleEvents(this.game.drain());
    this.floorCard();
    if (resumed) this.log.push(`Picked up where you left off, turn ${resumed.player.turns}. Esc then n starts over.`, "good");
    if (this.route.kind !== "title" && (this.route.watch || this.route.race) && this.route.v !== RULES) {
      this.log.push("That link was recorded on an older version of the game. It may not play out the same.", "bad");
    }
    if (this.race) this.log.push(`Racing ${this.race.whose}. Their @ is the faint violet one.`, "lore");
    this.refreshUi();
  }

  /** A friend's race link wins over your own best; a fresh dungeon has neither. */
  private findRace(spec: DungeonSpec, run: number, mods: ModId[]): { track: Track; whose: string } | null {
    if (this.route.kind === "title") return null;
    const shared = this.route.race ? decodeSpec(this.route.race) : null;
    const log = shared ?? ghostFor(this.saveKey(), spec.repo.head)?.log ?? null;
    const track = log ? trackOf(spec, run, mods, log) : null;
    return track ? { track, whose: shared ? "a friend's run" : "your best run" } : null;
  }

  private refreshUi(): void {
    this.touch();
    if (!this.game) return;
    if (this.mode === "play") syncChoice($("banner"), this.game, (a) => this.step(a));
    if (this.mode !== "watch") for (const tip of this.hints.check(this.game)) this.log.push(tip, "lore");
    renderHud($("hud"), this.game, undefined, () => this.openSheet());
    renderPanel($("panel"), this.game);
    this.syncMusic();
    this.log.render();
  }

  private command(c: Command): void {
    if (this.mode === "title") return;
    const pick = this.mode === "play" && this.game ? choiceAction(this.game, c) : undefined;
    if (pick) {
      this.stopAuto();
      this.step(pick);
      return;
    }
    // Esc during a level up still pauses; the other cards treat it as walking away.
    if (pick === null && !this.game?.perkChoice) return;
    if (c.kind === "help") return this.openHelp();
    if (c.kind === "sheet") return this.openSheet();
    if (c.kind === "menu") return this.mode === "play" ? this.openPause() : this.closeOverlay();
    if (c.kind === "panel") {
      $("panel").classList.toggle("open");
      return;
    }
    if (c.kind === "sound") {
      const on = this.sound.toggle();
      this.settings = { ...this.settings, sound: on };
      saveSettings(this.settings);
      this.syncMusic();
      this.log.push(on ? "Sound on. m turns it off." : "Sound off.", "info");
      this.log.render();
      return;
    }
    if (this.mode !== "play" || !this.game) return;
    this.stopAuto();
    if (this.game.perkChoice) return;
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
        this.hints.learned("explore");
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

  /** Quiet is for the attract demo: effects only, no sound, log or cards. */
  private handleEvents(events: GameEvent[], game: Game = this.game!, quiet = false): void {
    const now = performance.now();
    for (const e of events) {
      if (e.t === "descend" || e.t === "loop") this.renderer.snapCamera();
      if (quiet && e.t === "intro") continue;
      eventFx(e, this.fx, game, now, quiet);
      if (quiet) continue;
      this.sound.play(e);
      if (e.t === "msg" && !e.quiet) this.log.push(e.text, e.tone);
      else if (e.t === "hit" && e.onPlayer) this.director.duck();
      else if (e.t === "taunt") this.log.push(`${e.name}: "${e.text}"`, "boss");
      else if (e.t === "intro") {
        this.log.push(`${e.name}, ${e.title}: "${e.text}"`, "boss");
        replace($("banner"), bannerCard(e.final ? "the last boss" : "boss", e.name, "boss", `${e.title}. ${e.where}`, e.text));
      }
      if (e.t === "descend") this.floorCard();
    }
  }

  private floorCard(): void {
    replace($("banner"), floorBanner(this.game!, this.dailyMod ? MODS[this.dailyMod] : null));
  }

  private onKey(e: KeyboardEvent): void {
    this.sound.wake();
    this.syncMusic();
    if (this.mode === "settings") return this.settingsMenu.key(e);
    const typing = e.target instanceof HTMLInputElement;
    if (e.key === "," && !typing && (this.mode === "title" || this.mode === "play" || this.mode === "pause")) {
      e.preventDefault();
      return this.openSettings();
    }
    if (this.mode === "title") return this.title.key(e);
    if (this.mode === "watch") return this.watcher.key(e);
    if (this.mode === "compare") {
      if (e.target instanceof HTMLInputElement || !this.compareRoutes) return;
      if (e.key === "1") this.navigate(this.compareRoutes.then);
      else if (e.key === "2") this.navigate(this.compareRoutes.now);
      else if (e.key === "Escape" || e.key === "m" || e.key === "M") this.navigate({ kind: "title" });
      return;
    }
    if (this.mode === "dying" || this.mode === "loading") return;
    if (this.mode === "end") {
      if (e.key === "r" || e.key === "R") this.again();
      else if (e.key === "c" || e.key === "C") this.copyResult(resultText(this.game!, shareLink(location.href), this.dailyLabel(), this.code()));
      else if (e.key === "s" || e.key === "S") saveLog(this.game!);
      else if (e.key === "w" || e.key === "W") this.copyReplay();
      else if (e.key === "g" || e.key === "G") this.copyReplay(true);
      else if (e.key === "v" || e.key === "V") this.exportGif();
      else if (e.key === "a" || e.key === "A") saveCast(this.game!);
      else if (e.key === "Tab") {
        e.preventDefault();
        this.endMore = !this.endMore;
        this.showEnd();
      }
      else if (e.key === "Escape") this.navigate({ kind: "title" });
      return;
    }
    if (this.mode === "pause" && (e.key === "m" || e.key === "M")) {
      this.navigate({ kind: "title" });
      return;
    }
    if (this.mode === "pause" && e.key === "@") return this.openSheet();
    if (this.mode === "pause" && (e.key === "c" || e.key === "C")) {
      const code = this.code();
      if (code) void copyText(code);
      return;
    }
    if (this.mode === "pause" && (e.key === "n" || e.key === "N" || e.key === "r" || e.key === "R")) {
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
        {
          floor: this.game.floor,
          player: this.game.player,
          sight: this.game.sight,
          dim,
          threat: this.game.threatened(),
          ghost: this.race ? ghostAt(this.race.track, this.game.player.turns, this.game.floor.index) : null,
        },
        this.fx,
        now,
      );
    } else if (this.attract.game) {
      const demo = this.attract.game;
      this.renderer.render(
        { floor: demo.floor, player: demo.player, sight: PLAYER.sight, dim: 0.32, threat: demo.threatened() },
        this.fx,
        now,
        // Keep the demo off to the right of the menu column on wide screens.
        [demo.player.x - (window.innerWidth > 900 ? this.renderer.viewCols * 0.22 : 0), demo.player.y],
      );
    }
  }
}
