// How monsters find you: one breadth-first pass from the player per turn,
// shared by every monster, instead of an A* each.

import { walkable, type Grid } from "../map/grid";

const CHASE_RANGE = 30;

const STEPS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

/** No squeezing diagonally between two walls. */
export function canStep(grid: Grid, x: number, y: number, dx: number, dy: number): boolean {
  if (!walkable(grid.get(x + dx, y + dy))) return false;
  return !(dx && dy && !walkable(grid.get(x + dx, y)) && !walkable(grid.get(x, y + dy)));
}

/** Steps from every walkable cell to the player, out to CHASE_RANGE. -1 is out of reach. */
export function chaseMap(grid: Grid, player: { x: number; y: number }): Int16Array {
  const dist = new Int16Array(grid.width * grid.height).fill(-1);
  const start = grid.idx(player.x, player.y);
  dist[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    if (dist[i] >= CHASE_RANGE) continue;
    const x = i % grid.width;
    const y = (i - x) / grid.width;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inside(nx, ny) || !canStep(grid, x, y, dx, dy)) continue;
      const ni = grid.idx(nx, ny);
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[i] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

/** The free neighbouring cell that gets closer to the player, if any. */
export function stepToward(grid: Grid, m: { x: number; y: number }, chase: Int16Array, taken: Uint8Array): [number, number] | null {
  const here = chase[grid.idx(m.x, m.y)];
  if (here === -1) return null;
  let best: [number, number] | null = null;
  let bestDist = here;
  for (const [dx, dy] of STEPS) {
    const nx = m.x + dx;
    const ny = m.y + dy;
    if (!grid.inside(nx, ny) || !canStep(grid, m.x, m.y, dx, dy)) continue;
    const ni = grid.idx(nx, ny);
    const d = chase[ni];
    if (d === -1 || d >= bestDist || taken[ni] || d === 0) continue;
    best = [nx, ny];
    bestDist = d;
  }
  return best;
}
