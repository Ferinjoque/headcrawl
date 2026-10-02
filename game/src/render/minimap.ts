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
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(grid.width, grid.height);
  const put = (x: number, y: number, c: RGB) => {
    const o = (y * grid.width + x) * 4;
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
