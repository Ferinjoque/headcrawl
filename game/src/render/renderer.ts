// Draws a floor as glowing text.
//
// Every glyph goes onto an offscreen "light" layer. That layer is blurred at
// low resolution and added back on top of itself, which is what makes the
// letters bloom. Unknown space and solid rock are filled with dim letters from
// the floor's own identifiers, and the player's light washes over them.

import { Tile } from "../map/grid";
import type { FloorState } from "../game/world";
import type { Item, Monster } from "../game/types";
import type { Effects } from "./effects";
import { ARCHETYPE, C, LANGUAGE, mix, rgba, scale, type RGB } from "./palette";

export interface Scene {
  floor: FloorState;
  player: { x: number; y: number } | null;
  sight: number;
  /** Show the whole map as if explored (title screen). */
  revealAll?: boolean;
  /** Extra darkening for when a menu sits on top, 0..1. */
  dim?: number;
  /** Cell indexes a monster will hit next turn. */
  threat?: Set<number>;
  /** Where the run you are racing stands right now. */
  ghost?: [number, number] | null;
}

export const FONT = "VT323";

const ITEM_GLYPH: Record<Item["kind"], [string, RGB]> = {
  potion: ["!", C.hp],
  blade: ["/", C.steel],
  scroll: ["?", C.gold],
  curse: ["%", C.violet],
  coffee: ["c", C.coffee],
};

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private light = document.createElement("canvas");
  private lctx: CanvasRenderingContext2D;
  private bloomA = document.createElement("canvas");
  private bloomB = document.createElement("canvas");
  private canFilter: boolean;
  cellW = 12;
  cellH = 20;
  fontPx = 22;
  private dpr = 1;
  private camX = 0;
  private camY = 0;
  private camReady = false;
  reduced = false;
  /** From settings: text size multiplier and how bright the rock letters are. */
  textScale = 1;
  /** True while the camera is still easing toward its target. */
  settling = false;
  rockBase = 0.2;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.lctx = this.light.getContext("2d")!;
    this.canFilter = "filter" in this.lctx;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(rect.width * this.dpr));
    const h = Math.max(1, Math.round(rect.height * this.dpr));
    for (const c of [this.canvas, this.light]) {
      c.width = w;
      c.height = h;
    }
    this.bloomA.width = Math.ceil(w / 4);
    this.bloomA.height = Math.ceil(h / 4);
    this.bloomB.width = Math.ceil(w / 2);
    this.bloomB.height = Math.ceil(h / 2);
    const byWidth = rect.width / (64 * 0.62);
    const byHeight = rect.height / (30 * 0.92);
    this.fontPx = Math.round(Math.max(15, Math.min(34, byWidth, byHeight)) * this.textScale * this.dpr);
    this.cellW = Math.round(this.fontPx * 0.62);
    this.cellH = Math.round(this.fontPx * 0.92);
  }

  /** Map cell under a CSS pixel position, given the last frame's camera. */
  cellAt(clientX: number, clientY: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * this.dpr;
    const py = (clientY - rect.top) * this.dpr;
    const ox = this.canvas.width / 2 - this.camX * this.cellW;
    const oy = this.canvas.height / 2 - this.camY * this.cellH;
    return [Math.floor((px - ox) / this.cellW), Math.floor((py - oy) / this.cellH)];
  }

  /** How many map columns fit on screen. */
  get viewCols(): number {
    return this.canvas.width / this.cellW;
  }

  snapCamera(): void {
    this.camReady = false;
  }

  private updateCamera(scene: Scene, target: [number, number]): void {
    const { grid } = scene.floor.map;
    const viewCols = this.canvas.width / this.cellW;
    const viewRows = this.canvas.height / this.cellH;
    // Small maps stay centred. Big maps follow the target, clamped to the edges.
    const clampAxis = (want: number, size: number, view: number) =>
      size <= view - 2 ? size / 2 : Math.max(view / 2 - 1, Math.min(size - view / 2 + 1, want));
    const tx = clampAxis(target[0] + 0.5, grid.width, viewCols);
    const ty = clampAxis(target[1] + 0.5, grid.height, viewRows);
    if (!this.camReady || this.reduced) {
      this.camX = tx;
      this.camY = ty;
      this.camReady = true;
    } else {
      this.camX += (tx - this.camX) * 0.25;
      this.camY += (ty - this.camY) * 0.25;
      this.settling = Math.abs(tx - this.camX) > 0.02 || Math.abs(ty - this.camY) > 0.02;
    }
  }

  render(scene: Scene, fx: Effects, now: number, focus?: [number, number]): void {
    const { ctx, lctx, canvas } = this;
    const target = focus ?? (scene.player ? [scene.player.x, scene.player.y] : [0, 0]);
    this.updateCamera(scene, target as [number, number]);

    let shakeX = 0;
    let shakeY = 0;
    if (fx.shakePower > 0 && now < fx.shakeUntil) {
      const k = (fx.shakeUntil - now) / 260;
      shakeX = Math.sin(now * 0.09) * fx.shakePower * k * this.dpr;
      shakeY = Math.cos(now * 0.13) * fx.shakePower * k * this.dpr;
    }
    const ox = Math.round(canvas.width / 2 - this.camX * this.cellW + shakeX);
    const oy = Math.round(canvas.height / 2 - this.camY * this.cellH + shakeY);

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(C.ink);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    lctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const c of [ctx, lctx]) {
      c.font = `${this.fontPx}px ${FONT}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
    }

    this.drawCells(scene, ox, oy, now);
    this.drawThreat(scene, ox, oy, now);
    this.drawThings(scene, ox, oy, now);
    this.drawEffects(fx, ox, oy, now);
    this.composite(scene.dim ?? 0);
  }

  private lightAt(scene: Scene, x: number, y: number): number {
    if (!scene.player) return 0.85;
    const d = Math.hypot(x - scene.player.x, (y - scene.player.y) * 1.15);
    return Math.max(0.38, 1 - (d / scene.sight) ** 1.6 * 0.62);
  }

  // Rock carries no information, so the torch only warms it a little. It
  // used to glow brighter next to you than the map you had explored.
  private glowAt(scene: Scene, x: number, y: number): number {
    if (!scene.player) return 0.05;
    const d = Math.hypot(x - scene.player.x, (y - scene.player.y) * 1.15);
    const r = scene.sight * 1.25;
    return d >= r ? 0 : 0.07 * (1 - d / r) ** 1.7;
  }

  private rockChar(scene: Scene, x: number, y: number): string {
    const { map } = scene.floor;
    const text = map.rockText;
    // Some cells are blank so the letters read as scattered words, not a wall of text.
    const h = Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 0;
    if (h % 100 < 34) return " ";
    return text[(x + map.rowShift[y]) % text.length];
  }

  private drawCells(scene: Scene, ox: number, oy: number, now: number): void {
    const { ctx, lctx, cellW, cellH } = this;
    const { map, seen, visible } = scene.floor;
    const { grid } = map;
    const x0 = Math.max(0, Math.floor(-ox / cellW) - 1);
    const y0 = Math.max(0, Math.floor(-oy / cellH) - 1);
    const x1 = Math.min(grid.width - 1, Math.ceil((this.canvas.width - ox) / cellW) + 1);
    const y1 = Math.min(grid.height - 1, Math.ceil((this.canvas.height - oy) / cellH) + 1);
    const wave = this.reduced ? 0 : Math.floor(now / 380);
    const pulse = this.reduced ? 1 : 0.82 + 0.18 * Math.sin(now / 420);

    // Rock and unknown space beyond the map edges too, so the screen never ends in a hard edge.
    const vx0 = Math.floor(-ox / cellW) - 1;
    const vy0 = Math.floor(-oy / cellH) - 1;
    const vx1 = Math.ceil((this.canvas.width - ox) / cellW) + 1;
    const vy1 = Math.ceil((this.canvas.height - oy) / cellH) + 1;
    for (let y = vy0; y <= vy1; y++) {
      for (let x = vx0; x <= vx1; x++) {
        const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
        const i = inside ? grid.idx(x, y) : -1;
        const known = inside && (scene.revealAll || seen[i] === 1);
        if (inside && known && grid.tiles[i] !== Tile.Rock) continue;
        // A clear ring around the player so the @ never reads as part of a word.
        const p = scene.player;
        if (p && Math.abs(x - p.x) <= 1 && Math.abs(y - p.y) <= 1) continue;
        const ch = this.rockChar(scene, ((x % 997) + 997) % 997, ((y % grid.height) + grid.height) % grid.height);
        if (ch === " ") continue;
        const a = this.rockBase + this.glowAt(scene, x, y) * (this.rockBase / 0.2);
        // Straight onto the base layer: no bloom for rock.
        ctx.fillStyle = rgba(C.rock, a);
        ctx.fillText(ch, ox + x * cellW + cellW / 2, oy + y * cellH + cellH / 2);
      }
    }

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = grid.idx(x, y);
        const tile = grid.tiles[i];
        if (tile === Tile.Rock) continue;
        const vis = scene.revealAll || visible[i] === 1;
        if (!vis && !seen[i]) continue;
        const light = vis ? this.lightAt(scene, x, y) : 0.34;
        const px = ox + x * cellW;
        const py = oy + y * cellH;
        const ri = grid.room[i];
        const room = ri >= 0 ? map.rooms[ri] : null;
        let ch = "";
        let col: RGB = C.dim;
        let bg: RGB | null = null;
        let bgA = 0;
        switch (tile) {
          case Tile.Wall: {
            const r = room!;
            const horizontal = y === r.y || y === r.y + r.h - 1;
            ch = horizontal ? ((x - r.x) % 2 === 0 ? "[" : "]") : x === r.x ? "[" : "]";
            col = room && room === map.lair ? mix(C.brick, C.boss, 0.45) : C.brick;
            break;
          }
          case Tile.Floor: {
            ch = ".";
            col = C.floor;
            if (room === map.lair) col = mix(C.floor, C.boss, 0.6);
            else if (room && room.spec.kind === "shrine") col = C.shrine;
            if (room) {
              bg = LANGUAGE[room.spec.language] ?? C.dim;
              bgA = 0.05 + room.spec.heat * 0.07;
            }
            break;
          }
          case Tile.Corridor:
            if (grid.way[i] === 3) {
              // An import cycle: the current runs in a circle.
              ch = (x + y + wave) % 2 === 0 ? "o" : "~";
              col = C.violet;
              bg = C.violet;
              bgA = 0.12;
            } else if (grid.way[i] === 1) {
              ch = (x + y + wave) % 3 === 0 ? "-" : "~";
              col = C.current;
              bg = C.currentDeep;
              bgA = 0.55;
            } else {
              ch = "#";
              col = C.passage;
            }
            break;
          case Tile.Door:
            ch = "+";
            col = C.brick;
            break;
          case Tile.StairsDown:
            ch = ">";
            col = C.gold;
            bg = C.gold;
            bgA = 0.18 * pulse;
            break;
          case Tile.StairsUp:
            ch = "<";
            col = scale(C.gold, 0.7);
            break;
          case Tile.Shrine:
            ch = "*";
            col = scene.floor.shrinesUsed.has(ri) ? scale(C.shrine, 0.4) : C.shrine;
            bg = C.shrine;
            bgA = scene.floor.shrinesUsed.has(ri) ? 0 : 0.16 * pulse;
            break;
        }
        if (bg && bgA > 0) {
          ctx.fillStyle = rgba(bg, bgA * light);
          ctx.fillRect(px, py, cellW, cellH);
        }
        if (ch) {
          lctx.fillStyle = rgba(col, light);
          lctx.fillText(ch, px + cellW / 2, py + cellH / 2);
        }
      }
    }
  }

  private drawThreat(scene: Scene, ox: number, oy: number, now: number): void {
    if (!scene.threat?.size) return;
    const { ctx, cellW, cellH } = this;
    const width = scene.floor.map.grid.width;
    const pulse = this.reduced ? 0.4 : 0.3 + 0.15 * Math.sin(now / 140);
    ctx.fillStyle = rgba(C.danger, pulse);
    for (const i of scene.threat) {
      const x = i % width;
      const y = (i - x) / width;
      ctx.fillRect(ox + x * cellW + 1, oy + y * cellH + 1, cellW - 2, cellH - 2);
    }
  }

  private drawThings(scene: Scene, ox: number, oy: number, now: number): void {
    const { lctx, ctx, cellW, cellH } = this;
    const { floor } = scene;
    const show = (x: number, y: number) =>
      scene.revealAll || floor.visible[floor.map.grid.idx(x, y)] === 1;
    for (const item of floor.items) {
      if (!show(item.x, item.y)) continue;
      const [ch, col] = ITEM_GLYPH[item.kind];
      lctx.fillStyle = rgba(col, this.lightAt(scene, item.x, item.y) + 0.15);
      lctx.fillText(ch, ox + item.x * cellW + cellW / 2, oy + item.y * cellH + cellH / 2);
    }
    const v = floor.vendor;
    if (v && show(v.x, v.y)) {
      const px = ox + v.x * cellW;
      const py = oy + v.y * cellH;
      ctx.fillStyle = rgba(C.gold, v.sold ? 0.05 : 0.16);
      ctx.fillRect(px, py, cellW, cellH);
      lctx.fillStyle = rgba(C.gold, v.sold ? 0.4 : this.lightAt(scene, v.x, v.y) + 0.15);
      lctx.fillText("$", px + cellW / 2, py + cellH / 2);
    }
    for (const m of floor.monsters) {
      if (!show(m.x, m.y)) continue;
      this.drawMonster(scene, m, ox, oy, now);
    }
    if (scene.ghost) {
      const [gx, gy] = scene.ghost;
      lctx.fillStyle = rgba(C.violet, 0.5);
      lctx.fillText("@", ox + gx * cellW + cellW / 2, oy + gy * cellH + cellH / 2);
    }
    if (scene.player) {
      const { x, y } = scene.player;
      const px = ox + x * cellW;
      const py = oy + y * cellH;
      ctx.fillStyle = rgba(C.player, 0.22);
      ctx.fillRect(px, py, cellW, cellH);
      lctx.fillStyle = rgba(C.player);
      lctx.font = `bold ${this.fontPx}px ${FONT}`;
      lctx.fillText("@", px + cellW / 2, py + cellH / 2);
      lctx.font = `${this.fontPx}px ${FONT}`;
    }
  }

  private drawMonster(scene: Scene, m: Monster, ox: number, oy: number, now: number): void {
    const { lctx, ctx, cellW, cellH } = this;
    const px = ox + m.x * cellW;
    const py = oy + m.y * cellH;
    const col = ARCHETYPE[m.archetype] ?? C.danger;
    const light = this.lightAt(scene, m.x, m.y);
    if (m.boss) {
      const pulse = this.reduced ? 1 : 0.75 + 0.25 * Math.sin(now / 260);
      ctx.fillStyle = rgba(C.boss, 0.35 * pulse);
      ctx.fillRect(px, py, cellW, cellH);
      lctx.fillStyle = rgba(C.boss, pulse);
      lctx.fillRect(px + 1, py + 1, cellW - 2, cellH - 2);
      lctx.fillStyle = rgba(C.ink);
      lctx.fillText(m.glyph, px + cellW / 2, py + cellH / 2);
      return;
    }
    const fade = m.archetype === "ghost" ? 0.6 : 1;
    lctx.fillStyle = rgba(col, (m.awake ? Math.min(1, light + 0.2) : light * 0.75) * fade);
    lctx.fillText(m.glyph, px + cellW / 2, py + cellH / 2);
    if (m.hp < m.maxHp) {
      const w = Math.max(1, Math.round((cellW - 2) * (m.hp / m.maxHp)));
      lctx.fillStyle = rgba(C.danger, 0.9);
      lctx.fillRect(px + 1, py + cellH - Math.max(2, this.dpr * 2), w, Math.max(1, this.dpr * 1.5));
    }
  }

  private drawEffects(fx: Effects, ox: number, oy: number, now: number): void {
    const { lctx, ctx, cellW, cellH } = this;
    for (const f of fx.flashes) {
      const k = 1 - (now - f.born) / f.life;
      ctx.fillStyle = rgba(f.color, 0.55 * k);
      ctx.fillRect(ox + f.x * cellW, oy + f.y * cellH, cellW, cellH);
    }
    for (const p of fx.particles) {
      const age = now - p.born;
      const t = age / p.life;
      // Fast out, then drifting down a little, like sparks.
      const px = p.x + p.vx * age;
      const py = p.y + p.vy * age + 0.0000012 * age * age;
      lctx.fillStyle = rgba(p.color, (1 - t) ** 1.5);
      lctx.fillText(p.ch, ox + px * cellW, oy + py * cellH);
    }
    lctx.font = `${Math.round(this.fontPx * 0.9)}px ${FONT}`;
    for (const f of fx.floaters) {
      const t = (now - f.born) / f.life;
      const rise = this.reduced ? 0.6 : 0.3 + t * 1.1;
      const a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      lctx.fillStyle = rgba(f.color, a);
      lctx.fillText(f.text, ox + f.x * cellW + cellW / 2, oy + (f.y - rise) * cellH + cellH / 2);
    }
    lctx.font = `${this.fontPx}px ${FONT}`;
  }

  private composite(dim: number): void {
    const { ctx, canvas, light, bloomA, bloomB } = this;
    if (this.canFilter) {
      const a = bloomA.getContext("2d")!;
      a.clearRect(0, 0, bloomA.width, bloomA.height);
      a.filter = "blur(3px)";
      a.drawImage(light, 0, 0, bloomA.width, bloomA.height);
      a.filter = "none";
      const b = bloomB.getContext("2d")!;
      b.clearRect(0, 0, bloomB.width, bloomB.height);
      b.filter = "blur(1.5px)";
      b.drawImage(light, 0, 0, bloomB.width, bloomB.height);
      b.filter = "none";
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.85;
      ctx.drawImage(bloomA, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bloomB, 0, 0, canvas.width, canvas.height);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(light, 0, 0);

    const g = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      Math.min(canvas.width, canvas.height) * 0.35,
      canvas.width / 2,
      canvas.height / 2,
      Math.max(canvas.width, canvas.height) * 0.75,
    );
    g.addColorStop(0, rgba(C.ink, 0));
    g.addColorStop(1, rgba(C.ink, 0.7));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (dim > 0) {
      ctx.fillStyle = rgba(C.ink, dim);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
}
