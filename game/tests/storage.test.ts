import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { Hints } from "../src/ui/hints";
import { runLog } from "../src/ui/morgue";
import { recentBuilds, rememberBuild } from "../src/ui/recent";
import { enemy, floor, room, spec } from "./fixtures";

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

describe("hints", () => {
  it("shows each tip once, even across visits", () => {
    const rooms = [room({ enemies: [enemy()] }), room({ enemies: [enemy()] }), room({ kind: "lair" })];
    const game = new Game(spec([floor(rooms, [[0, 1], [1, 2]])]));
    const m = game.floor.monsters.find((x) => !x.boss)!;
    m.x = game.player.x + 1;
    m.y = game.player.y;
    game.act({ type: "wait" });
    game.act({ type: "wait" });
    game.act({ type: "wait" });
    game.player.hp = 1;
    const first = new Hints().check(game);
    expect(first.some((t) => t.includes("walk into a monster"))).toBe(true);
    expect(first.some((t) => t.includes("low on HP"))).toBe(true);
    expect(new Hints().check(game)).toEqual([]);
  });

  it("copes with broken storage", () => {
    store.set("headcrawl.hints.v1", "{not json");
    const game = new Game(spec([floor([room(), room({ kind: "lair" })], [[0, 1]])]));
    expect(() => new Hints().check(game)).not.toThrow();
  });
});

describe("recent builds", () => {
  it("keeps the newest few, without duplicates or junk", () => {
    const sha = (n: number) => String(n).repeat(40).slice(0, 40);
    for (let i = 1; i <= 8; i++) rememberBuild({ owner: "o", repo: `r${i}`, sha: sha(i) });
    rememberBuild({ owner: "O", repo: "R8", sha: sha(9) });
    const list = recentBuilds();
    expect(list).toHaveLength(6);
    expect(list[0]).toEqual({ owner: "O", repo: "R8", sha: sha(9) });
    expect(list.filter((r) => r.repo.toLowerCase() === "r8")).toHaveLength(1);
    store.set("headcrawl.recent.v1", JSON.stringify([{ owner: "<b>", repo: "x", sha: "nope" }, 5, null]));
    expect(recentBuilds()).toEqual([]);
  });
});

describe("run log", () => {
  it("lists kills by type and bosses beaten", () => {
    const rooms = [room(), room({ kind: "lair" })];
    const game = new Game(spec([floor(rooms, [[0, 1]])]));
    game.player.killsBy = { bug: 3, tangle: 1 };
    game.player.bossNames = ["main, the Restless"];
    game.outcome = "won";
    const log = runLog(game, "https://x/");
    expect(log).toContain("Reached the bottom.");
    expect(log).toMatch(/3 bugs/);
    expect(log).toContain("main, the Restless");
  });
});
