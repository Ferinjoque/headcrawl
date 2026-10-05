// A simple player for tests and the balance report. It fights whatever is
// next to it, drinks or rests when low, then visits rooms it hasn't seen,
// then the boss, then the stairs.

import { findPath } from "../map/astar";
import { npcAt } from "./extras";
import { Tile, walkable } from "../map/grid";
import type { Game } from "./game";
import { score } from "./gear";
import type { PerkId } from "./perks";
import type { Action } from "./types";

export interface BotStyle {
  /**
   * Play the choices like a person would: best perk, worthwhile deals only,
   * rest to full, drink early when surrounded. Off, it takes whatever comes
   * first, which is the floor of what a player can do.
   */
  careful?: boolean;
}

export function botAction(game: Game, style: BotStyle = {}): Action {
  const careful = !!style.careful;
  if (game.perkChoice) return { type: "perk", index: careful ? bestPerk(game.perkChoice) : 0 };
  if (game.vendorChoice) {
    const index = careful ? bestDeal(game) : 0;
    if (index < 0) passedVendor.set(game, game.floor.index);
    return { type: "buy", index };
  }
  if (game.gearChoice?.gear) return { type: "gear", take: score(game.gearChoice.gear) > score(game.player[game.gearChoice.gear.slot]) };
  const p = game.player;
  const grid = game.floor.map.grid;

  // Out of the red first, like anyone would.
  const danger = game.threatened();
  if (danger.has(grid.idx(p.x, p.y))) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (walkable(grid.get(nx, ny)) && !game.monsterAt(nx, ny) && !npcAt(game.floor, nx, ny) && !danger.has(grid.idx(nx, ny))) {
        return { type: "move", dx, dy };
      }
    }
  }

  const adjacent = game.floor.monsters.filter((m) => Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1).length;
  const drinkAt = careful && adjacent >= 2 ? 0.5 : 0.35;
  if (p.hp < p.maxHp * drinkAt && p.potions.length) return { type: "quaff" };
  if (p.hp < p.maxHp * drinkAt && p.scrolls.length) return { type: "read" };

  for (const m of game.floor.monsters) {
    if (Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1) return { type: "move", dx: m.x - p.x, dy: m.y - p.y };
  }
  if (grid.get(p.x, p.y) === Tile.StairsDown) return { type: "descend" };
  const threat = game.floor.monsters.some((m) => m.awake && Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) < 10);
  if (!threat && p.hp < p.maxHp * (careful ? 1 : 0.8)) return { type: "wait" };

  // Shop first: one dependency per floor, always the first offer.
  const v = game.floor.vendor;
  const shopping = v && !v.sold && !threat && passedVendor.get(game) !== game.floor.index;
  if (shopping && Math.abs(v.x - p.x) <= 1 && Math.abs(v.y - p.y) <= 1) return { type: "move", dx: v.x - p.x, dy: v.y - p.y };
  const target: [number, number] | null = shopping ? [v.x, v.y] : pickTarget(game);
  if (!target) return { type: "wait" };
  const path = findPath(grid.width, grid.height, [p.x, p.y], target, (x, y) =>
    walkable(grid.get(x, y)) && (!npcAt(game.floor, x, y) || (x === target[0] && y === target[1])) ? 1 : Infinity,
  );
  if (!path || path.length < 2) return { type: "wait" };
  const [nx, ny] = path[1];
  return { type: "move", dx: nx - p.x, dy: ny - p.y };
}

/** Roughly how much a person would want each tool, best first. */
const PERK_ORDER: PerkId[] = [
  "flag", "refactoring", "monorepo", "breaker", "retry", "debugger", "fuzzing", "rubberduck", "pairing",
  "caffeine", "logging", "stash", "lazy", "static", "coverage", "linter", "typechecker", "ci", "di", "gc", "owners",
];

function bestPerk(offer: readonly PerkId[]): number {
  const rank = (id: PerkId) => {
    const i = PERK_ORDER.indexOf(id);
    return i < 0 ? PERK_ORDER.length : i;
  };
  let best = 0;
  offer.forEach((id, i) => {
    if (rank(id) < rank(offer[best])) best = i;
  });
  return best;
}

/** The deal worth its cost right now, or -1 to walk away. */
function bestDeal(game: Game): number {
  const p = game.player;
  const value = (id: string): number => {
    switch (id) {
      case "stable":
      case "abandoned":
        return 3;
      case "sdk":
        return (p.weapon?.bonus ?? 0) < 3 ? 3 : 0;
      case "types":
        return 2;
      case "fork":
      case "peer":
        return 2;
      case "framework":
        return p.maxHp > 60 ? 2 : 0;
      case "polyfill":
        return p.hp < p.maxHp * 0.5 ? 2 : 0;
      case "tiny":
        return p.potions.length ? -1 : 1;
      default:
        return 0;
    }
  };
  let best = -1;
  let top = 0;
  (game.vendorChoice ?? []).forEach((o, i) => {
    const v = value(o.deal.id);
    if (v > top) {
      top = v;
      best = i;
    }
  });
  return best;
}

/** The floor where a careful bot already walked away from the vendor. */
const passedVendor = new WeakMap<Game, number>();

/** The room each bot is walking to. */
const heading = new WeakMap<Game, { floor: number; room: number }>();

function pickTarget(game: Game): [number, number] | null {
  const p = game.player;
  const { map } = game.floor;
  const near = (a: [number, number]) => Math.abs(a[0] - p.x) + Math.abs(a[1] - p.y);
  const awake = game.floor.monsters.filter((m) => m.awake && !m.boss).map((m) => [m.x, m.y] as [number, number]);
  if (awake.length) return awake.sort((a, b) => near(a) - near(b))[0];
  if (game.floor.items.length) {
    const items = game.floor.items
      .filter((i) => !game.declined.has(i.id) && game.floor.seen[map.grid.idx(i.x, i.y)])
      .map((i) => [i.x, i.y] as [number, number]);
    if (items.length) return items.sort((a, b) => near(a) - near(b))[0];
  }
  // Nearest unseen room, and it sticks with it until it has seen it: picking
  // the nearest again every step flips between two rooms and paces.
  const isUnseen = (r: (typeof map.rooms)[number]) => r !== map.lair && !game.floor.seen[map.grid.idx(r.cx, r.cy)];
  let goal = heading.get(game);
  if (!goal || goal.floor !== game.floor.index || !isUnseen(map.rooms[goal.room])) {
    const next = map.rooms.filter(isUnseen).sort((a, b) => near([a.cx, a.cy]) - near([b.cx, b.cy]) || a.index - b.index)[0];
    goal = next ? { floor: game.floor.index, room: next.index } : undefined;
    if (goal) heading.set(game, goal);
  }
  if (goal) return [map.rooms[goal.room].cx, map.rooms[goal.room].cy];
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

export function playOut(game: Game, maxTurns = 20000, style: BotStyle = {}): BotResult {
  let idle = 0;
  while (game.outcome === "playing" && game.player.turns < maxTurns) {
    const took = game.act(botAction(game, style));
    game.drain();
    idle = took ? 0 : idle + 1;
    if (idle > 5) game.act({ type: "wait" });
  }
  const p = game.player;
  return { outcome: game.outcome, floor: game.floor.index, turns: p.turns, level: p.level, kills: p.kills };
}
