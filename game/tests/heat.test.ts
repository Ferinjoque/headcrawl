import { describe, expect, it } from "vitest";
import { heat, isLevel, levelName, modMonster } from "../src/game/extras";
import { Game } from "../src/game/game";
import { parseCode, runCode } from "../src/ui/codes";
import { parseRoute } from "../src/ui/share";
import { difficulties } from "../src/ui/settings";
import { nextSettings } from "../src/ui/settingsmenu";
import { defaults } from "../src/ui/settings";
import { floor, room, spec } from "./fixtures";

describe("heat", () => {
  it("counts up from hard", () => {
    expect(heat([])).toBe(0);
    expect(heat(["story"])).toBe(0);
    expect(heat(["hard"])).toBe(1);
    expect(heat(["legacy", "hard3"])).toBe(3);
    expect(isLevel("hard4") && !isLevel("hard5") && !isLevel("normal")).toBe(true);
    expect(levelName("hard2")).toBe("hard 2");
    expect(levelName("hard")).toBe("hard");
  });

  it("rides along in run codes and links", () => {
    const route = parseCode("flask-4821-hard3");
    expect(route).toEqual({ kind: "gallery", slug: "flask", run: 4821, level: "hard3" });
    expect(runCode(route!)).toBe("flask-4821-hard3");
    expect(parseCode("flask-4821-hard5")).toBeNull();
    expect(parseRoute("#/play/flask?run=2&level=hard2")).toMatchObject({ level: "hard2" });
    expect(parseRoute("#/play/flask?run=2&level=hard9").kind).toBe("title");
  });

  it("unlocks one heat past the hardest one cleared", () => {
    expect(difficulties(0)).toEqual(["normal", "hard", "story"]);
    expect(difficulties(2)).toEqual(["normal", "hard", "hard2", "hard3", "story"]);
    expect(difficulties(4)).toHaveLength(6);
    let s = defaults(false);
    const seen = [];
    for (let i = 0; i < 4; i++) seen.push((s = nextSettings(s, "level", 1)).level);
    expect(seen).toEqual(["hard", "hard2", "story", "normal"]);
  });

  it("makes bosses tougher from hard 3 and potions weaker from hard 2", () => {
    const game = new Game(spec([floor([room(), room({ kind: "lair" })], [[0, 1]])]), { run: 1 });
    const boss = game.floor.monsters.find((m) => m.boss)!;
    const hard = { ...boss };
    const hard3 = { ...boss };
    modMonster(hard, ["hard"]);
    modMonster(hard3, ["hard3"]);
    expect(hard3.maxHp).toBeGreaterThan(hard.maxHp);
    expect(hard3.speed).toBeGreaterThan(hard.speed);

    const heal = (mods: Game["mods"]) => {
      const g = new Game(spec([floor([room({ loot: [] }), room({ kind: "lair" })], [[0, 1]])]), { run: 1, mods });
      g.player.hp = 1;
      g.player.potions.push({ id: "p", kind: "potion", x: 0, y: 0, loot: null, source: "" });
      g.act({ type: "quaff" });
      return g.player.hp;
    };
    expect(heal(["hard2"])).toBeLessThan(heal(["hard"]));
  });
});
