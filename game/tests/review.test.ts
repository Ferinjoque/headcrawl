// Regressions from the round 5 code review.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MoodTracker } from "../src/audio/mood";
import { timeTravel } from "../src/game/extras";
import { Game } from "../src/game/game";
import { RULES } from "../src/game/record";
import { findSave, putSave } from "../src/ui/save";
import { parseRoute, playRoute, routeHash } from "../src/ui/share";
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

describe("review fixes", () => {
  it("time travel works once per boss", () => {
    const f = floor([room(), room({ kind: "lair" })], [[0, 1]]);
    f.boss = { ...f.boss, ccn: 20, past: { year: 2021, ccn: 10, nloc: 40 } };
    const game = new Game(spec([f]));
    const boss = game.floor.monsters.find((m) => m.boss)!;
    timeTravel(boss);
    const hp = boss.maxHp;
    expect(timeTravel(boss)).toBeNull();
    expect(boss.maxHp).toBe(hp);
    // The spec itself is untouched, so the next run gets its past back.
    expect(f.boss.past).toBeTruthy();
  });

  it("a new run does not inherit the last run's fight music", () => {
    const s = spec([floor([room(), room({ enemies: [enemy()] }), room({ kind: "lair" })], [[0, 1], [1, 2]])]);
    const tracker = new MoodTracker();
    const old = new Game(s);
    old.isVisible = () => true;
    old.player.turns = 400;
    const m = old.floor.monsters.find((x) => !x.boss)!;
    m.awake = true;
    m.x = old.player.x + 1;
    m.y = old.player.y;
    for (const b of old.floor.monsters.filter((x) => x.boss)) b.awake = false;
    expect(tracker.mood(old, 0)).toBe("combat");
    const fresh = new Game(s);
    for (const b of fresh.floor.monsters) b.awake = false;
    expect(tracker.mood(fresh, 60_000)).toBe("explore");
  });

  it("saves keep vendor moves and drop saves from older rules", () => {
    putSave({ rules: RULES, hash: "#/play/a?run=1", repo: "a", log: "l3VX.", floor: 1, floors: 2, at: 1 });
    expect(findSave("#/play/a?run=1")?.log).toBe("l3VX.");
    putSave({ hash: "#/play/b?run=1", repo: "b", log: "l3", floor: 1, floors: 2, at: 1 });
    expect(findSave("#/play/b?run=1")).toBeNull();
  });

  it("replay links say which rules they were recorded under", () => {
    const r = parseRoute(`#/play/flask?run=4&watch=abc&v=${RULES}`);
    expect(r).toMatchObject({ kind: "gallery", watch: "abc", v: RULES });
    expect(parseRoute(routeHash(r))).toEqual(r);
    expect(playRoute(r as never)).toEqual({ kind: "gallery", slug: "flask", run: 4 });
    // Without a log the version means nothing and is dropped.
    expect(parseRoute("#/play/flask?run=4&v=2")).toEqual({ kind: "gallery", slug: "flask", run: 4 });
  });
});
