import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { armor, weapon } from "../src/game/gear";
import { attackRange, hitChance, pct, stats } from "../src/game/stats";
import { choiceAction } from "../src/ui/choices";
import { floor, room, spec } from "./fixtures";

const fresh = () => new Game(spec([floor([room(), room({ kind: "lair" })], [[0, 1]])]));

describe("stats", () => {
  it("adds the weapon to the attack range", () => {
    const g = fresh();
    const [lo, hi] = attackRange(g);
    g.player.weapon = weapon("w", "cobol", 3);
    expect(attackRange(g)).toEqual([lo + 3, hi + 3]);
  });

  it("a loose weapon spreads the range both ways", () => {
    const g = fresh();
    const [lo, hi] = attackRange(g);
    g.player.weapon = weapon("w", "php", 0);
    const [a, b] = attackRange(g);
    expect(a).toBeLessThan(lo);
    expect(b).toBeGreaterThan(hi);
  });

  it("knows a Go weapon never misses and unsafe C crits for 3x", () => {
    const g = fresh();
    expect(hitChance(g)).toBeLessThan(1);
    g.player.weapon = weapon("w", "go", 1);
    expect(hitChance(g)).toBe(1);
    g.player.weapon = weapon("w", "c", 1);
    expect(stats(g).critMult).toBe(3);
  });

  it("reports armor as defense and bare hands when empty", () => {
    const g = fresh();
    expect(stats(g).weapon).toBe("bare hands");
    expect(stats(g).defense).toBe(0);
    g.player.armor = armor("a", "go", 2);
    expect(stats(g).defense).toBe(2);
    expect(pct(0.125)).toBe("13%");
  });
});

describe("choice keys", () => {
  it("means nothing when no card is up", () => {
    expect(choiceAction(fresh(), { kind: "perk", index: 0 })).toBeUndefined();
  });

  it("maps 1 and 2 to take and leave, esc to leave", () => {
    const g = fresh();
    g.gearChoice = { id: "x", kind: "weapon", x: 0, y: 0, loot: null, source: "", gear: weapon("w", "go", 1) };
    expect(choiceAction(g, { kind: "perk", index: 0 })).toEqual({ type: "gear", take: true });
    expect(choiceAction(g, { kind: "perk", index: 1 })).toEqual({ type: "gear", take: false });
    expect(choiceAction(g, { kind: "menu" })).toEqual({ type: "gear", take: false });
    expect(choiceAction(g, { kind: "wait" })).toBeNull();
  });

  it("lets esc walk away from the vendor but not from a level up", () => {
    const g = fresh();
    g.vendorChoice = [];
    expect(choiceAction(g, { kind: "menu" })).toEqual({ type: "buy", index: -1 });
    g.vendorChoice = null;
    g.perkChoice = ["linter", "ci", "di"];
    expect(choiceAction(g, { kind: "perk", index: 2 })).toEqual({ type: "perk", index: 2 });
    expect(choiceAction(g, { kind: "menu" })).toBeNull();
  });
});
