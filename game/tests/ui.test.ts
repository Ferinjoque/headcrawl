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

  it("refuses garbage and inflate bombs", () => {
    expect(decodeSpec("!!!")).toBeNull();
    expect(decodeSpec("AAAA")).toBeNull();
    const bomb = deflateSync(new Uint8Array(6 * 1024 * 1024));
    let bin = "";
    for (const b of bomb) bin += String.fromCharCode(b);
    const data = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeSpec(data)).toBeNull();
  });

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
