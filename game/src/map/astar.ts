// A* over a grid with per-cell costs. ROT.Path.AStar has no weights, and the
// corridor digger needs them to steer around rooms and reuse old tunnels.

export type CostFn = (x: number, y: number) => number; // Infinity = blocked

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

class Heap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    const { items, prio } = this;
    let i = items.length;
    items.push(item);
    prio.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (prio[parent] <= prio[i]) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      [prio[i], prio[parent]] = [prio[parent], prio[i]];
      i = parent;
    }
  }

  pop(): number {
    const { items, prio } = this;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastPrio = prio.pop()!;
    if (items.length) {
      items[0] = lastItem;
      prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && prio[l] < prio[m]) m = l;
        if (r < items.length && prio[r] < prio[m]) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        [prio[i], prio[m]] = [prio[m], prio[i]];
        i = m;
      }
    }
    return top;
  }
}

/** Cheapest 4-way path from start to goal, both included. null if blocked. */
export function findPath(
  width: number,
  height: number,
  start: [number, number],
  goal: [number, number],
  cost: CostFn,
): [number, number][] | null {
  const n = width * height;
  const g = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const s = start[1] * width + start[0];
  const t = goal[1] * width + goal[0];
  const h = (i: number) => Math.abs((i % width) - goal[0]) + Math.abs(Math.floor(i / width) - goal[1]);
  const open = new Heap();
  g[s] = 0;
  open.push(s, h(s));
  while (open.size) {
    const cur = open.pop();
    if (cur === t) break;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const step = cost(nx, ny);
      if (!Number.isFinite(step)) continue;
      const ni = ny * width + nx;
      const next = g[cur] + step;
      if (next < g[ni]) {
        g[ni] = next;
        from[ni] = cur;
        open.push(ni, next + h(ni));
      }
    }
  }
  if (!Number.isFinite(g[t])) return null;
  const path: [number, number][] = [];
  for (let i = t; i !== -1; i = from[i]) path.push([i % width, Math.floor(i / width)]);
  return path.reverse();
}
