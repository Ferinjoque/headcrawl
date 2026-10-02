import { describe, expect, it } from "vitest";
import { compareSpecs } from "../src/lite/compare";
import { enemy, floor, room, spec } from "./fixtures";

function build(ccns: Record<string, number>, todos: string[]) {
  const enemies = Object.entries(ccns).map(([name, ccn]) => enemy({ name, ccn }));
  const loot = todos.map((text, i) => ({ id: `l${i}x${text.length}`, kind: "potion" as const, tag: "TODO", text, line: 1, power: 3 }));
  const r = room({ id: "r1", path: "src/app.py", enemies, loot });
  return spec([floor([room({ id: "r0", path: "src/main.py" }), r, room({ id: "r2", kind: "lair" })], [[0, 1], [1, 2]])]);
}

describe("then vs now", () => {
  it("finds monsters that grew, shrank, appeared and vanished, and TODO churn", () => {
    const then = build({ parse: 3, render: 10, legacy: 5 }, ["fix later", "old idea"]);
    const now = build({ parse: 9, render: 4, shiny: 2 }, ["fix later", "new idea"]);
    const c = compareSpecs(then, now);
    expect(c.grew.map((g) => [g.name, g.before, g.after])).toEqual([["parse", 3, 9]]);
    expect(c.shrank.map((g) => [g.name, g.before, g.after])).toEqual([["render", 10, 4]]);
    expect(c.born).toBe(1);
    expect(c.slain).toBe(1);
    expect(c.todosAdded).toEqual(["TODO: new idea"]);
    expect(c.todosDone).toEqual(["TODO: old idea"]);
    expect(c.bossNow).toContain("main");
  });
});
