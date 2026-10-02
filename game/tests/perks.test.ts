import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ALL_PERKS, PERKS, available } from "../src/game/perks";
import { enemy, floor, room, spec } from "./fixtures";

function game(): Game {
  const rooms = [room({ size: 4 }), room({ enemies: [enemy({ hp: 5, xp: 500 })], size: 4 }), room({ kind: "lair" })];
  return new Game(spec([floor(rooms, [[0, 1], [1, 2]])]), { run: 3 });
}

function levelUp(g: Game): void {
  const m = g.floor.monsters.find((x) => !x.boss)!;
  g.floor.monsters = g.floor.monsters.filter((x) => x === m || x.boss);
  m.x = g.player.x + 1;
  m.y = g.player.y;
  if (!g.floor.map.grid.get(m.x, m.y)) m.x = g.player.x - 1;
  m.hp = 1;
  g.player.atk = 50;
  for (let i = 0; i < 10 && !g.perkChoice; i++) g.act({ type: "move", dx: m.x - g.player.x, dy: 0 });
}

describe("perks", () => {
  it("level ups ask for a choice and block other actions until it's made", () => {
    const g = game();
    levelUp(g);
    expect(g.perkChoice).toHaveLength(3);
    const turns = g.player.turns;
    expect(g.act({ type: "wait" })).toBe(false);
    expect(g.player.turns).toBe(turns);
    const first = g.perkChoice![0];
    g.act({ type: "perk", index: 0 });
    // 500 xp can be several levels; every one of them gets its own pick.
    while (g.perkChoice) g.act({ type: "perk", index: 0 });
    expect(g.player.perks[0]).toBe(first);
    expect(g.player.perks.length).toBe(g.player.level - 1);
    expect(g.act({ type: "wait" })).toBe(true);
  });

  it("only offers stacking perks twice", () => {
    expect(available(["linter", "refactoring"])).not.toContain("linter");
    expect(available(["linter", "refactoring"])).toContain("refactoring");
    expect(available([]).length).toBe(ALL_PERKS.length);
    for (const id of ALL_PERKS) expect(PERKS[id].text.length).toBeGreaterThan(5);
  });

  it("the stat perks do what they say", () => {
    const g = game();
    levelUp(g);
    const before = { ...g.player };
    const pickIndex = (id: string) => g.perkChoice!.indexOf(id as never);
    // Force a known choice to test the effect.
    g.perkChoice = ["monorepo", "refactoring", "coverage"];
    g.act({ type: "perk", index: pickIndex("monorepo") });
    expect(g.player.maxHp).toBe(before.maxHp + 12);
    g.perkChoice = ["refactoring", "linter", "ci"];
    g.act({ type: "perk", index: 0 });
    expect(g.player.atk).toBe(before.atk + 2);
  });

  it("perks stay deterministic for a seed", () => {
    const a = game();
    const b = game();
    levelUp(a);
    levelUp(b);
    expect(a.perkChoice).toEqual(b.perkChoice);
  });
});
