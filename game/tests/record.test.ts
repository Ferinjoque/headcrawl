import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { botAction } from "../src/game/bot";
import { Game } from "../src/game/game";
import { actionCode, codeAction, decodeLog, encodeLog } from "../src/game/record";
import { loadSpec, type DungeonSpec } from "../src/spec";

function gallery(slug: string): DungeonSpec {
  const res = loadSpec(readFileSync(new URL(`../public/dungeons/${slug}.json`, import.meta.url), "utf8"));
  if (!res.ok) throw new Error(res.error);
  return res.spec;
}

describe("action log", () => {
  it("round-trips any sequence of codes", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(..."hjklyubn.>qrABC"), { maxLength: 300 }), (codes) => {
        const back = decodeLog(encodeLog(codes));
        expect(back?.map(actionCode)).toEqual(codes);
      }),
    );
    for (const c of "hjklyubn.>qrABC") expect(actionCode(codeAction(c)!)).toBe(c);
  });

  it("rejects garbage", () => {
    for (const bad of ["x", "l0", "l-1", "<script>", "l9999999", "q".repeat(10) + "?"]) expect(decodeLog(bad), bad).toBeNull();
    expect(decodeLog("")).toEqual([]);
  });

  it("replaying a bot's run rebuilds exactly the same game", () => {
    for (const slug of ["itsdangerous", "express"]) {
      const spec = gallery(slug);
      const live = new Game(spec, { run: 11 });
      for (let i = 0; i < 1500 && live.outcome === "playing"; i++) {
        live.act(botAction(live));
        live.drain();
      }
      const text = live.record();
      const again = Game.replay(spec, 11, text)!;
      expect(again.player).toEqual(live.player);
      expect(again.outcome).toBe(live.outcome);
      expect(again.floor.index).toBe(live.floor.index);
      expect(again.floor.monsters.map((m) => [m.id, m.x, m.y, m.hp])).toEqual(
        live.floor.monsters.map((m) => [m.id, m.x, m.y, m.hp]),
      );
      expect(text.length).toBeLessThan(live.log.length * 2 + 10);
    }
  }, 60_000);
});
