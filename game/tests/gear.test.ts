import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { decodeLog } from "../src/game/record";
import { armor, describe as describeGear, fromTests, guardName, score, traitFor, weapon } from "../src/game/gear";
import type { Monster } from "../src/game/types";
import { enemy, floor, room, spec } from "./fixtures";

/** The player next to one monster, holding `gear`. */
function duel(archetype: Exclude<Monster["archetype"], "boss" | "spawn"> = "bug", hp = 60): { game: Game; m: Monster } {
  const rooms = [room({ size: 4 }), room({ enemies: [enemy({ archetype, hp })], size: 4 }), room({ kind: "lair" })];
  const game = new Game(spec([floor(rooms, [[0, 1], [1, 2]])]), { run: 3 });
  const m = game.floor.monsters.find((x) => !x.boss)!;
  game.floor.monsters = [m];
  const r = game.floor.map.rooms[1];
  game.player.x = r.cx;
  game.player.y = r.cy;
  m.x = r.cx + 1;
  m.y = r.cy;
  m.awake = true;
  game.drain();
  return { game, m };
}

/** Puts gear on the floor right of the player and steps onto it. */
function stepOnGear(game: Game, g: ReturnType<typeof weapon>) {
  const r = game.floor.map.rooms[0];
  game.floor.monsters = [];
  game.player.x = r.cx;
  game.player.y = r.cy;
  game.floor.items = [{ id: "test-gear", kind: g.slot, x: r.cx + 1, y: r.cy, loot: null, source: "here", gear: g }];
  game.act({ type: "move", dx: 1, dy: 0 });
}

describe("gear", () => {
  it("gives each language its own weapon trait", () => {
    expect(traitFor("rust")).toBe("pierce");
    expect(traitFor("go")).toBe("steady");
    expect(traitFor("python")).toBe("cleave");
    expect(traitFor("cobol")).toBe("plain");
  });

  it("names armor the way the language guards things", () => {
    expect(guardName("load", "go")).toBe("if err != nil after load");
    expect(guardName("load", "python")).toBe("try/except around load");
    expect(guardName("load", "brainfuck")).toBe("a guard around load");
  });

  it("scores bigger bonuses higher and a trait as a tiebreak", () => {
    expect(score(weapon("a", "go", 3))).toBeGreaterThan(score(weapon("b", "cobol", 3)));
    expect(score(weapon("a", "cobol", 4))).toBeGreaterThan(score(weapon("b", "go", 3)));
    expect(score(null)).toBe(0);
    expect(describeGear(armor("x", "go", 2))).toBe("x, defense 2");
  });

  it("bigger test suites make better armor", () => {
    expect(fromTests(room({ functions: 40 }), 0).bonus).toBeGreaterThan(fromTests(room({ functions: 1 }), 0).bonus);
  });

  it("turns a FIXME into a weapon from the file's language", () => {
    const r = room({ language: "rust", loot: [{ id: "l1", kind: "blade", tag: "FIXME", text: "unwrap", line: 3, power: 3, year: null, year_or_older: false, author: null }] });
    const game = new Game(spec([floor([room(), r, room({ kind: "lair" })], [[0, 1], [1, 2]])]));
    const item = game.floor.items.find((i) => i.kind === "weapon")!;
    expect(item.gear?.trait).toBe("pierce");
    expect(item.gear?.name).toContain("unwrap");
  });

  it("leaves the biggest test file's suite lying around as armor", () => {
    const tests = room({ kind: "shrine", functions: 30, name: "test_app.py" });
    const game = new Game(spec([floor([room(), tests, room({ kind: "lair" })], [[0, 1], [1, 2]])]));
    const suite = game.floor.items.find((i) => i.kind === "armor");
    expect(suite?.gear?.name).toBe("test_app.py suite");
  });

  it("equips into an empty slot without asking", () => {
    const { game } = duel();
    stepOnGear(game, weapon("parse", "go", 3));
    expect(game.gearChoice).toBeNull();
    expect(game.player.weapon?.name).toBe("parse");
  });

  it("asks before swapping, and the old one drops where the new one was", () => {
    const { game } = duel();
    game.player.weapon = weapon("old", "go", 2);
    stepOnGear(game, weapon("new", "rust", 4));
    expect(game.gearChoice).not.toBeNull();
    expect(game.act({ type: "wait" })).toBe(false);
    game.act({ type: "gear", take: true });
    expect(game.player.weapon?.name).toBe("new");
    expect(game.floor.items.find((i) => i.gear?.name === "old")).toBeDefined();
    expect(game.log.at(-1)).toBe("T");
  });

  it("leaving gear keeps yours and remembers you said no", () => {
    const { game } = duel();
    game.player.armor = armor("mine", "go", 1);
    stepOnGear(game, armor("theirs", "go", 3));
    game.act({ type: "gear", take: false });
    expect(game.player.armor?.name).toBe("mine");
    expect(game.declined.has("test-gear")).toBe(true);
    expect(game.log.at(-1)).toBe("D");
  });

  it("a boring Go weapon never misses", () => {
    const { game, m } = duel("tangle", 9999);
    m.maxHp = 9999;
    game.player.weapon = weapon("w", "go", 1);
    for (let i = 0; i < 60; i++) {
      game.player.hp = game.player.maxHp;
      game.act({ type: "move", dx: 1, dy: 0 });
    }
    expect(game.drain().filter((e) => e.t === "miss" && e.x === m.x)).toHaveLength(0);
  });

  it("a Rust weapon goes through wall armor", () => {
    const { game, m } = duel("wall", 9999);
    game.player.atk = 10;
    game.player.weapon = weapon("w", "rust", 0);
    for (let i = 0; i < 20; i++) {
      game.player.hp = game.player.maxHp;
      game.act({ type: "move", dx: 1, dy: 0 });
    }
    const plain = game.drain().filter((e) => e.t === "hit" && !e.onPlayer && !e.crit);
    expect(plain.some((e) => e.t === "hit" && e.amount >= 10)).toBe(true);
    expect(m.hp).toBeLessThan(9999);
  });

  it("a duck typed weapon hits the one standing beside you too", () => {
    const { game, m } = duel("tangle", 9999);
    const other = { ...m, id: "other", x: game.player.x - 1, hp: 9999, maxHp: 9999 };
    game.floor.monsters.push(other);
    game.player.weapon = weapon("w", "python", 0);
    for (let i = 0; i < 10; i++) {
      game.player.hp = game.player.maxHp;
      game.act({ type: "move", dx: 1, dy: 0 });
    }
    expect(other.hp).toBeLessThan(9999);
  });

  it("armor takes its defense off every hit, down to 1", () => {
    const { game, m } = duel("bug");
    m.damage = 3;
    game.player.armor = armor("a", "go", 10);
    for (let i = 0; i < 30; i++) {
      game.player.hp = game.player.maxHp;
      game.act({ type: "wait" });
    }
    const taken = game.drain().filter((e) => e.t === "hit" && e.onPlayer);
    expect(taken.length).toBeGreaterThan(0);
    for (const e of taken) if (e.t === "hit") expect(e.amount).toBe(1);
  });

  it("a beaten boss leaves its own function behind", () => {
    const f0 = floor([room(), room({ kind: "lair" })], [[0, 1]], 0, false);
    const f1 = floor([room(), room({ kind: "lair" })], [[0, 1]], 1, true);
    const game = new Game(spec([f0, f1]));
    const boss = game.floor.monsters.find((m) => m.boss)!;
    boss.hp = 1;
    game.player.x = boss.x - 1;
    game.player.y = boss.y;
    game.player.weapon = weapon("w", "go", 0);
    game.act({ type: "move", dx: 1, dy: 0 });
    expect(game.floor.items.find((i) => i.gear?.name === boss.name)).toBeDefined();
  });

  it("take and leave survive the log round trip", () => {
    expect(decodeLog("lT2D")).toEqual([
      { type: "move", dx: 1, dy: 0 },
      { type: "gear", take: true },
      { type: "gear", take: true },
      { type: "gear", take: false },
    ]);
  });
});
