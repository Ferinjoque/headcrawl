import { describe, expect, it } from "vitest";
import { LOOT, MONSTERS, PLACES } from "../src/ui/glossary";
import { PERKS } from "../src/game/perks";
import { AFFIX } from "../src/game/elites";
import { BOSS_STYLE } from "../src/game/bossmoves";

// Words a player who doesn't code wouldn't know. They're fine in the `real`
// line and in flavor, but what a thing does has to make sense without them.
const JARGON = /\b(TODO|FIXME|HACK|XXX|commit|branch|merge|checkout|HEAD|churn|nest(ed|ing)|param|args?|refactor|deprecat|dependenc|import)/i;

describe("glossary", () => {
  const terms = [...Object.values(MONSTERS), ...Object.values(LOOT), ...PLACES];

  it("names every thing and says where it comes from", () => {
    for (const t of terms) {
      expect(t.name.trim()).not.toBe("");
      expect(t.real.trim()).not.toBe("");
    }
  });

  it("says what things do in plain words", () => {
    for (const t of terms) expect(t.does, t.name).not.toMatch(JARGON);
    for (const p of Object.values(PERKS)) expect(p.text, p.name).not.toMatch(JARGON);
  });

  it("gives elites and boss styles plain names", () => {
    for (const a of Object.values(AFFIX)) expect(a.name).not.toMatch(JARGON);
    for (const s of Object.values(BOSS_STYLE)) expect(s.name).not.toMatch(JARGON);
  });

  it("explains every tool in a line", () => {
    for (const p of Object.values(PERKS)) expect(p.about.length, p.name).toBeGreaterThan(5);
  });
});
