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

describe("the log by default", () => {
  it("never shows a raw function name while a bot plays a gallery dungeon", async () => {
    const { readFileSync } = await import("node:fs");
    const { loadSpec } = await import("../src/spec");
    const { botAction } = await import("../src/game/bot");
    const res = loadSpec(readFileSync(new URL("../public/dungeons/itsdangerous.json", import.meta.url), "utf8"));
    if (!res.ok) throw new Error(res.error);
    const raw = new Set(res.spec.floors.flatMap((f) => [f.boss.name, ...f.rooms.flatMap((r) => r.enemies.map((e) => e.name))]).filter((n) => n.includes("_")));
    const g = new Game(res.spec);
    const shown: string[] = [];
    for (let i = 0; i < 400 && g.outcome === "playing"; i++) {
      g.act(botAction(g));
      for (const e of g.drain()) {
        if (e.t !== "msg" || e.quiet) continue;
        const text = logText(e);
        if (text) shown.push(text);
      }
    }
    expect(shown.length).toBeGreaterThan(20);
    const leaks = shown.filter((t) => [...raw].some((n) => t.includes(n)));
    expect(leaks.join(" || ")).toBe("");
  });
});

describe("room names", () => {
  it("name a room after its file, in game words", async () => {
    const { roomLabel } = await import("../src/ui/detail");
    expect(roomLabel("tests/test_signer.py")).toBe("the Signer's room");
    expect(roomLabel("src/app/views.py")).toBe("the Views' room");
  });
});

describe("the killer's name", () => {
  it("is the game name on the death screen and in the result text", async () => {
    const { resultText } = await import("../src/ui/share");
    const { enemy } = await import("./fixtures");
    const g = new Game(spec([floor([room(), room({ enemies: [enemy({ name: "load_payload", damage: 99 })] })], [[0, 1]])]));
    const m = g.floor.monsters.find((x) => x.name === "load_payload")!;
    g.player.hp = 1;
    m.x = g.player.x + 1;
    m.y = g.player.y;
    m.awake = true;
    for (let i = 0; i < 20 && g.outcome === "playing"; i++) g.act({ type: "wait" });
    expect(g.killer).toBe("load_payload");
    expect(g.killerLabel).toBe("Payload Loader");
    expect(resultText(g, "")).toContain("died to Payload Loader");
  });
});
