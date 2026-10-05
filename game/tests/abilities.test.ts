import { describe, expect, it } from "vitest";
import { TUNING } from "../src/game/abilities";
import { Game } from "../src/game/game";
import type { Monster } from "../src/game/types";
import { Tile, walkable } from "../src/map/grid";
import { enemy, floor, room, spec } from "./fixtures";

/** A game with one monster of the given kind standing right next to the player. */
function duel(archetype: Exclude<Monster["archetype"], "boss" | "spawn" | "remote">, over: Partial<Monster> = {}): { game: Game; m: Monster } {
  const rooms = [room({ size: 4 }), room({ enemies: [enemy({ archetype, hp: 60 })], size: 4 }), room({ kind: "lair" })];
  const game = new Game(spec([floor(rooms, [[0, 1], [1, 2]])]), { run: 7 });
  const m = game.floor.monsters.find((x) => !x.boss)!;
  game.floor.monsters = [m];
  const r = game.floor.map.rooms[1];
  game.player.x = r.cx;
  game.player.y = r.cy;
  m.x = r.cx + 1;
  m.y = r.cy;
  m.awake = true;
  Object.assign(m, over);
  game.drain();
  return { game, m };
}

describe("abilities", () => {
  it("walls shrug off part of every hit", () => {
    const { game, m } = duel("wall");
    game.player.atk = 10;
    const before = m.hp;
    for (let i = 0; i < 6; i++) game.act({ type: "move", dx: 1, dy: 0 });
    const hits = game.drain().filter((e) => e.t === "hit" && !e.onPlayer);
    for (const h of hits) if (h.t === "hit" && !h.crit) expect(h.amount).toBeLessThanOrEqual(10 + 4 - TUNING.wallArmor);
    expect(m.hp).toBeLessThan(before);
  });

  it("bugs dodge some hits", () => {
    const { game } = duel("bug", { hp: 999, maxHp: 999 });
    for (let i = 0; i < 80; i++) {
      game.player.hp = game.player.maxHp;
      game.act({ type: "move", dx: 1, dy: 0 });
    }
    expect(game.drain().filter((e) => e.t === "dodge").length).toBeGreaterThan(3);
  });

  it("hydras split once into two smaller ones", () => {
    const { game } = duel("hydra", { hp: 40, maxHp: 40 });
    game.player.atk = 3;
    for (let i = 0; i < 5 && game.floor.monsters.length < 2; i++) game.act({ type: "move", dx: 1, dy: 0 });
    expect(game.floor.monsters).toHaveLength(2);
    const [a, b] = game.floor.monsters;
    expect(a.split && b.split).toBe(true);
    expect(b.name.endsWith("'")).toBe(true);
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });

  it("tangles regrow while you dither", () => {
    const { game, m } = duel("tangle", { hp: 20, maxHp: 60, damage: 1 });
    game.player.x -= 3;
    m.x = game.player.x + 6;
    for (let i = 0; i < 3; i++) game.act({ type: "wait" });
    expect(m.hp).toBeGreaterThan(20);
  });

  it("nests telegraph and miss if you step away, then swing plainly", () => {
    const { game, m } = duel("nest", { damage: 8, speed: 100 });
    game.act({ type: "wait" });
    expect(m.threat.length).toBeGreaterThan(0);
    expect(game.threatened().has(game.floor.map.grid.idx(game.player.x, game.player.y))).toBe(true);
    const hp = game.player.hp;
    const grid = game.floor.map.grid;
    const escape = [[-1, 0], [-1, -1], [-1, 1], [0, -1], [0, 1]].find(([dx, dy]) => {
      const x = game.player.x + dx;
      const y = game.player.y + dy;
      return walkable(grid.get(x, y)) && !m.threat.some(([tx, ty]) => tx === x && ty === y);
    })!;
    game.player.x += escape[0] * 2;
    game.player.y += escape[1] * 2;
    game.act({ type: "wait" });
    expect(game.player.hp).toBeGreaterThanOrEqual(hp);
    expect(m.threat).toHaveLength(0);
    expect(m.cooldown).toBeGreaterThan(0);
  });

  it("bosses wind up an area attack that lands if you stay", () => {
    const rooms = [room(), room({ kind: "lair", size: 5 })];
    const game = new Game(spec([floor(rooms, [[0, 1]])]));
    const boss = game.floor.monsters.find((x) => x.boss)!;
    game.floor.monsters = [boss];
    game.player.x = boss.x + 2;
    game.player.y = boss.y;
    expect(game.floor.map.grid.get(game.player.x, game.player.y)).not.toBe(Tile.Wall);
    boss.awake = true;
    boss.speed = 100;
    boss.turns = TUNING.bossSweepEvery - 1;
    game.player.maxHp = 999;
    game.player.hp = 999;
    game.act({ type: "wait" });
    expect(boss.threat.length).toBeGreaterThan(0);
    game.act({ type: "wait" });
    const events = game.drain();
    expect(events.some((e) => e.t === "telegraph")).toBe(true);
    expect(game.player.hp).toBeLessThan(999);
  });
});
