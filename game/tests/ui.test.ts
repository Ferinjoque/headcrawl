import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "fflate";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { autoAction } from "../src/game/auto";
import { Game } from "../src/game/game";
import { loadSpec } from "../src/spec";
import { decodeSpec, encodeSpec, parseRoute, resultText, routeHash, type Route } from "../src/ui/share";
import { floor, room, spec } from "./fixtures";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("safety", () => {
  it("never writes HTML from strings", () => {
    const src = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
    for (const f of files(src).filter((p) => p.endsWith(".ts"))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    }
  });

  it("rejects broken and hostile dungeon files", () => {
    expect(loadSpec("not json").ok).toBe(false);
    expect(loadSpec("{}").ok).toBe(false);
    expect(loadSpec("x".repeat(9 * 1024 * 1024)).ok).toBe(false);
    const s = spec([floor([room(), room()], [[0, 1]])]);
    expect(loadSpec(JSON.stringify(s)).ok).toBe(true);
    const cut = structuredClone(s);
    cut.floors[0].edges = [];
    expect(loadSpec(cut)).toMatchObject({ ok: false });
    const dup = structuredClone(s);
    dup.floors[0].rooms[1].id = dup.floors[0].rooms[0].id;
    expect(loadSpec(dup).ok).toBe(false);
    const extra = { ...s, evil: "<script>" };
    expect(loadSpec(extra).ok).toBe(false);
  });
});

describe("share", () => {
  it("round-trips any text through the URL encoding", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2000 }), (text) => {
        expect(decodeSpec(encodeSpec(text))).toBe(text);
        expect(encodeSpec(text)).toMatch(/^[A-Za-z0-9_-]*$/);
      }),
    );
  });

  it("refuses garbage and inflate bombs without inflating them", () => {
    expect(decodeSpec("!!!")).toBeNull();
    expect(decodeSpec("AAAA")).toBeNull();
    expect(decodeSpec("A".repeat(1024 * 1024 + 1))).toBeNull();
    const bomb = deflateSync(new Uint8Array(64 * 1024 * 1024));
    let bin = "";
    for (const b of bomb) bin += String.fromCharCode(b);
    const data = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const before = process.memoryUsage().arrayBuffers;
    const started = performance.now();
    expect(decodeSpec(data)).toBeNull();
    expect(performance.now() - started).toBeLessThan(5000);
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(32 * 1024 * 1024);
  }, 30_000);

  it("parses and prints routes", () => {
    const routes: Route[] = [
      { kind: "title" },
      { kind: "gallery", slug: "flask", run: 0 },
      { kind: "gallery", slug: "flask", run: 42 },
      { kind: "custom", run: 3, data: "abc_-1" },
    ];
    for (const r of routes) expect(parseRoute(routeHash(r))).toEqual(r);
    expect(parseRoute("#/play/../../etc")).toEqual({ kind: "title" });
    expect(parseRoute("#/play/<img>")).toEqual({ kind: "title" });
    expect(parseRoute("")).toEqual({ kind: "title" });
  });

  it("writes a result line people can paste", () => {
    const game = new Game(spec([floor([room(), room({ kind: "lair" })], [[0, 1]])]));
    const text = resultText(game, "https://x/#/play/t");
    expect(text).toContain("test/repo @0123456");
    expect(text).toContain("floor 1/1");
    expect(text.split("\n")).toHaveLength(4);
  });
});

describe("auto", () => {
  it("explores a quiet floor until everything is seen, and rests to full", () => {
    const rooms = [room(), room(), room(), room({ kind: "lair" })];
    const game = new Game(spec([floor(rooms, [[0, 1], [1, 2], [2, 3]])]));
    game.floor.monsters = [];
    for (let i = 0; i < 2000; i++) {
      const a = autoAction(game, { kind: "explore" });
      if (!a) break;
      game.act(a);
    }
    for (const r of game.floor.map.rooms) expect(game.floor.seen[game.floor.map.grid.idx(r.cx, r.cy)]).toBe(1);

    game.player.hp = 3;
    for (let i = 0; i < 500; i++) {
      const a = autoAction(game, { kind: "rest", startHp: 3 });
      if (!a) break;
      game.act(a);
    }
    expect(game.player.hp).toBe(game.player.maxHp);

    const target = game.floor.map.lair;
    for (let i = 0; i < 500; i++) {
      const a = autoAction(game, { kind: "travel", to: [target.cx, target.cy] });
      if (!a) break;
      game.act(a);
    }
    expect([game.player.x, game.player.y]).toEqual([target.cx, target.cy]);
  });
});

describe("daily", () => {
  it("is stable for a day and moves on the next", async () => {
    const { dailyPick } = await import("../src/ui/daily");
    const entries = ["a", "b", "c", "d", "e"].map((slug) => ({ slug }));
    const a = dailyPick(entries, new Date("2026-10-02T01:00:00Z"))!;
    const b = dailyPick(entries, new Date("2026-10-02T23:00:00Z"))!;
    expect(b).toEqual(a);
    expect(a.run).toBe(20261002);
    expect(a.label).toBe("2026-10-02");
    const days = new Set(Array.from({ length: 30 }, (_, i) => dailyPick(entries, new Date(Date.UTC(2026, 9, 1 + i)))!.entry.slug));
    expect(days.size).toBeGreaterThan(2);
    expect(dailyPick([], new Date())).toBeNull();
  });
});

describe("best runs", () => {
  it("keeps the better run and survives broken storage", async () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    (globalThis as { localStorage?: unknown }).localStorage = fake;
    const { bestFor, bestLabel, recordRun } = await import("../src/ui/best");
    expect(bestFor("h")).toBeNull();
    expect(recordRun("h", { floor: 2, floors: 5, won: false, turns: 300 })).toBe(true);
    expect(recordRun("h", { floor: 1, floors: 5, won: false, turns: 100 })).toBe(false);
    expect(recordRun("h", { floor: 5, floors: 5, won: true, turns: 900 })).toBe(true);
    expect(bestLabel(bestFor("h"))).toBe("cleared in 900 turns");
    store.set("headcrawl.best.v1", "{broken");
    expect(bestFor("h")).toBeNull();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(bestFor("h")).toBeNull();
    expect(recordRun("h", { floor: 1, floors: 1, won: true, turns: 1 })).toBe(false);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
