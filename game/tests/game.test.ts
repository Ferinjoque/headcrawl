import { readFileSync, readdirSync } from "node:fs";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { botAction, playOut } from "../src/game/bot";
import { Game } from "../src/game/game";
import { Tile, walkable } from "../src/map/grid";
import { loadSpec, type DungeonSpec } from "../src/spec";
import { enemy, floor, floorArb, room, spec } from "./fixtures";

const DIR = new URL("../public/dungeons/", import.meta.url);

function gallery(): [string, DungeonSpec][] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => {
      const res = loadSpec(readFileSync(new URL(f, DIR), "utf8"));
      if (!res.ok) throw new Error(`${f}: ${res.error}`);
      return [f, res.spec];
    });
}

function checkInvariants(game: Game): void {
  const p = game.player;
  expect(p.hp).toBeLessThanOrEqual(p.maxHp);
  expect(p.hp).toBeGreaterThanOrEqual(0);
  const grid = game.floor.map.grid;
  expect(walkable(grid.get(p.x, p.y))).toBe(true);
  const spots = new Set<string>();
  for (const m of game.floor.monsters) {
    expect(m.hp).toBeGreaterThan(0);
    expect(walkable(grid.get(m.x, m.y))).toBe(true);
    const key = `${m.x},${m.y}`;
    expect(spots.has(key)).toBe(false);
    expect(m.x === p.x && m.y === p.y).toBe(false);
    spots.add(key);
  }
}

describe("gallery dungeons", () => {
  it("all load", () => {
    expect(gallery().length).toBeGreaterThan(0);
  });

  it("play the same way twice", () => {
    const [, s] = gallery()[0];
    const a = playOut(new Game(s), 400);
    const b = playOut(new Game(s), 400);
    expect(b).toEqual(a);
  });

  it("keep invariants while a bot plays", () => {
    for (const [, s] of gallery()) {
      const game = new Game(s);
      for (let i = 0; i < 600 && game.outcome === "playing"; i++) {
        game.act(botAction(game));
        game.drain();
        checkInvariants(game);
      }
    }
  }, 60_000);
});

describe("rules", () => {
  it("random floors stay consistent under random input", () => {
    fc.assert(
      fc.property(floorArb, fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 200 }), (f, keys) => {
        const game = new Game(spec([f]));
        const moves = [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ];
        for (const k of keys) {
          if (k < 8) game.act({ type: "move", dx: moves[k][0], dy: moves[k][1] });
          else if (k === 8) game.act({ type: "quaff" });
          else game.act({ type: "wait" });
          game.drain();
          checkInvariants(game);
        }
      }),
      { numRuns: 40 },
    );
  });

  it("killing the last boss wins, other bosses open the stairs", () => {
    const rooms = [room(), room({ kind: "lair" })];
    const s = spec([floor(rooms, [[0, 1]], 0, false), floor([room(), room({ kind: "lair" })], [[0, 1]], 1, true)]);
    s.floors[0].boss.hp = 1;
    s.floors[1].boss.hp = 1;
    const game = new Game(s, { run: 1 });
    for (let i = 0; i < 3000 && game.outcome === "playing"; i++) {
      game.player.hp = game.player.maxHp;
      game.act(botAction(game));
    }
    const events = game.drain();
    expect(game.outcome).toBe("won");
    expect(events.some((e) => e.t === "descend")).toBe(true);
    expect(events.some((e) => e.t === "victory")).toBe(true);
    expect(game.player.bosses).toBe(2);
  });

  it("dies to a strong enough monster and records who did it", () => {
    const god = enemy({ name: "god_object", hp: 999, damage: 60, speed: 200 });
    const rooms = [room(), room({ enemies: [god] }), room({ kind: "lair" })];
    const game = new Game(spec([floor(rooms, [[0, 1], [1, 2]])]));
    for (let i = 0; i < 200 && game.outcome === "playing"; i++) game.act(botAction(game));
    expect(game.outcome).toBe("dead");
    expect(game.killer).toBe("god_object");
    expect(game.act({ type: "wait" })).toBe(false);
  });

  it("items do what they say", () => {
    const loot = (kind: "potion" | "blade" | "scroll" | "curse", tag: string) => ({
      id: `l${kind}`,
      kind,
      tag,
      text: "fix later",
      line: 3,
      power: 4,
    });
    const r = room({ loot: [loot("potion", "TODO"), loot("blade", "FIXME"), loot("curse", "XXX"), loot("scroll", "HACK")] });
    const game = new Game(spec([floor([r, room({ kind: "lair" })], [[0, 1]])]));
    const before = { ...game.player };
    for (const item of [...game.floor.items]) {
      game.player.x = item.x - 1;
      game.player.y = item.y;
      game.act({ type: "move", dx: 1, dy: 0 });
    }
    expect(game.player.potions).toHaveLength(1);
    expect(game.player.scrolls).toHaveLength(1);
    expect(game.player.blade).toBeGreaterThan(0);
    expect(game.player.curses).toBe(1);
    expect(game.player.maxHp).toBe(before.maxHp - 5);
    game.player.hp = 1;
    expect(game.act({ type: "quaff" })).toBe(true);
    expect(game.player.hp).toBeGreaterThan(1);
    expect(game.act({ type: "quaff" })).toBe(false);
    expect(game.act({ type: "read" })).toBe(true);
    expect(game.act({ type: "read" })).toBe(false);
    expect(game.act({ type: "descend" })).toBe(false);
  });

  it("shrines heal once", () => {
    const game = new Game(spec([floor([room(), room({ kind: "shrine" }), room({ kind: "lair" })], [[0, 1], [1, 2]])]));
    const shrine = game.floor.map.rooms[1];
    game.player.hp = 5;
    game.player.x = shrine.cx - 1;
    game.player.y = shrine.cy;
    game.floor.monsters = [];
    game.act({ type: "move", dx: 1, dy: 0 });
    expect(game.player.hp).toBe(game.player.maxHp);
    expect(game.floor.map.grid.get(shrine.cx, shrine.cy)).toBe(Tile.Shrine);
    game.player.hp = 5;
    game.act({ type: "move", dx: -1, dy: 0 });
    game.act({ type: "move", dx: 1, dy: 0 });
    expect(game.player.hp).toBe(5);
  });
});

describe("balance report", () => {
  // CI runners with coverage on are several times slower; one run per dungeon
  // still catches a stall there.
  const runs = process.env.CI ? [0] : [0, 1, 2];
  const lines: string[] = [];
  afterAll(() => console.log(lines.join("\n")));

  it.each(gallery())("bot plays %s", (name, s) => {
    for (const run of runs) {
      const r = playOut(new Game(s, { run }));
      lines.push(`${name.padEnd(18)} run ${run}: ${r.outcome.padEnd(7)} floor ${r.floor + 1}/${s.floors.length} lv ${r.level} kills ${r.kills} turns ${r.turns}`);
      expect(r.turns, `${name} run ${run} stalled`).toBeLessThan(20000);
    }
  }, 120_000);
});

describe("edge cases", () => {
  it("a one-file floor puts the boss away from you and still introduces it", () => {
    const only = room({ kind: "lair", size: 3 });
    const f = floor([only], []);
    f.entry = only.id;
    f.lair = only.id;
    const game = new Game(spec([f]));
    const boss = game.floor.monsters.find((m) => m.boss)!;
    expect(Math.max(Math.abs(boss.x - game.player.x), Math.abs(boss.y - game.player.y))).toBeGreaterThan(2);
    expect(game.drain().some((e) => e.t === "intro")).toBe(true);
  });

  it("monsters chase around each other instead of stacking", () => {
    const pack = Array.from({ length: 6 }, () => enemy({ hp: 50, damage: 1, speed: 200 }));
    const rooms = [room(), room({ enemies: pack, size: 4 }), room({ kind: "lair" })];
    const game = new Game(spec([floor(rooms, [[0, 1], [1, 2]])]));
    for (const m of game.floor.monsters) m.awake = true;
    for (let i = 0; i < 40 && game.outcome === "playing"; i++) {
      game.player.hp = game.player.maxHp;
      game.act({ type: "wait" });
      checkInvariants(game);
    }
    const close = game.floor.monsters.filter((m) => !m.boss && Math.max(Math.abs(m.x - game.player.x), Math.abs(m.y - game.player.y)) <= 1);
    expect(close.length).toBeGreaterThan(0);
  });
});
