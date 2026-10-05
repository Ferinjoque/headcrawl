import { describe, expect, it } from "vitest";
import { killMonster } from "../src/game/combat";
import { Game } from "../src/game/game";
import { enemy, floor, room, spec } from "./fixtures";

describe("reverted files", () => {
  const make = (reverts: number) =>
    new Game(spec([floor([room(), room({ enemies: [enemy({ hp: 5 }), enemy({ hp: 30 })], size: 4, reverts }), room({ kind: "lair" })], [[0, 1], [1, 2]])]));

  it("mark the toughest monster in the room", () => {
    const marked = make(2).floor.monsters.filter((m) => m.undo);
    expect(marked).toHaveLength(1);
    expect(marked[0].maxHp).toBe(Math.max(...make(2).floor.monsters.filter((m) => !m.boss).map((m) => m.maxHp)));
    expect(make(0).floor.monsters.some((m) => m.undo)).toBe(false);
  });

  it("never mark the boss, even in its own reverted file", () => {
    const game = new Game(spec([floor([room(), room({ kind: "lair", reverts: 3, enemies: [enemy({ hp: 5 })] })], [[0, 1]])]));
    expect(game.floor.monsters.find((m) => m.boss)?.undo).toBe(0);
    expect(game.floor.monsters.filter((m) => m.undo)).toHaveLength(1);
  });

  it("bring it back once at half HP, then let it die", () => {
    const game = make(1);
    const m = game.floor.monsters.find((x) => x.undo)!;
    const kills = game.player.kills;
    m.hp = 0;
    expect(killMonster(game, m)).toBe(false);
    expect(m.hp).toBe(Math.ceil(m.maxHp / 2));
    expect(game.floor.monsters).toContain(m);
    m.hp = 0;
    expect(killMonster(game, m)).toBe(true);
    expect(game.floor.monsters).not.toContain(m);
    expect(game.player.kills).toBe(kills + 1);
  });
});
