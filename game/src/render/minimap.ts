// One pixel per map cell, scaled up with CSS. Only what you have seen.

import { Tile } from "../map/grid";
import type { Game } from "../game/game";
import { C, type RGB } from "./palette";

const COLORS: Partial<Record<number, RGB>> = {
  [Tile.Wall]: C.ember,
  [Tile.Floor]: [72, 40, 58],
  [Tile.Corridor]: C.passage,
  [Tile.Door]: C.brick,
  [Tile.StairsDown]: C.gold,
  [Tile.StairsUp]: C.gold,
  [Tile.Shrine]: C.shrine,
};

export function drawMinimap(canvas: HTMLCanvasElement, game: Game): void {
  const { grid, lair } = game.floor.map;
  const { seen } = game.floor;
  // Crop to what you've seen, plus a margin, so a small explored area isn't a dot in a big box.
  let x0 = grid.width;
  let y0 = grid.height;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < seen.length; i++) {
    if (!seen[i]) continue;
    const x = i % grid.width;
    const y = (i - x) / grid.width;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (x1 < x0) [x0, y0, x1, y1] = [0, 0, grid.width - 1, grid.height - 1];
  x0 = Math.max(0, x0 - 3);
  y0 = Math.max(0, y0 - 2);
  x1 = Math.min(grid.width - 1, x1 + 3);
  y1 = Math.min(grid.height - 1, y1 + 2);
  const w = x1 - x0 + 1;
  const hgt = y1 - y0 + 1;
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(w, hgt);
  const put = (x: number, y: number, c: RGB) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return;
    const o = ((y - y0) * w + (x - x0)) * 4;
    img.data[o] = c[0];
    img.data[o + 1] = c[1];
    img.data[o + 2] = c[2];
    img.data[o + 3] = 255;
  };
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = grid.idx(x, y);
      if (!seen[i]) continue;
      const t = grid.tiles[i];
      let c = COLORS[t];
      if (t === Tile.Corridor && grid.way[i] === 1) c = C.current;
      if (t === Tile.Floor && grid.room[i] === lair.index) c = [110, 30, 80];
      if (c) put(x, y, c);
    }
  }
  for (const m of game.floor.monsters) {
    if (m.boss && seen[grid.idx(m.x, m.y)]) put(m.x, m.y, C.boss);
  }
  put(game.player.x, game.player.y, C.player);
  ctx.putImageData(img, 0, 0);
}
