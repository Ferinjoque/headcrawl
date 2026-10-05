import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { TROPHIES, earnedBy } from "../src/game/trophies";
import { award, loadTrophies } from "../src/ui/trophycase";
import { floor, room, spec } from "./fixtures";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

const game = (mods: Game["mods"] = []) => new Game(spec([floor([room(), room({ kind: "lair" })], [[0, 1]])]), { run: 1, mods });

describe("trophies", () => {
  it("have unique ids and say how to get them", () => {
    expect(new Set(TROPHIES.map((t) => t.id)).size).toBe(TROPHIES.length);
    for (const t of TROPHIES) expect(t.how.length).toBeGreaterThan(5);
  });

  it("gives nothing for a run that just started", () => {
    expect(earnedBy(game())).toEqual([]);
  });

  it("counts a quick bare-handed win on hard", () => {
    const g = game(["hard"]);
    g.outcome = "won";
    g.player.bosses = 1;
    g.player.turns = 100;
    expect(earnedBy(g)).toEqual(expect.arrayContaining(["boss", "bottom", "hard", "bare", "quick"]));
    expect(earnedBy(g)).not.toContain("deep");
  });

  it("keeps each trophy once, with where it was first earned", () => {
    expect(award(["boss", "nope"], "pallets/flask", 5)).toEqual(["boss"]);
    expect(award(["boss", "bottom"], "psf/requests", 6)).toEqual(["bottom"]);
    expect(loadTrophies().get("boss")).toEqual({ repo: "pallets/flask", at: 5 });
  });

  it("ignores junk in storage", () => {
    store.set("headcrawl.trophies.v1", JSON.stringify({ boss: { repo: 1 }, made_up: { repo: "x", at: 1 }, bottom: { repo: "a/b", at: 2 } }));
    expect([...loadTrophies().keys()]).toEqual(["bottom"]);
    store.set("headcrawl.trophies.v1", "not json");
    expect(loadTrophies().size).toBe(0);
  });
});
