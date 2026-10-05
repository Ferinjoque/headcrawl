import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { clearMonsters, labSpec, spawn } from "../src/game/lab";
import { REVIEW, flightPath, review, targets } from "../src/game/ranged";
import { decodeLog, encodeLog } from "../src/game/record";
import { loadSpec } from "../src/spec";

function arena(): Game {
  const res = loadSpec(JSON.stringify(labSpec()));
  if (!res.ok) throw new Error(res.error);
  const g = new Game(res.spec, { run: 4 });
  const room = g.floor.map.rooms[1];
  g.player.x = room.cx;
  g.player.y = room.cy;
  g.act({ type: "wait" });
  clearMonsters(g);
  g.floor.monsters = [];
  g.cheats.frozen = true;
  return g;
}

describe("review comments", () => {
  it("target what you can see in range, nearest first", () => {
    const g = arena();
    const near = spawn(g, "wall")!;
    near.x = g.player.x + 2;
    near.y = g.player.y;
    const far = spawn(g, "wall")!;
    far.x = g.player.x - 4;
    far.y = g.player.y;
    expect(targets(g).map((m) => m.id)).toEqual([near.id, far.id]);
  });

  it("hit the first monster on the line and then need a rest", () => {
    const g = arena();
    const front = spawn(g, "wall")!;
    front.x = g.player.x + 2;
    front.y = g.player.y;
    front.hp = front.maxHp = 999;
    const back = spawn(g, "wall")!;
    back.x = g.player.x + 4;
    back.y = g.player.y;
    back.hp = back.maxHp = 999;
    expect(flightPath(g, back.x, back.y).at(-1)).toEqual([front.x, front.y]);
    let landed = false;
    for (let i = 0; i < 6 && !landed; i++) {
      g.player.review = 0;
      expect(g.act({ type: "fire", dx: 4, dy: 0 })).toBe(true);
      landed = front.hp < 999;
    }
    expect(landed).toBe(true);
    expect(back.hp).toBe(999);
    expect(g.player.review).toBe(REVIEW.cooldown - 1);
    expect(g.act({ type: "fire", dx: 2, dy: 0 })).toBe(false);
  });

  it("do nothing at empty cells or out of range", () => {
    const g = arena();
    expect(review(g, 3, 0)).toBe(false);
    expect(review(g, REVIEW.range + 1, 0)).toBe(false);
    expect(g.player.review).toBe(0);
  });

  it("go in the run log as f plus the offset and come back the same", () => {
    const codes = ["l", "fka", "fka", "fff"];
    expect(encodeLog(codes)).toBe("lfka2fff");
    expect(decodeLog("lfka2fff")).toEqual([
      { type: "move", dx: 1, dy: 0 },
      { type: "fire", dx: 5, dy: -5 },
      { type: "fire", dx: 5, dy: -5 },
      { type: "fire", dx: 0, dy: 0 },
    ]);
    expect(decodeLog("fzz")).toBeNull();
  });
});
