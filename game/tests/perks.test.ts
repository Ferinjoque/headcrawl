import { describe, expect, it } from "vitest";
import { botAction } from "../src/game/bot";
import { Game } from "../src/game/game";
import { ALL_PERKS, PERKS, available, offer } from "../src/game/perks";
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

describe("round 8 perks", () => {
  it("offers three different perks and rare ones less often", () => {
    let seed = 1;
    const roll = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let rare = 0;
    let common = 0;
    for (let i = 0; i < 3000; i++) {
      const picks = offer([], roll);
      expect(new Set(picks).size).toBe(3);
      for (const id of picks) (PERKS[id].rare ? rare++ : common++);
    }
    const rareShare = rare / (rare + common);
    const rareCount = ALL_PERKS.filter((id) => PERKS[id].rare).length;
    expect(rareShare).toBeLessThan(rareCount / ALL_PERKS.length);
    expect(rare).toBeGreaterThan(0);
  });

  it("never offers more than what's left", () => {
    const taken = ALL_PERKS.filter((id) => !PERKS[id].stacks);
    expect(offer(taken, () => 0.5)).toHaveLength(ALL_PERKS.length - taken.length);
  });

  it("a feature flag saves you once per floor", () => {
    const g = game();
    const m = g.floor.monsters.find((x) => !x.boss)!;
    g.floor.monsters = [m];
    m.x = g.player.x + 1;
    m.y = g.player.y;
    if (!g.floor.map.grid.get(m.x, m.y)) m.x = g.player.x - 1;
    m.awake = true;
    m.damage = 99;
    m.hp = 9999;
    g.player.perks.push("flag");
    g.player.hp = 1;
    for (let i = 0; i < 40 && g.outcome === "playing"; i++) g.act({ type: "wait" });
    expect(g.flagUsedOn).toBe(0);
    expect(g.outcome).toBe("dead");
  });

  it("structured logging gives a third more XP", () => {
    const a = game();
    const b = game();
    b.player.perks.push("logging");
    levelUp(a);
    levelUp(b);
    const total = (g: Game) => g.player.xp + Array.from({ length: g.player.level - 1 }, (_, i) => Math.round(14 * (i + 1) ** 1.45)).reduce((x, y) => x + y, 0);
    expect(total(b)).toBeGreaterThan(total(a));
  });
});

describe("careful bot", () => {
  it("takes the best tool on offer, not the first", () => {
    const g = game();
    g.perkChoice = ["gc", "flag", "ci"];
    expect(botAction(g, { careful: true })).toEqual({ type: "perk", index: 1 });
    expect(botAction(g)).toEqual({ type: "perk", index: 0 });
  });
});
