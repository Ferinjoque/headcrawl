// The map you have seen, drawn as a grid of lit cells so it belongs to the
// same text world as the big map: walls are blocks, floors are dots like
// the map's ".", and you and the boss are the brightest things on it.

import { Tile } from "../map/grid";
import type { Game } from "../game/game";
import { C, type RGB } from "./palette";

/** Canvas pixels per map cell. CSS scales the result with crisp edges. */
export const CELL = 4;

type Mark = "block" | "dot";

const MARKS: Partial<Record<number, { mark: Mark; color: RGB }>> = {
  [Tile.Wall]: { mark: "block", color: dimmed(C.ember, 0.55) },
  [Tile.Floor]: { mark: "dot", color: [96, 52, 78] },
  [Tile.Corridor]: { mark: "dot", color: C.passage },
  [Tile.Door]: { mark: "block", color: C.brick },
  [Tile.StairsDown]: { mark: "block", color: C.gold },
  [Tile.StairsUp]: { mark: "block", color: C.gold },
  [Tile.Shrine]: { mark: "block", color: C.shrine },
};

function dimmed(c: RGB, k: number): RGB {
  return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
}

function rgb(c: RGB): string {
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What you've seen plus a margin, so a small explored area isn't a dot in a big box. */
export function seenBox(seen: ArrayLike<number | boolean>, width: number, height: number): Box {
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < seen.length; i++) {
    if (!seen[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (x1 < x0) return { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  return { x0: Math.max(0, x0 - 3), y0: Math.max(0, y0 - 2), x1: Math.min(width - 1, x1 + 3), y1: Math.min(height - 1, y1 + 2) };
}

export function drawMinimap(canvas: HTMLCanvasElement, game: Game): void {
  const { grid, lair } = game.floor.map;
  const { seen } = game.floor;
  const box = seenBox(seen, grid.width, grid.height);
  canvas.width = (box.x1 - box.x0 + 1) * CELL;
  canvas.height = (box.y1 - box.y0 + 1) * CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const px = (x: number) => (x - box.x0) * CELL;
  const py = (y: number) => (y - box.y0) * CELL;
  const cell = (x: number, y: number, mark: Mark | "lit", color: RGB) => {
    ctx.fillStyle = rgb(color);
    if (mark === "dot") ctx.fillRect(px(x) + 1, py(y) + 1, 2, 2);
    else if (mark === "block") ctx.fillRect(px(x), py(y), CELL - 1, CELL - 1);
    else ctx.fillRect(px(x) - 1, py(y) - 1, CELL + 1, CELL + 1);
  };

  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = grid.idx(x, y);
      if (!seen[i]) continue;
      const t = grid.tiles[i];
      const m = MARKS[t];
      if (!m) continue;
      let color = m.color;
      if (t === Tile.Corridor && grid.way[i] === 1) color = C.current;
      if (t === Tile.Floor && grid.room[i] === lair.index) color = [150, 40, 108];
      cell(x, y, m.mark, color);
    }
  }
  for (const m of game.floor.monsters) {
    if (m.boss && seen[grid.idx(m.x, m.y)]) cell(m.x, m.y, "lit", C.boss);
  }
  ctx.shadowColor = rgb(C.player);
  ctx.shadowBlur = 6;
  cell(game.player.x, game.player.y, "lit", C.player);
  ctx.shadowBlur = 0;
}
