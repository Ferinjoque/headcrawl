import { describe, expect, it } from "vitest";
import { MoodTracker } from "../src/audio/mood";
import { MODES, bar, degree, depthOf, nextPick, tempoFor, theme } from "../src/audio/score";
import { Game } from "../src/game/game";
import { enemy, floor, room, spec } from "./fixtures";

const voices = (notes: { voice: string }[]) => new Set(notes.map((n) => n.voice));

describe("score", () => {
  it("gives the same commit the same theme, and another commit another one", () => {
    const a = theme("abc123", 0.5, "python", "parse_args");
    expect(theme("abc123", 0.5, "python", "parse_args")).toEqual(a);
    const others = ["def456", "0badf00d", "cafe1234", "1234abcd"].map((s) => theme(s, 0.5, "python", "parse_args"));
    expect(others.some((t) => t.root !== a.root || t.chords !== a.chords)).toBe(true);
  });

  it("goes darker with depth", () => {
    expect(theme("x", 0, "go", "b").mode).toEqual(MODES.dorian);
    expect(theme("x", 0.5, "go", "b").mode).toEqual(MODES.aeolian);
    expect(theme("x", 1, "go", "b").mode).toEqual(MODES.phrygian);
    expect(theme("x", 1, "go", "b").tempo).toBeGreaterThan(theme("x", 0, "go", "b").tempo);
    expect(depthOf(0, 1)).toBe(0);
    expect(depthOf(3, 4)).toBe(1);
  });

  it("picks a timbre from the language", () => {
    expect(theme("x", 0, "rust", "b").arpWave).toBe("pulse");
    expect(theme("x", 0, "cobol", "b").arpWave).toBe("triangle");
  });

  it("adds layers as things get dangerous", () => {
    const t = theme("abc", 0.4, "python", "boss");
    expect(voices(bar(t, "title", 0, 0))).toEqual(new Set(["pad", "arp"]));
    expect(voices(bar(t, "explore", 0, 0)).has("kick")).toBe(false);
    expect(voices(bar(t, "combat", 0, 0)).has("kick")).toBe(true);
    expect(voices(bar(t, "combat", 0, 0)).has("snare")).toBe(false);
    expect(voices(bar(t, "boss", 1, 0)).has("lead")).toBe(true);
    expect(voices(bar(t, "boss", 1, 0)).has("snare")).toBe(true);
  });

  it("drops to the pad for a few bars every so often", () => {
    const t = theme("abc", 0, "python", "boss");
    expect(voices(bar(t, "explore", 63, 0))).toEqual(new Set(["pad"]));
    expect(voices(bar(t, "explore", 10, 0)).has("arp")).toBe(true);
  });

  it("plays the ending once and then gets out of the way", () => {
    const t = theme("abc", 0, "python", "boss");
    expect(bar(t, "won", 0, 0).length).toBeGreaterThan(4);
    expect(bar(t, "won", 1, 0).length).toBe(1);
    expect(bar(t, "lost", 1, 0)).toEqual([]);
  });

  it("keeps every note inside the bar and the audible range", () => {
    const t = theme("abc", 1, "python", "boss");
    for (const mood of ["title", "explore", "combat", "boss", "rage"] as const) {
      for (let n = 0; n < 8; n++) {
        for (const note of bar(t, mood, n, n)) {
          expect(note.step).toBeGreaterThanOrEqual(0);
          expect(note.step).toBeLessThan(16);
          if (!["kick", "hat", "snare"].includes(note.voice)) {
            expect(note.midi).toBeGreaterThan(20);
            expect(note.midi).toBeLessThan(110);
          }
        }
      }
    }
  });

  it("walks scale degrees across octaves and keeps tempos sane", () => {
    const t = theme("abc", 0, "python", "boss");
    expect(degree(t, 7) - degree(t, 0)).toBe(12);
    expect(degree(t, -7) - degree(t, 0)).toBe(-12);
    expect(tempoFor(t, "title")).toBe(64);
    expect(tempoFor(t, "rage")).toBeLessThanOrEqual(110);
    expect(new Set([0.1, 0.7, 0.9].map((r) => nextPick(0, r))).size).toBe(3);
  });
});

describe("mood", () => {
  it("follows the fight and lets go after a while", () => {
    const foe = enemy({ archetype: "bug" });
    const game = new Game(spec([floor([room(), room({ enemies: [foe] }), room({ kind: "lair" })], [[0, 1], [1, 2]])]));
    // Sight is not what this tests.
    game.isVisible = () => true;
    const tracker = new MoodTracker();
    const m = game.floor.monsters.find((x) => !x.boss)!;
    for (const b of game.floor.monsters.filter((x) => x.boss)) b.awake = false;
    m.awake = false;
    m.x = 999;
    expect(tracker.mood(game, 0)).toBe("explore");
    m.awake = true;
    m.x = game.player.x + 1;
    m.y = game.player.y;
    expect(tracker.mood(game, 0)).toBe("combat");
    // Gone, but the fight was a second ago: still a fight.
    game.floor.monsters = game.floor.monsters.filter((x) => x !== m);
    expect(tracker.mood(game, 1000)).toBe("combat");
    game.player.turns += 20;
    expect(tracker.mood(game, 10_000)).toBe("explore");
    game.outcome = "dead";
    expect(tracker.mood(game, 10_000)).toBe("lost");
  });
});
