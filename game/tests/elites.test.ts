import { describe, expect, it } from "vitest";
import { ELITE, affixFor, eliteOf, isRemote, lineCells } from "../src/game/elites";
import { Game } from "../src/game/game";
import { rosterFor } from "../src/game/world";
import { weapon } from "../src/game/gear";
import { Tile } from "../src/map/grid";
import { enemy, floor, room, spec } from "./fixtures";

describe("elites", () => {
  it("picks long over deep over hot", () => {
    const hot = room({ heat: 0.9 });
    expect(affixFor(enemy({ nloc: 200, nesting: 9 }), hot)).toBe("god");
    expect(affixFor(enemy({ nloc: 10, nesting: 9 }), hot)).toBe("deep");
    expect(affixFor(enemy({ nloc: 10, nesting: 1 }), hot)).toBe("hot");
    expect(affixFor(enemy({ nloc: 10, nesting: 1 }), room({ heat: 0.1 }))).toBeNull();
  });

  it("gives a room one elite at most, the one with the most branches", () => {
    const crowd = [enemy({ ccn: 3 }), enemy({ ccn: 20, nloc: 300 }), enemy({ ccn: 5, nloc: 300 })];
    expect(eliteOf(room({ enemies: crowd }))?.ccn).toBe(20);
    expect(eliteOf(room({ enemies: crowd.slice(0, 2) }))).toBeNull();
  });

  it("makes the elite tougher and worth more on the floor", () => {
    const crowd = [enemy({ ccn: 3 }), enemy({ ccn: 20, nloc: 300, xp: 10 }), enemy({ ccn: 5 })];
    const game = new Game(spec([floor([room(), room({ enemies: crowd, size: 4 }), room({ kind: "lair" })], [[0, 1], [1, 2]])]));
    const elites = game.floor.monsters.filter((m) => m.affix);
    expect(elites).toHaveLength(1);
    expect(elites[0].affix).toBe("god");
    expect(elites[0].xp).toBe(Math.round(10 * ELITE.xp));
  });

  it("deeply nested elites shrug off damage unless the weapon pierces", () => {
    const crowd = [enemy({ ccn: 3 }), enemy({ ccn: 20, nesting: 9, hp: 999, archetype: "tangle" }), enemy({ ccn: 5 })];
    const game = new Game(spec([floor([room(), room({ enemies: crowd, size: 4 }), room({ kind: "lair" })], [[0, 1], [1, 2]])]), { run: 2 });
    const m = game.floor.monsters.find((x) => x.affix === "deep")!;
    game.floor.monsters = [m];
    m.x = game.player.x + 1;
    m.y = game.player.y;
    game.floor.map.grid.set(m.x, m.y, Tile.Floor);
    game.player.atk = 10;
    game.player.weapon = weapon("w", "go", 0);
    const hit = () => {
      game.drain();
      game.player.hp = game.player.maxHp;
      game.act({ type: "move", dx: 1, dy: 0 });
      return game.drain().find((e) => e.t === "hit" && !e.onPlayer && !e.crit);
    };
    let plain = hit();
    for (let i = 0; i < 10 && !plain; i++) plain = hit();
    expect(plain && plain.t === "hit" && plain.amount).toBeLessThanOrEqual(10 + 1 - ELITE.deepArmor);
  });
});

describe("remote calls", () => {
  it("are small network functions, never tests", () => {
    expect(isRemote(enemy({ name: "fetch_user", archetype: "bug" }))).toBe(true);
    expect(isRemote(enemy({ name: "Client.send", archetype: "imp" }))).toBe(true);
    expect(isRemote(enemy({ name: "test_fetch_user", archetype: "bug" }))).toBe(false);
    expect(isRemote(enemy({ name: "fetch_everything", archetype: "tangle" }))).toBe(false);
    expect(isRemote(enemy({ name: "parse_args", archetype: "bug" }))).toBe(false);
  });

  it("draws a line that stops at walls", () => {
    expect(lineCells({ x: 0, y: 0 }, { x: 3, y: 0 }, () => true)).toEqual([[1, 0], [2, 0], [3, 0]]);
    expect(lineCells({ x: 0, y: 0 }, { x: 3, y: 0 }, (x) => x < 2)).toEqual([[1, 0]]);
  });

  function shooter() {
    const r = room({ enemies: [enemy({ name: "fetch_feed", archetype: "bug", damage: 4, hp: 99 })], size: 5 });
    const game = new Game(spec([floor([room(), r, room({ kind: "lair" })], [[0, 1], [1, 2]])]), { run: 1 });
    const m = game.floor.monsters.find((x) => x.archetype === "remote")!;
    game.floor.monsters = [m];
    const rect = game.floor.map.rooms[1];
    game.player.x = rect.cx - 2;
    game.player.y = rect.cy;
    m.x = rect.cx + 1;
    m.y = rect.cy;
    m.awake = true;
    m.speed = 100;
    m.energy = 0;
    game.drain();
    return { game, m };
  }

  it("aims at you from a distance, then fires down the line", () => {
    const { game, m } = shooter();
    game.act({ type: "wait" });
    expect(m.threat.length).toBeGreaterThan(0);
    expect(game.threatened().has(game.floor.map.grid.idx(game.player.x, game.player.y))).toBe(true);
    const hp = game.player.hp;
    game.act({ type: "wait" });
    expect(game.player.hp).toBeLessThan(hp);
  });

  it("misses if you step off the line", () => {
    const { game } = shooter();
    game.act({ type: "wait" });
    const hp = game.player.hp;
    game.act({ type: "move", dx: 0, dy: -1 });
    expect(game.player.hp).toBe(hp);
  });
});

describe("floor cap", () => {
  it("keeps the most complex functions and passes some XP on", () => {
    const many = Array.from({ length: 12 }, (_, i) => enemy({ ccn: i + 1, xp: 10 }));
    const f = floor([room(), room({ enemies: many }), room({ kind: "lair" })], [[0, 1], [1, 2]]);
    const { keep, xpScale } = rosterFor(f, f.entry, 4);
    expect([...keep].map((e) => e.ccn).sort((a, b) => a - b)).toEqual([9, 10, 11, 12]);
    expect(xpScale).toBeCloseTo(1 + (0.6 * 80) / 40);
    expect(rosterFor(f, f.entry, 50).xpScale).toBe(1);
  });
});
