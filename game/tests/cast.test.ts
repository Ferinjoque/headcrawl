import { describe, expect, it } from "vitest";
import { botAction } from "../src/game/bot";
import { Game } from "../src/game/game";
import { castOf, frame } from "../src/ui/cast";
import { enemy, floor, room, spec } from "./fixtures";

describe("asciinema cast", () => {
  it("draws the last turns of a run as ANSI frames", () => {
    const s = spec([floor([room(), room({ enemies: [enemy()] }), room({ kind: "lair" })], [[0, 1], [1, 2]])]);
    const game = new Game(s, { run: 2 });
    for (let i = 0; i < 80 && game.outcome === "playing"; i++) game.act(botAction(game));
    expect(frame(game)).toContain("@");
    expect(frame(game)).toContain(`turn ${game.player.turns}`);
    const cast = castOf(s, 2, [], game.record(), 30)!;
    const lines = cast.trim().split("\n");
    const header = JSON.parse(lines[0]);
    expect(header.version).toBe(2);
    expect(header.width).toBe(64);
    // The turn it starts on plus thirty more, then one held ending.
    expect(lines.length - 2).toBe(Math.min(30, game.player.turns) + 1);
    const times = lines.slice(1).map((l) => JSON.parse(l)[0] as number);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(castOf(s, 2, [], "?!")).toBeNull();
  });
});
