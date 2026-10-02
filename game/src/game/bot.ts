// A simple player for tests and the balance report. It fights whatever is
// next to it, drinks or rests when low, then visits rooms it hasn't seen,
// then the boss, then the stairs.

import { findPath } from "../map/astar";
import { Tile, walkable } from "../map/grid";
import type { Game } from "./game";
import type { Action } from "./types";

export function botAction(game: Game): Action {
  const p = game.player;
  const grid = game.floor.map.grid;

  // Out of the red first, like anyone would.
  const danger = game.threatened();
  if (danger.has(grid.idx(p.x, p.y))) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (walkable(grid.get(nx, ny)) && !game.monsterAt(nx, ny) && !danger.has(grid.idx(nx, ny))) {
        return { type: "move", dx, dy };
      }
    }
  }

  if (p.hp < p.maxHp * 0.35 && p.potions.length) return { type: "quaff" };
  if (p.hp < p.maxHp * 0.35 && p.scrolls.length) return { type: "read" };

  for (const m of game.floor.monsters) {
    if (Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1) return { type: "move", dx: m.x - p.x, dy: m.y - p.y };
  }
  if (grid.get(p.x, p.y) === Tile.StairsDown) return { type: "descend" };
  const threat = game.floor.monsters.some((m) => m.awake && Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) < 10);
  if (!threat && p.hp < p.maxHp * 0.8) return { type: "wait" };

  const target = pickTarget(game);
  if (!target) return { type: "wait" };
  const path = findPath(grid.width, grid.height, [p.x, p.y], target, (x, y) =>
    walkable(grid.get(x, y)) ? 1 : Infinity,
  );
  if (!path || path.length < 2) return { type: "wait" };
  const [nx, ny] = path[1];
  return { type: "move", dx: nx - p.x, dy: ny - p.y };
}

function pickTarget(game: Game): [number, number] | null {
  const p = game.player;
  const { map } = game.floor;
  const near = (a: [number, number]) => Math.abs(a[0] - p.x) + Math.abs(a[1] - p.y);
  const awake = game.floor.monsters.filter((m) => m.awake && !m.boss).map((m) => [m.x, m.y] as [number, number]);
  if (awake.length) return awake.sort((a, b) => near(a) - near(b))[0];
  if (game.floor.items.length) {
    const items = game.floor.items.map((i) => [i.x, i.y] as [number, number]).filter((c) => game.floor.seen[map.grid.idx(c[0], c[1])]);
    if (items.length) return items.sort((a, b) => near(a) - near(b))[0];
  }
  // Fixed order, not nearest: "nearest unseen room" flips back and forth as
  // you walk and the bot ends up pacing between two cells.
  const unseen = map.rooms.find((r) => r !== map.lair && !game.floor.seen[map.grid.idx(r.cx, r.cy)]);
  if (unseen) return [unseen.cx, unseen.cy];
  const rest = game.floor.monsters.find((m) => !m.boss);
  if (rest) return [rest.x, rest.y];
  const boss = game.floor.monsters.find((m) => m.boss);
  if (boss) return [boss.x, boss.y];
  return map.stairsDown;
}

export interface BotResult {
  outcome: Game["outcome"];
  floor: number;
  turns: number;
  level: number;
  kills: number;
}

export function playOut(game: Game, maxTurns = 20000): BotResult {
  let idle = 0;
  while (game.outcome === "playing" && game.player.turns < maxTurns) {
    const took = game.act(botAction(game));
    game.drain();
    idle = took ? 0 : idle + 1;
    if (idle > 5) game.act({ type: "wait" });
  }
  const p = game.player;
  return { outcome: game.outcome, floor: game.floor.index, turns: p.turns, level: p.level, kills: p.kills };
}
