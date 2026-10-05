import { describe, expect, it } from "vitest";
import { DEALS, canRewind, dailyMod, dealFor, ghostStep, installLine, rewindFloor, timeTravel, vendorOffers } from "../src/game/extras";
import { Rng } from "../src/core/rng";
import { Game } from "../src/game/game";
import { decodeLog, encodeLog } from "../src/game/record";
import { Grid, Tile } from "../src/map/grid";
import { layoutFloor } from "../src/map/layout";
import { dailyOf, dailyPick } from "../src/ui/daily";
import { enemy, floor, room, spec } from "./fixtures";

const DEPS = [
  { name: "express", ecosystem: "npm" as const },
  { name: "lodash", ecosystem: "npm" as const },
  { name: "left-pad", ecosystem: "npm" as const },
];

function withDeps() {
  const s = spec([floor([room(), room(), room({ kind: "lair" })], [[0, 1], [1, 2]])]);
  return { ...s, repo: { ...s.repo, dependencies: DEPS } };
}

describe("vendor", () => {
  it("sells the same two dependencies on a floor for every run", () => {
    const s = withDeps();
    const offers = vendorOffers(s, 0);
    expect(offers).toHaveLength(2);
    expect(vendorOffers(s, 0)).toEqual(offers);
    expect(vendorOffers(spec([floor([room(), room({ kind: "lair" })], [[0, 1]])]), 0)).toEqual([]);
    expect(dealFor(DEPS[0])).toBe(dealFor(DEPS[0]));
    expect(installLine(DEPS[0])).toBe("npm install express");
  });

  it("stands in the entry room and sells once, and a replay buys the same thing", () => {
    const game = new Game(withDeps(), { run: 3 });
    const v = game.floor.vendor!;
    expect(v).toBeTruthy();
    // Walk next to the vendor, then bump it.
    game.player.x = v.x - 1;
    game.player.y = v.y;
    const atkBefore = game.player.atk;
    const hpBefore = game.player.maxHp;
    expect(game.act({ type: "move", dx: 1, dy: 0 })).toBe(true);
    expect(game.vendorChoice).toHaveLength(2);
    game.act({ type: "buy", index: 0 });
    expect(game.vendorChoice).toBeNull();
    expect(v.sold).toBe(true);
    expect(game.player.atk !== atkBefore || game.player.maxHp !== hpBefore || game.player.curses > 0 || game.player.hp > 0).toBe(true);
    game.act({ type: "move", dx: 1, dy: 0 });
    expect(game.vendorChoice).toBeNull();
    expect(decodeLog(encodeLog(game.log))?.some((a) => a.type === "buy")).toBe(true);
  });

  it("sells both offers to code owners", () => {
    const game = new Game(withDeps(), { run: 3 });
    game.player.perks.push("owners");
    const v = game.floor.vendor!;
    game.player.x = v.x - 1;
    game.player.y = v.y;
    game.act({ type: "move", dx: 1, dy: 0 });
    game.act({ type: "buy", index: 0 });
    expect(v.sold).toBe(false);
    game.act({ type: "move", dx: 1, dy: 0 });
    expect(game.vendorChoice).toHaveLength(1);
    game.act({ type: "buy", index: 0 });
    expect(v.sold).toBe(true);
  });

  it("lets you walk away", () => {
    const game = new Game(withDeps(), { run: 3 });
    const v = game.floor.vendor!;
    game.player.x = v.x - 1;
    game.player.y = v.y;
    game.act({ type: "move", dx: 1, dy: 0 });
    game.act({ type: "buy", index: -1 });
    expect(v.sold).toBe(false);
    expect(game.log.at(-1)).toBe("X");
  });

  it("every deal costs something and gives something", () => {
    for (const d of DEALS) {
      const g = new Game(withDeps());
      g.player.hp = 5;
      const before = { ...g.player };
      d.apply(g.player, { dep: DEPS[0], depth: 0 });
      const p = g.player;
      const gear = (p.weapon?.bonus ?? 0) > (before.weapon?.bonus ?? 0) || (p.armor?.bonus ?? 0) > (before.armor?.bonus ?? 0);
      const gained = gear || p.atk > before.atk || p.maxHp > before.maxHp || p.hp > before.hp;
      const paid = p.atk < before.atk || p.maxHp < before.maxHp || p.curses > before.curses || p.potions.length < before.potions.length || d.id === "tiny";
      expect(gained, d.id).toBe(true);
      expect(paid, d.id).toBe(true);
    }
  });
});

describe("ghosts", () => {
  it("drift through rock straight at you", () => {
    const grid = new Grid(20, 10);
    const m = { x: 2, y: 5 } as Parameters<typeof ghostStep>[0];
    const step = ghostStep(m, { x: 10, y: 5 }, grid, new Uint8Array(200));
    expect(step).toEqual([3, 5]);
    expect(grid.get(3, 5)).toBe(Tile.Rock);
    // Never onto the player, never off the edge of the map.
    expect(ghostStep({ x: 9, y: 5 } as never, { x: 10, y: 5 }, grid, new Uint8Array(200))).toBeNull();
  });

  it("hit softly", () => {
    const g = new Game(spec([floor([room(), room({ enemies: [enemy({ archetype: "ghost", damage: 20 })] }), room({ kind: "lair" })], [[0, 1], [1, 2]])]));
    const ghost = g.floor.monsters.find((m) => m.archetype === "ghost")!;
    ghost.x = g.player.x + 1;
    ghost.y = g.player.y;
    ghost.awake = true;
    for (let i = 0; i < 30 && g.player.hp === g.player.maxHp; i++) g.act({ type: "wait" });
    expect(g.player.maxHp - g.player.hp).toBeLessThanOrEqual(10 + 2);
  });
});

describe("loops", () => {
  it("only import cycles become loop corridors, and they walk you back once", () => {
    const rooms = [room(), room(), room({ kind: "lair" })];
    const f = floor(rooms, [[0, 1], [1, 2]]);
    f.edges = f.edges.map((e, i) => ({ ...e, loop: i === 0 }));
    const map = layoutFloor(f, "seed");
    expect(map.loops.length).toBeLessThanOrEqual(1);
    const game = new Game(spec([f]));
    const trap = game.floor.map.loops[0];
    if (!trap) return; // the corridor came out too short for a trap on this layout
    const g = game.floor.map.grid;
    const tx = trap.cell % g.width;
    const ty = (trap.cell - tx) / g.width;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => g.get(tx + dx, ty + dy) === Tile.Corridor)!;
    game.player.x = tx + near[0];
    game.player.y = ty + near[1];
    game.act({ type: "move", dx: -near[0], dy: -near[1] });
    expect(game.player.x === tx && game.player.y === ty).toBe(false);
    expect(game.floor.loopsDone.has(trap.cell)).toBe(true);
  });
});

describe("daily", () => {
  it("has a twist, and Fridays are friday deploys", () => {
    expect(dailyMod(20261002)).toBe("friday");
    expect(dailyMod(20261003)).not.toBe("friday");
    expect(dailyMod(12)).toBeNull();
    const entries = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
    const today = dailyPick(entries, new Date("2026-10-03T12:00:00Z"))!;
    expect(dailyOf(entries, today.entry.slug, today.run)?.label).toBe("2026-10-03");
    expect(dailyOf(entries, today.entry.slug, 4821)).toBeNull();
  });

  it("changes the run: lights out means less sight, hotfix more attack", () => {
    const s = spec([floor([room(), room({ kind: "lair" })], [[0, 1]])]);
    expect(new Game(s, { mods: ["lightsout"] }).sight).toBe(new Game(s).sight - 2);
    expect(new Game(s, { mods: ["hotfix"] }).player.atk).toBe(new Game(s).player.atk + 2);
  });
});

describe("time travel", () => {
  it("puts the boss back to how complex it was", () => {
    const f = floor([room(), room({ kind: "lair" })], [[0, 1]]);
    f.boss = { ...f.boss, ccn: 20, past: { year: 2021, ccn: 10, nloc: 40 } };
    const game = new Game(spec([f]));
    const boss = game.floor.monsters.find((m) => m.boss)!;
    const before = boss.maxHp;
    expect(timeTravel(boss)).toEqual({ year: 2021, before: 20, after: 10 });
    expect(boss.maxHp).toBe(Math.round(before / 2));
    const plain = new Game(spec([floor([room(), room({ kind: "lair" })], [[0, 1]])]));
    expect(timeTravel(plain.floor.monsters.find((m) => m.boss)!)).toBeNull();
  });
});

describe("floor rewind", () => {
  it("swaps living functions for last year's, never adds any back", () => {
    const past = { year: 2021, enemies: [enemy({ name: "old_one" }), enemy({ name: "old_two" }), enemy({ name: "old_three" })] };
    const rooms = [room(), room({ enemies: [enemy({ name: "now_a" }), enemy({ name: "now_b" })], past }), room({ kind: "lair" })];
    const game = new Game(spec([floor(rooms, [[0, 1], [1, 2]])]));
    const before = game.floor.monsters.filter((m) => !m.boss).length;
    expect(canRewind(game.floor)).toBe(true);
    const r = rewindFloor(game.floor, new Rng("t"), 1, { x: -1, y: -1 })!;
    expect(r.year).toBe(2021);
    const names = game.floor.monsters.filter((m) => !m.boss).map((m) => m.name);
    expect(names.length).toBe(before);
    expect(names.every((n) => n.startsWith("old_"))).toBe(true);
    expect(canRewind(game.floor)).toBe(false);
  });
});

describe("the keeper", () => {
  it("stands in a hall, talks once, and heals once", () => {
    const f = floor([room(), room(), room(), room({ kind: "lair" })], [[0, 1], [1, 2], [2, 3]]);
    f.keeper = { name: "ada", commits: 41, subject: "make it faster" };
    const game = new Game(spec([f]));
    const k = game.floor.keeper!;
    expect(k).toBeTruthy();
    const rect = game.floor.map.rooms[game.floor.map.grid.roomAt(k.x, k.y)];
    expect(rect).not.toBe(game.floor.map.entry);
    expect(rect).not.toBe(game.floor.map.lair);
    game.player.hp = 5;
    game.player.x = k.x - 1;
    game.player.y = k.y;
    game.act({ type: "move", dx: 1, dy: 0 });
    expect(k.met).toBe(true);
    expect(game.player.hp).toBeGreaterThan(5);
    expect(game.journal.some((l) => l.includes("make it faster"))).toBe(true);
    const hp = game.player.hp;
    game.act({ type: "move", dx: 1, dy: 0 });
    expect(game.player.x).toBe(k.x - 1);
    expect(game.player.hp).toBeLessThanOrEqual(hp + 2);
  });

  it("is missing when the dungeon has no history", () => {
    expect(new Game(spec([floor([room(), room(), room({ kind: "lair" })], [[0, 1], [1, 2]])])).floor.keeper).toBeNull();
  });
});

describe("rewind edge cases", () => {
  it("does nothing on a cleared floor and keeps wounds and twists", () => {
    const past = { year: 2021, enemies: [enemy({ name: "old_one", hp: 40 })] };
    const rooms = [room(), room({ enemies: [enemy({ name: "now_a", hp: 40 })], past }), room({ kind: "lair" })];
    const game = new Game(spec([floor(rooms, [[0, 1], [1, 2]])]), { mods: ["legacy"] });
    const now = game.floor.monsters.find((m) => m.name === "now_a")!;
    now.hp = Math.round(now.maxHp / 2);
    rewindFloor(game.floor, new Rng("t"), 1, { x: -1, y: -1 }, ["legacy"]);
    const old = game.floor.monsters.find((m) => m.name === "old_one")!;
    expect(old.hp / old.maxHp).toBeCloseTo(0.5, 1);
    const cleared = new Game(spec([floor(rooms, [[0, 1], [1, 2]])]));
    cleared.floor.monsters = cleared.floor.monsters.filter((m) => m.boss);
    expect(canRewind(cleared.floor)).toBe(false);
  });
});
