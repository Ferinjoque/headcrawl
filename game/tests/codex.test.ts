import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { addRun, emptyCodex, loadCodex, topDeaths } from "../src/ui/codex";
import { floor, room, spec } from "./fixtures";

describe("bestiary", () => {
  it("adds up runs, kills, bosses and deaths", () => {
    const s = spec([floor([room(), room({ kind: "lair" })], [[0, 1]])]);
    const won = new Game(s);
    won.player.killsBy = { bug: 3, imp: 1 };
    won.player.bosses = 1;
    won.outcome = "won";
    const lost = new Game(s);
    lost.player.killsBy = { bug: 2 };
    lost.outcome = "dead";
    lost.killer = "parse_args";
    const c = addRun(addRun(emptyCodex(), won), lost);
    expect(c.runs).toBe(2);
    expect(c.wins).toBe(1);
    expect(c.kills).toEqual({ bug: 5, imp: 1 });
    // The same boss beaten twice is listed once.
    expect(addRun(c, won).bosses).toHaveLength(1);
    expect(c.bosses[0]).toEqual({ name: "main", repo: "test/repo", ccn: 9 });
    expect(topDeaths(c)).toEqual([["parse_args", 1]]);
    expect(c.repos).toEqual(["test/repo"]);
  });

  it("starts empty when storage is missing or junk", () => {
    expect(loadCodex()).toEqual(emptyCodex());
  });
});
