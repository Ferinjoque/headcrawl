import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { clearMonsters, labSpec, spawn } from "../src/game/lab";
import { SLOW } from "../src/game/foes";
import { CONFLICT_COPIES } from "../src/game/world";
import { loadSpec } from "../src/spec";

function lab(): Game {
  const res = loadSpec(JSON.stringify(labSpec()));
  if (!res.ok) throw new Error(res.error);
  return new Game(res.spec, { run: 2 });
}

describe("deprecated functions", () => {
  it("slow you down when they hit", () => {
    const g = lab();
    const arena = g.floor.map.rooms[1];
    g.player.x = arena.cx;
    g.player.y = arena.cy;
    g.act({ type: "wait" });
    clearMonsters(g);
    g.floor.monsters = [];
    const m = spawn(g, "wall", null, true)!;
    m.x = g.player.x + 1;
    m.y = g.player.y;
    m.speed = 100;
    g.cheats.god = true;
    for (let i = 0; i < 30 && !g.player.slowed; i++) g.act({ type: "wait" });
    expect(g.player.slowed).toBeGreaterThan(0);
    expect(g.player.slowed).toBeLessThanOrEqual(SLOW.turns);
  });
});

describe("merge conflicts", () => {
  it("bring the other side's functions into the room", () => {
    const g = lab();
    const theirs = g.floor.monsters.filter((m) => m.name.endsWith("(theirs)"));
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs.length).toBeLessThanOrEqual(CONFLICT_COPIES);
    expect(new Set(g.floor.monsters.map((m) => m.id)).size).toBe(g.floor.monsters.length);
  });
});

describe("side branches", () => {
  function onDoor(): Game {
    const g = lab();
    const door = g.floor.branch!;
    expect(door.name).toBe("feature/practice");
    g.floor.monsters = g.floor.monsters.filter((m) => m.boss);
    g.player.x = door.x;
    g.player.y = door.y;
    return g;
  }

  it("check out a different layout with no boss and a weapon by the stairs", () => {
    const g = onDoor();
    const main = g.floor;
    expect(g.act({ type: "descend" })).toBe(true);
    expect(g.inBranch).toBe("feature/practice");
    expect(g.floor).not.toBe(main);
    expect(g.floor.monsters.some((m) => m.boss)).toBe(false);
    expect(g.floor.items.some((i) => i.id === "branch-0" && i.gear)).toBe(true);
  });

  it("merge you back where you left, and the door stays shut", () => {
    const g = onDoor();
    const main = g.floor;
    const [x, y] = [g.player.x, g.player.y];
    g.act({ type: "descend" });
    [g.player.x, g.player.y] = g.floor.map.stairsDown;
    expect(g.act({ type: "descend" })).toBe(true);
    expect(g.inBranch).toBeNull();
    expect(g.floor).toBe(main);
    expect([g.player.x, g.player.y]).toEqual([x, y]);
    expect(g.floor.branch?.used).toBe(true);
    expect(g.act({ type: "descend" })).toBe(false);
  });

  it("are skipped when the repo lists none", () => {
    const spec = labSpec();
    spec.repo.branches = [];
    const g = new Game(spec);
    expect(g.floor.branch).toBeNull();
  });
});
