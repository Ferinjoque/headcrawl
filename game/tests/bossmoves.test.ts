import { describe, expect, it } from "vitest";
import { BOSS_MOVES, bossParams, styleOf } from "../src/game/bossmoves";
import { Game } from "../src/game/game";
import { clearMonsters, labSpec, spawnBoss } from "../src/game/lab";
import type { Monster } from "../src/game/types";
import { loadSpec, type Boss } from "../src/spec";

const base: Boss = { id: "b1", name: "main", title: "t", signature: "main()", line: 1, hp: 50, damage: 5, speed: 100, xp: 10, ccn: 5, churn: 5, taunts: ["hi"] };

describe("boss styles", () => {
  it("come from the code: deep, then sprawling, then long, then hot", () => {
    expect(styleOf({ ...base, nesting: 9, params: 9 })).toBe("deep");
    expect(styleOf({ ...base, params: 6 })).toBe("sprawl");
    expect(styleOf({ ...base, nloc: 300 })).toBe("long");
    expect(styleOf({ ...base, ccn: 40 })).toBe("long");
    expect(styleOf({ ...base, churn: 90 })).toBe("hot");
    expect(styleOf(base)).toBe("plain");
  });

  it("counts parameters off older signatures, leaving self out", () => {
    expect(bossParams({ ...base, signature: "def run(self, a, b, c, d)" })).toBe(4);
    expect(bossParams({ ...base, signature: "main" })).toBe(0);
  });
});

function arena(style: Parameters<typeof spawnBoss>[1]): { g: Game; boss: Monster } {
  const res = loadSpec(JSON.stringify(labSpec()));
  if (!res.ok) throw new Error(res.error);
  const g = new Game(res.spec);
  const room = g.floor.map.rooms[1];
  g.player.x = room.cx;
  g.player.y = room.cy;
  g.act({ type: "wait" });
  clearMonsters(g);
  g.floor.monsters = [];
  const boss = spawnBoss(g, style)!;
  g.cheats.god = true;
  return { g, boss };
}

describe("boss moves", () => {
  it("a deeply nested boss sweeps three cells out", () => {
    const { g, boss } = arena("deep");
    boss.x = g.player.x + 3;
    boss.y = g.player.y;
    let widest = 0;
    for (let i = 0; i < 30; i++) {
      g.act({ type: "wait" });
      for (const [x, y] of boss.threat) widest = Math.max(widest, Math.abs(x - boss.x), Math.abs(y - boss.y));
    }
    expect(widest).toBe(BOSS_MOVES.deepRadius);
  });

  it("a sprawling boss calls helpers without being hurt", () => {
    const { g } = arena("sprawl");
    for (let i = 0; i < 30; i++) g.act({ type: "wait" });
    expect(g.floor.monsters.some((m) => m.archetype === "spawn")).toBe(true);
  });

  it("a god function heals while you are away", () => {
    const { g, boss } = arena("long");
    g.cheats.frozen = false;
    boss.hp = 10;
    boss.speed = 1;
    g.act({ type: "wait" });
    expect(boss.hp).toBeGreaterThan(10);
  });

  it("a hot path boss speeds up as the fight goes on", () => {
    const { g, boss } = arena("hot");
    const speed = boss.speed;
    for (let i = 0; i < 40; i++) g.act({ type: "wait" });
    expect(boss.speed).toBeGreaterThan(speed);
    expect(boss.speed).toBeLessThanOrEqual(speed + BOSS_MOVES.hotCap + 20);
  });
});
