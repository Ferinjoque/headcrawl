import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { addRun, emptyCodex, loadCodex, topDeaths } from "../src/ui/codex";
import { armor, weapon } from "../src/game/gear";
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

describe("bestiary entries", () => {
  it("remembers where you first met a kind and the gnarliest one", () => {
    const s = spec([floor([room(), room({ kind: "lair" })], [[0, 1]])]);
    const a = new Game(s);
    a.player.killsBy = { bug: 2 };
    a.trophies.bug = { name: "parse_args", ccn: 5 };
    a.eliteKills.god = 1;
    a.wielded.push(weapon("handle", "rust", 4), weapon("tiny", "go", 1), armor("x", "go", 2));
    const b = new Game(s);
    b.player.killsBy = { bug: 1 };
    b.trophies.bug = { name: "smaller", ccn: 2 };
    const c = addRun(addRun(emptyCodex(), a), b);
    expect(c.first.bug).toBe("test/repo");
    expect(c.worst.bug).toEqual({ name: "parse_args", repo: "test/repo", ccn: 5 });
    expect(c.elites).toEqual({ god: 1 });
    expect(c.traits).toEqual({ pierce: 1, steady: 1 });
    expect(c.best?.name).toBe("handle");
  });

  it("loads an older codex without the new fields", () => {
    const store = new Map<string, string>();
    const old = { runs: 2, wins: 1, kills: { bug: 3 }, bosses: [], deaths: {}, repos: ["a/b"] };
    store.set("headcrawl.codex.v1", JSON.stringify(old));
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: () => {} } as unknown as Storage;
    try {
      const c = loadCodex();
      expect(c.runs).toBe(2);
      expect(c.first).toEqual({});
      expect(c.best).toBeNull();
    } finally {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });
});
