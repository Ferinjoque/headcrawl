import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { LAB_KINDS, LAB_LANGUAGES, clearMonsters, dropItem, giveArmor, giveWeapon, grant, healFull, labSpec, levelUp, openStairs, revealAll, spawn } from "../src/game/lab";
import { traitFor } from "../src/game/gear";
import { Tile } from "../src/map/grid";
import { loadSpec } from "../src/spec";

function lab(): Game {
  const res = loadSpec(JSON.stringify(labSpec()));
  if (!res.ok) throw new Error(res.error);
  const g = new Game(res.spec);
  // Stand in the arena, which is empty and big.
  const arena = g.floor.map.rooms[1];
  g.player.x = arena.cx;
  g.player.y = arena.cy;
  g.act({ type: "wait" });
  return g;
}

describe("lab", () => {
  it("is a valid dungeon by the same schema as any other", () => {
    expect(loadSpec(JSON.stringify(labSpec())).ok).toBe(true);
  });

  it("spawns every kind, elites too", () => {
    const g = lab();
    clearMonsters(g);
    for (const k of LAB_KINDS) expect(spawn(g, k)?.archetype).toBe(k);
    expect(spawn(g, "bug", "god")?.affix).toBe("god");
  });

  it("covers every weapon trait with its language buttons", () => {
    const traits = new Set(LAB_LANGUAGES.map(traitFor));
    expect(traits.size).toBe(LAB_LANGUAGES.length);
    const g = lab();
    giveWeapon(g, "rust", 4);
    expect(g.player.weapon?.trait).toBe("pierce");
    giveArmor(g, 3);
    expect(g.player.armor?.bonus).toBe(3);
    giveArmor(g, 0);
    expect(g.player.armor).toBeNull();
  });

  it("grants perks with their effects, levels you, heals, drops items", () => {
    const g = lab();
    const hp = g.player.maxHp;
    grant(g, "monorepo");
    expect(g.player.maxHp).toBe(hp + 12);
    levelUp(g);
    expect(g.player.level).toBe(2);
    g.player.hp = 1;
    healFull(g);
    expect(g.player.hp).toBe(g.player.maxHp);
    const before = g.floor.items.length;
    dropItem(g, "scroll");
    expect(g.floor.items.length).toBe(before + 1);
  });

  it("god mode keeps you standing and freeze stops monsters", () => {
    const g = lab();
    clearMonsters(g);
    const m = spawn(g, "wall")!;
    m.damage = 99;
    m.x = g.player.x + 1;
    m.y = g.player.y;
    g.cheats.god = true;
    g.player.hp = 1;
    for (let i = 0; i < 20; i++) g.act({ type: "wait" });
    expect(g.outcome).toBe("playing");
    g.cheats.frozen = true;
    const hp = (g.player.hp = g.player.maxHp - 10);
    for (let i = 0; i < 10; i++) g.act({ type: "wait" });
    expect(g.player.hp).toBeGreaterThanOrEqual(hp);
  });

  it("reveals the floor and opens the stairs", () => {
    const g = lab();
    revealAll(g);
    expect(g.floor.seen.some((v) => v === 1)).toBe(true);
    openStairs(g);
    const [x, y] = g.floor.map.stairsDown;
    expect(g.floor.map.grid.get(x, y)).toBe(Tile.StairsDown);
  });
});
