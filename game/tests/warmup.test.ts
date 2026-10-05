import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { gateFor } from "../src/game/warmup";
import { enemy, floor, room, spec } from "./fixtures";

describe("warm-up", () => {
  it("opens systems a floor at a time and everything on the last floor", () => {
    const gate = gateFor(5, false);
    expect(gate("shop", 0)).toBe(false);
    expect(gate("elites", 1)).toBe(true);
    expect(gate("keeper", 1)).toBe(false);
    expect(gate("branch", 2)).toBe(true);
    expect(gate("conflicts", 4)).toBe(true);
    expect(gateFor(2, false)("conflicts", 1)).toBe(true);
    expect(gateFor(1, false)("shop", 0)).toBe(true);
  });

  it("skips the warm-up on hard", () => {
    expect(gateFor(5, true)("shop", 0)).toBe(true);
  });

  const busy = () => {
    const crowd = [enemy({ ccn: 3 }), enemy({ ccn: 20, nloc: 300, deprecated: true }), enemy({ ccn: 5 })];
    const first = floor([room(), room({ enemies: crowd, size: 4, conflicts: 1 }), room({ kind: "lair" })], [[0, 1], [1, 2]], 0, false);
    const rest = [1, 2].map((i) => floor([room(), room({ kind: "lair" })], [[0, 1]], i, i === 2));
    return spec([first, ...rest]);
  };

  it("keeps the first floor plain on normal", () => {
    const game = new Game(busy(), { run: 1 });
    const ms = game.floor.monsters;
    expect(ms.some((m) => m.affix)).toBe(false);
    expect(ms.some((m) => m.enemy?.deprecated)).toBe(false);
    expect(ms.some((m) => m.name.endsWith("(theirs)"))).toBe(false);
    expect(game.floor.vendor).toBeNull();
  });

  it("has all of it on the first floor on hard", () => {
    const game = new Game(busy(), { run: 1, mods: ["hard"] });
    const ms = game.floor.monsters;
    expect(ms.some((m) => m.affix)).toBe(true);
    expect(ms.some((m) => m.enemy?.deprecated)).toBe(true);
    expect(ms.some((m) => m.name.endsWith("(theirs)"))).toBe(true);
  });
});
