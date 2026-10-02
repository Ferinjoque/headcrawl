import fc from "fast-check";
import type { DungeonSpec, Enemy, Floor, Room } from "../src/spec";

const SHA = "0123456789abcdef0123456789abcdef01234567";

let counter = 0;
const id = (p: string) => `${p}${counter++}`;

export function enemy(over: Partial<Enemy> = {}): Enemy {
  return {
    id: id("e"),
    name: "parse_args",
    signature: "parse_args(argv)",
    archetype: "bug",
    hp: 10,
    damage: 2,
    speed: 100,
    xp: 5,
    line: 1,
    ccn: 3,
    nesting: 1,
    params: 1,
    nloc: 10,
    ...over,
  };
}

export function room(over: Partial<Room> = {}): Room {
  const rid = over.id ?? id("r");
  return {
    id: rid,
    path: `src/${rid}.py`,
    name: `${rid}.py`,
    language: "python",
    wing: "w0",
    kind: "hall",
    loc: 50,
    size: 2,
    functions: 1,
    churn: 1,
    heat: 0.5,
    enemies: [],
    loot: [],
    ...over,
  };
}

export function floor(rooms: Room[], edges: [number, number][], index = 0, final = true): Floor {
  return {
    id: `f${index}`,
    index,
    name: "src",
    path: "src",
    wings: [{ id: rooms[0]?.wing ?? "w0", path: ".", name: "src" }],
    rooms: rooms as Floor["rooms"],
    edges: edges.map(([a, b]) => ({ a: rooms[a].id, b: rooms[b].id, kind: "import", weight: 1 })),
    entry: rooms[0].id,
    lair: rooms[rooms.length - 1].id,
    boss: {
      id: id("b"),
      name: "main",
      title: "the Restless",
      signature: "main()",
      line: 1,
      hp: 40,
      damage: 4,
      speed: 100,
      xp: 50,
      ccn: 9,
      churn: 12,
      taunts: ["hi"],
      final,
    },
  };
}

export function spec(floors: Floor[]): DungeonSpec {
  return {
    schema_version: 1,
    generator: "test",
    seed: SHA,
    repo: { name: "test/repo", head: SHA, committed_at: 0, commits_scanned: 0, languages: [] },
    floors: floors as DungeonSpec["floors"],
    totals: { files: 1, rooms: 1, functions: 1, enemies: 1, loot: 0, loc: 1, skipped: 0 },
  };
}

/** A random but valid floor: a random spanning tree plus a few extra edges. */
export const floorArb = fc
  .record({
    n: fc.integer({ min: 1, max: 18 }),
    sizes: fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 18, maxLength: 18 }),
    crowd: fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 18, maxLength: 18 }),
    parents: fc.array(fc.nat(), { minLength: 18, maxLength: 18 }),
    extra: fc.array(fc.tuple(fc.nat(17), fc.nat(17)), { maxLength: 10 }),
  })
  .map(({ n, sizes, crowd, parents, extra }) => {
    const rooms = Array.from({ length: n }, (_, i) =>
      room({ size: sizes[i], enemies: Array.from({ length: crowd[i] }, () => enemy()) }),
    );
    const edges: [number, number][] = [];
    for (let i = 1; i < n; i++) edges.push([parents[i] % i, i]);
    for (const [a, b] of extra) if (a < n && b < n && a !== b) edges.push([a, b]);
    return floor(rooms, edges);
  });
