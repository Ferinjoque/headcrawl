import { afterEach, describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { pickUp } from "../src/game/items";
import { codeEverywhere, logText, roomName, setCodeDetail } from "../src/ui/detail";
import { defaults } from "../src/ui/settings";
import { nextSettings } from "../src/ui/settingsmenu";
import { floor, room, spec } from "./fixtures";

afterEach(() => setCodeDetail("hover"));

describe("code details", () => {
  it("start on hover and toggle with the setting", () => {
    const s = defaults(false);
    expect(s.code).toBe("hover");
    expect(nextSettings(s, "code").code).toBe("all");
    expect(nextSettings(nextSettings(s, "code"), "code").code).toBe("hover");
  });

  it("pick the plain log line unless asked for the code", () => {
    const e = { text: "You see the whole floor at once.", full: "You see the whole floor at once. Thanks, git blame." };
    expect(logText(e)).toBe(e.text);
    setCodeDetail("all");
    expect(codeEverywhere()).toBe(true);
    expect(logText(e)).toBe(e.full);
  });

  it("skip lines that only exist with the code in them", () => {
    expect(logText({ text: "", full: 'Last change here: "fix typo"' })).toBeNull();
    setCodeDetail("all");
    expect(logText({ text: "", full: 'Last change here: "fix typo"' })).toBe('Last change here: "fix typo"');
  });

  it("name a room by its file, without folders", () => {
    expect(roomName("src/app/views.py")).toBe("views.py");
    expect(roomName("main.go")).toBe("main.go");
  });

  it("keep the full line in the run log and the plain one in the event", () => {
    const g = new Game(spec([floor([room(), room()], [[0, 1]])]));
    g.drain();
    const item = { id: "i1", kind: "potion" as const, x: g.player.x, y: g.player.y, source: "src/a.py:3", loot: { tag: "TODO", text: "fix this", year: 2019, author: "sam", file: "src/a.py", line: 3 } };
    pickUp(g, item as never);
    const msg = g.drain().find((e) => e.t === "msg");
    expect(msg && msg.t === "msg" && msg.text).toBe('You pick up a potion, a note from 2019: "fix this". q drinks it.');
    expect(msg && msg.t === "msg" && msg.full).toContain("TODO from 2019 by sam");
    expect(g.journal.at(-1)).toContain("src/a.py:3");
  });
});
