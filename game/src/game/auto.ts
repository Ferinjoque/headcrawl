// Multi-turn helpers for the player: explore, rest, walk to a clicked cell.
// Each call returns the next action, or null when it should stop.

import { findPath } from "../map/astar";
import { vendorAt } from "./extras";
import { walkable } from "../map/grid";
import type { Game } from "./game";
import type { Action } from "./types";

export type AutoMode = { kind: "explore" } | { kind: "rest"; startHp: number } | { kind: "travel"; to: [number, number] };

export function danger(game: Game): boolean {
  const p = game.player;
  return game.floor.monsters.some(
    (m) => game.isVisible(m.x, m.y) && (m.awake || Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) <= 6),
  );
}

function stepTo(game: Game, to: [number, number]): Action | null {
  const p = game.player;
  const grid = game.floor.map.grid;
  if (p.x === to[0] && p.y === to[1]) return null;
  const path = findPath(grid.width, grid.height, [p.x, p.y], to, (x, y) => {
    const i = grid.idx(x, y);
    if (!game.floor.seen[i] && !(x === to[0] && y === to[1])) return Infinity;
    return walkable(grid.get(x, y)) && !vendorAt(game.floor, x, y) ? 1 : Infinity;
  });
  if (!path || path.length < 2) return null;
  const [nx, ny] = path[1];
  if (game.monsterAt(nx, ny)) return null;
  return { type: "move", dx: nx - p.x, dy: ny - p.y };
}

/** Nearest walkable, unexplored-adjacent cell, by path distance. */
function frontier(game: Game): [number, number] | null {
  const { grid } = game.floor.map;
  const { seen } = game.floor;
  const p = game.player;
  const dist = new Int32Array(grid.width * grid.height).fill(-1);
  const queue = [grid.idx(p.x, p.y)];
  dist[queue[0]] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const x = i % grid.width;
    const y = (i - x) / grid.width;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (!grid.inside(nx, ny)) continue;
      const ni = grid.idx(nx, ny);
      if (dist[ni] >= 0) continue;
      if (!seen[ni]) {
        if (walkable(grid.get(nx, ny))) return [x, y];
        continue;
      }
      if (!walkable(grid.get(nx, ny))) continue;
      dist[ni] = dist[i] + 1;
      queue.push(ni);
    }
  }
  return null;
}

export function autoAction(game: Game, mode: AutoMode): Action | null {
  if (game.outcome !== "playing" || game.perkChoice) return null;
  const p = game.player;
  switch (mode.kind) {
    case "rest":
      if (danger(game) || p.hp >= p.maxHp) return null;
      return { type: "wait" };
    case "travel":
      if (danger(game)) return null;
      return stepTo(game, mode.to);
    case "explore": {
      if (danger(game)) return null;
      const items = game.floor.items.filter((i) => game.isVisible(i.x, i.y));
      if (items.length) {
        const near = items.sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)))[0];
        const step = stepTo(game, [near.x, near.y]);
        if (step) return step;
      }
      const f = frontier(game);
      if (!f) return null;
      if (f[0] === p.x && f[1] === p.y) {
        // Standing on the frontier: step into the unknown neighbour.
        const grid = game.floor.map.grid;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const i = grid.idx(p.x + dx, p.y + dy);
          if (!game.floor.seen[i] && walkable(grid.get(p.x + dx, p.y + dy)) && !vendorAt(game.floor, p.x + dx, p.y + dy)) return { type: "move", dx, dy };
        }
        return null;
      }
      return stepTo(game, f);
    }
  }
}
