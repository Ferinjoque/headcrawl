import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { parseCode, runCode } from "../src/ui/codes";
import { nextSettings } from "../src/ui/settingsmenu";
import { defaults } from "../src/ui/settings";
import { parseRoute, playRoute, routeHash } from "../src/ui/share";
import { enemy, floor, room, spec } from "./fixtures";

describe("difficulty", () => {
  it("travels in run codes and links, and stays with the run", () => {
    const r = { kind: "gallery" as const, slug: "flask", run: 4821, level: "hard" as const };
    expect(runCode(r)).toBe("flask-4821-hard");
    expect(parseCode("flask-4821-hard")).toEqual(r);
    expect(parseCode("Flask-4821-STORY")).toEqual({ ...r, level: "story" });
    expect(parseCode("pallets/flask@672971d-4821-hard")).toMatchObject({ kind: "github", level: "hard" });
    expect(parseCode("flask-4821-nightmare")).toBeNull();
    expect(parseRoute(routeHash(r))).toEqual(r);
    expect(playRoute(r)).toEqual(r);
    expect(parseRoute("#/play/flask?run=4&level=nightmare")).toEqual({ kind: "title" });
  });

  it("changes the monsters, not the map", () => {
    const s = spec([floor([room(), room({ enemies: [enemy({ hp: 20, damage: 8 })] }), room({ kind: "lair" })], [[0, 1], [1, 2]])]);
    const pick = (g: Game) => g.floor.monsters.find((m) => !m.boss)!;
    const normal = pick(new Game(s));
    const hard = pick(new Game(s, { mods: ["hard"] }));
    const story = pick(new Game(s, { mods: ["story"] }));
    expect(hard.maxHp).toBeGreaterThan(normal.maxHp);
    expect(hard.damage).toBeGreaterThan(normal.damage);
    expect(story.damage).toBeLessThan(normal.damage);
    expect([hard.x, hard.y]).toEqual([normal.x, normal.y]);
  });

  it("cycles normal, hard, story in settings", () => {
    const a = defaults(false);
    expect(a.level).toBe("normal");
    const b = nextSettings(a, "level");
    expect(b.level).toBe("hard");
    expect(nextSettings(nextSettings(b, "level"), "level").level).toBe("normal");
    expect(a.level).toBe("normal");
  });
});
