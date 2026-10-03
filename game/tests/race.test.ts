import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { botAction } from "../src/game/bot";
import { Game } from "../src/game/game";
import { ghostAt, ghostFor, keepGhost, trackOf } from "../src/ui/ghostrun";
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

function dungeon() {
  return spec([floor([room(), room({ enemies: [enemy(), enemy()] }), room({ kind: "lair" })], [[0, 1], [1, 2]])]);
}

describe("ghost race", () => {
  it("retraces a run turn by turn", () => {
    const s = dungeon();
    const game = new Game(s, { run: 7 });
    const seen: [number, number][] = [[game.player.x, game.player.y]];
    for (let i = 0; i < 120 && game.outcome === "playing"; i++) {
      const before = game.player.turns;
      game.act(botAction(game));
      if (game.player.turns !== before) seen.push([game.player.x, game.player.y]);
    }
    const track = trackOf(s, 7, [], game.record())!;
    for (let t = 0; t < seen.length; t++) expect(ghostAt(track, t, 0)).toEqual(seen[t]);
    // Past its last turn the ghost waits where it stopped; another floor shows nothing.
    expect(ghostAt(track, 99999, 0)).toEqual(seen.at(-1));
    expect(ghostAt(track, 0, 3)).toBeNull();
    expect(trackOf(s, 7, [], "not a log!")).toBeNull();
  });

  it("keeps only the better run per dungeon", () => {
    expect(keepGhost("#/play/t?run=1", { log: "l10", won: false, floor: 1, turns: 10 })).toBe(true);
    expect(keepGhost("#/play/t?run=1", { log: "l20", won: false, floor: 1, turns: 20 })).toBe(false);
    expect(keepGhost("#/play/t?run=1", { log: "l30", won: true, floor: 1, turns: 30 })).toBe(true);
    expect(ghostFor("#/play/t?run=1")?.log).toBe("l30");
    expect(keepGhost("", { log: "l9", won: true, floor: 1, turns: 9 })).toBe(false);
  });

  it("travels in links and drops off for the plain route", () => {
    const r = parseRoute("#/play/flask?run=4&race=abc_-1");
    expect(r).toEqual({ kind: "gallery", slug: "flask", run: 4, race: "abc_-1" });
    expect(parseRoute(routeHash(r))).toEqual(r);
    expect(playRoute(r as never)).toEqual({ kind: "gallery", slug: "flask", run: 4 });
    expect(parseRoute("#/play/flask?race=<x>")).toEqual({ kind: "title" });
  });
});
