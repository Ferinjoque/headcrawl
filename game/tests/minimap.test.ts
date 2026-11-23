import { describe, expect, it } from "vitest";
import { seenBox } from "../src/render/minimap";

function seenAt(width: number, height: number, cells: [number, number][]): Uint8Array {
  const seen = new Uint8Array(width * height);
  for (const [x, y] of cells) seen[y * width + x] = 1;
  return seen;
}

describe("minimap crop", () => {
  it("shows the whole floor before anything is seen", () => {
    expect(seenBox(new Uint8Array(40 * 20), 40, 20)).toEqual({ x0: 0, y0: 0, x1: 39, y1: 19 });
  });

  it("crops to what was seen plus a margin", () => {
    const seen = seenAt(40, 20, [[10, 8], [14, 9]]);
    expect(seenBox(seen, 40, 20)).toEqual({ x0: 7, y0: 6, x1: 17, y1: 11 });
  });

  it("never leaves the floor at the edges", () => {
    const seen = seenAt(40, 20, [[0, 0], [39, 19]]);
    expect(seenBox(seen, 40, 20)).toEqual({ x0: 0, y0: 0, x1: 39, y1: 19 });
  });
});
