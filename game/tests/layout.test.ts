import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { findPath } from "../src/map/astar";
import { Tile, walkable } from "../src/map/grid";
import { flood, layoutFloor, roomCells } from "../src/map/layout";
import { floor, floorArb, room } from "./fixtures";

describe("rng", () => {
  it("repeats for the same seed and differs for others", () => {
    const a = new Rng("abc");
    const b = new Rng("abc");
    const c = new Rng("abd");
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
  });

  it("stays in range", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: -50, max: 50 }), fc.integer({ min: 0, max: 50 }), (seed, lo, span) => {
        const r = new Rng(seed);
        for (let i = 0; i < 20; i++) {
          const v = r.int(lo, lo + span);
          expect(v).toBeGreaterThanOrEqual(lo);
          expect(v).toBeLessThanOrEqual(lo + span);
          const f = r.next();
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f).toBeLessThan(1);
        }
      }),
    );
  });

  it("forks are independent of how far the parent ran", () => {
    const a = new Rng("x");
    const b = new Rng("x");
    b.next();
    expect(a.fork(1).next()).toBe(b.fork(1).next());
    expect(() => a.pick([])).toThrow();
    expect(a.shuffle([1, 2, 3]).sort()).toEqual([1, 2, 3]);
  });
});

describe("astar", () => {
  it("goes around walls and reports blocked goals", () => {
    const wall = (x: number, y: number) => (x === 2 && y < 4 ? Infinity : 1);
    const path = findPath(5, 5, [0, 0], [4, 0], wall)!;
    expect(path[0]).toEqual([0, 0]);
    expect(path.at(-1)).toEqual([4, 0]);
    expect(path.some(([x, y]) => x === 2 && y === 4)).toBe(true);
    expect(findPath(5, 5, [0, 0], [4, 0], (x) => (x === 2 ? Infinity : 1))).toBeNull();
  });
});

describe("layout", () => {
  it("connects every room on random floors", () => {
    fc.assert(
      fc.property(floorArb, fc.string({ minLength: 1, maxLength: 8 }), (f, seed) => {
        const map = layoutFloor(f, seed);
        const reach = flood(map.grid, map.start);
        for (const r of map.rooms) {
          expect(reach[map.grid.idx(r.cx, r.cy)]).toBe(1);
          expect(roomCells(map, r).length).toBeGreaterThanOrEqual(r.spec.enemies.length + r.spec.loot.length);
        }
        expect(walkable(map.grid.get(...map.stairsDown))).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it("gives the same grid for the same seed", () => {
    fc.assert(
      fc.property(floorArb, (f) => {
        const a = layoutFloor(f, "seed");
        const b = layoutFloor(f, "seed");
        expect(Array.from(b.grid.tiles)).toEqual(Array.from(a.grid.tiles));
        expect(b.rockText).toBe(a.rockText);
      }),
      { numRuns: 20 },
    );
  });

  it("keeps rooms from overlapping", () => {
    fc.assert(
      fc.property(floorArb, (f) => {
        const map = layoutFloor(f, "o");
        const owner = new Map<number, number>();
        for (const r of map.rooms) {
          for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.w; x++) {
              const i = map.grid.idx(x, y);
              expect(owner.has(i)).toBe(false);
              owner.set(i, r.index);
            }
          }
        }
      }),
      { numRuns: 30 },
    );
  });

  it("marks stairs and shrines", () => {
    const rooms = [room(), room({ kind: "shrine" }), room({ kind: "lair" })];
    const f = { ...floor(rooms, [[0, 1], [1, 2]], 1, true) };
    const map = layoutFloor(f, "s");
    expect(map.grid.get(map.entry.cx, map.entry.cy)).toBe(Tile.StairsUp);
    const shrine = map.byId.get(rooms[1].id)!;
    expect(map.grid.get(shrine.cx, shrine.cy)).toBe(Tile.Shrine);
    expect(map.rockText).toContain("MAIN");
  });
});
