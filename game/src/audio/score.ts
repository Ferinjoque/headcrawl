// The music, as numbers. Everything here is pure: a repo's HEAD, the floor
// and the mood go in, and the notes for one bar come out. The same commit
// always gets the same theme, so a dungeon sounds like itself.
//
// Mood brief (docs/RESEARCH.md has the sources): dark synth with a sly lift.
// Shallow floors sit in Dorian, the middle in Aeolian, the deep end in
// Phrygian. Combat adds drums on the next bar, bosses get a motif built from
// their name, and every so often everything but the pad drops out so a long
// session doesn't wear on the ear. Each language brings its own instruments.
// The vendor plays lounge music, menus hush everything down, and building a
// repo sounds like a machine thinking.

import { Rng } from "../core/rng";

export type Mood = "title" | "explore" | "combat" | "boss" | "rage" | "won" | "lost" | "menu" | "shop" | "build";

export type Voice = "pad" | "arp" | "bass" | "kick" | "hat" | "snare" | "lead" | "bell" | "ghost";

export interface Note {
  voice: Voice;
  /** Sixteenth inside the bar, 0..15. */
  step: number;
  /** MIDI note number; drums ignore it. */
  midi: number;
  /** Length in sixteenths. */
  len: number;
  vel: number;
}

export type Wave = "triangle" | "square" | "sawtooth" | "pulse";

export interface Theme {
  root: number;
  tempo: number;
  mode: number[];
  /** Scale degrees of the four chords the floor cycles through. */
  chords: number[];
  /** Five scale degrees the boss plays, from the boss's name. */
  motif: number[];
  /** The floor's main language picks the instruments. */
  arpWave: Wave;
  padWave: "sawtooth" | "square" | "triangle";
  bassWave: "square" | "sawtooth" | "triangle";
  /** How much of the arpeggio goes into the echo, 0..0.5. */
  echo: number;
  /** The top arpeggio note: 7 is the octave, 8 the ninth, 5 the sixth. */
  color: number;
}

/** Things happening on top of the mood, each with its own layer. */
export interface Extras {
  /** A ghost is in sight. */
  ghost?: boolean;
  /** A daily run: a bell marks every eighth bar. */
  daily?: boolean;
}

export const MODES: Record<string, number[]> = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

const PROGRESSIONS = [
  [0, 5, 3, 4],
  [0, 3, 6, 4],
  [0, 6, 5, 6],
  [0, 4, 5, 3],
  [0, 2, 5, 4],
  [0, 5, 6, 4],
];

// Sixteen steps each. Numbers are chord tones (0 root, 1 third, 2 fifth,
// 3 the language's colour tone), -1 is a rest. Eight of them so the line
// doesn't loop audibly.
const ARPS = [
  [0, -1, 1, -1, 2, -1, 1, -1, 3, -1, 2, -1, 1, -1, 2, -1],
  [0, -1, -1, 2, -1, -1, 1, -1, 0, -1, -1, 2, -1, 3, -1, -1],
  [2, -1, 1, -1, 0, -1, -1, -1, 2, -1, 3, -1, 2, -1, -1, -1],
  [0, 1, 2, -1, -1, -1, 3, -1, 2, 1, 0, -1, -1, -1, -1, -1],
  [-1, -1, 0, -1, -1, -1, 2, -1, -1, -1, 1, -1, -1, -1, 3, -1],
  [0, -1, 2, -1, 3, -1, 2, -1, 0, -1, 2, -1, 3, -1, 1, -1],
  [3, -1, -1, 2, -1, -1, 1, -1, -1, 0, -1, -1, 1, -1, 2, -1],
  [0, -1, -1, -1, 1, -1, -1, -1, 2, -1, -1, -1, 1, -1, -1, -1],
];

type Voices = Pick<Theme, "arpWave" | "padWave" | "bassWave" | "echo" | "color">;

// Instruments per language. Scripting languages get soft, round sounds and
// open colour tones; systems languages get hard pulses and dry echoes; the
// enterprise ones get a sixth on top, like a film score that's trying.
const LANGUAGE: Record<string, Voices> = {
  python: { arpWave: "triangle", padWave: "sawtooth", bassWave: "triangle", echo: 0.32, color: 8 },
  ruby: { arpWave: "triangle", padWave: "sawtooth", bassWave: "triangle", echo: 0.38, color: 8 },
  javascript: { arpWave: "sawtooth", padWave: "sawtooth", bassWave: "square", echo: 0.42, color: 7 },
  typescript: { arpWave: "sawtooth", padWave: "sawtooth", bassWave: "square", echo: 0.36, color: 8 },
  php: { arpWave: "sawtooth", padWave: "square", bassWave: "square", echo: 0.4, color: 5 },
  go: { arpWave: "pulse", padWave: "triangle", bassWave: "square", echo: 0.18, color: 7 },
  rust: { arpWave: "pulse", padWave: "square", bassWave: "sawtooth", echo: 0.22, color: 8 },
  c: { arpWave: "square", padWave: "triangle", bassWave: "square", echo: 0.12, color: 7 },
  cpp: { arpWave: "square", padWave: "triangle", bassWave: "sawtooth", echo: 0.15, color: 8 },
  java: { arpWave: "triangle", padWave: "sawtooth", bassWave: "triangle", echo: 0.3, color: 5 },
  kotlin: { arpWave: "triangle", padWave: "sawtooth", bassWave: "square", echo: 0.3, color: 5 },
  csharp: { arpWave: "triangle", padWave: "sawtooth", bassWave: "triangle", echo: 0.28, color: 5 },
  swift: { arpWave: "sawtooth", padWave: "triangle", bassWave: "triangle", echo: 0.35, color: 8 },
};
const DEFAULT_VOICES: Voices = { arpWave: "triangle", padWave: "sawtooth", bassWave: "square", echo: 0.28, color: 7 };

export function voicesFor(language: string): Voices {
  return LANGUAGE[language] ?? DEFAULT_VOICES;
}

/** How deep a floor is, 0 at the top and 1 at the bottom. */
export function depthOf(index: number, floors: number): number {
  return floors > 1 ? index / (floors - 1) : 0;
}

export function theme(seed: string, depth: number, language: string, boss: string): Theme {
  const rng = new Rng(`music/${seed}`);
  const root = 45 + rng.int(0, 7);
  const mode = depth < 0.34 ? MODES.dorian : depth < 0.67 ? MODES.aeolian : MODES.phrygian;
  // Each floor gets its own progression, but the repo's root stays put.
  const floorRng = new Rng(`music/${seed}/${depth.toFixed(3)}`);
  const chords = PROGRESSIONS[floorRng.int(0, PROGRESSIONS.length - 1)];
  const bossRng = new Rng(`motif/${boss}`);
  const motif = Array.from({ length: 5 }, () => bossRng.int(0, 7));
  return { root, tempo: Math.round(76 + depth * 16), mode, chords, motif, ...voicesFor(language) };
}

/** MIDI note for a scale degree, wrapping into higher octaves. */
export function degree(t: Theme, d: number, octave = 0): number {
  const n = t.mode.length;
  const o = Math.floor(d / n);
  const i = ((d % n) + n) % n;
  return t.root + t.mode[i] + 12 * (o + octave);
}

function chordTones(t: Theme, deg: number): number[] {
  return [degree(t, deg, 1), degree(t, deg + 2, 1), degree(t, deg + 4, 1), degree(t, deg + t.color, 1)];
}

/** Bars between breathers, and how long a breather lasts. */
const BREATHE_EVERY = 64;
const BREATHE_FOR = 8;

/** The notes for bar number `n` (counted from when the mood started). */
export function bar(t: Theme, mood: Mood, n: number, pick: number, extras: Extras = {}): Note[] {
  const notes = moodBar(t, mood, n, pick);
  const deg = t.chords[n % t.chords.length];
  if (extras.daily && n % 8 === 0 && mood !== "won" && mood !== "lost") {
    // The daily bell: root and fifth, high and clear, once every eight bars.
    notes.push({ voice: "bell", step: 0, midi: degree(t, 0, 3), len: 8, vel: 0.5 });
    notes.push({ voice: "bell", step: 6, midi: degree(t, 4, 2), len: 8, vel: 0.35 });
  }
  if (extras.ghost && (mood === "explore" || mood === "combat")) {
    // Dead code hums: two high, wavering notes a tritone apart.
    const r = degree(t, deg, 3);
    notes.push({ voice: "ghost", step: 0, midi: r, len: 8, vel: 0.4 });
    notes.push({ voice: "ghost", step: 8, midi: r + 6, len: 8, vel: 0.3 });
  }
  return notes;
}

function moodBar(t: Theme, mood: Mood, n: number, pick: number): Note[] {
  const notes: Note[] = [];
  const deg = t.chords[n % t.chords.length];
  const tones = chordTones(t, deg);
  const breathe = (mood === "explore" || mood === "title") && n % BREATHE_EVERY >= BREATHE_EVERY - BREATHE_FOR;

  if (mood === "won") return ending(t, n);
  if (mood === "lost") {
    // One low chord in the parallel minor, then nothing.
    if (n > 0) return [];
    const minor = { ...t, mode: MODES.aeolian };
    for (const d of [0, 2, 4]) notes.push({ voice: "pad", step: 0, midi: degree(minor, d, 0), len: 32, vel: 0.5 });
    return notes;
  }
  if (mood === "shop") return shop(t, n);
  if (mood === "build") return build(t, n);
  if (mood === "menu") {
    // Hushed: the chord and a single soft note, so a menu never feels like a fight.
    for (const m of tones.slice(0, 3)) notes.push({ voice: "pad", step: 0, midi: m - 12, len: 16, vel: 0.22 });
    notes.push({ voice: "arp", step: 8, midi: tones[(n >> 1) % 3], len: 2, vel: 0.25 });
    return notes;
  }

  // Pad: the chord, held for the bar.
  for (const m of tones.slice(0, 3)) notes.push({ voice: "pad", step: 0, midi: m - 12, len: 16, vel: 0.35 });
  if (breathe) return notes;

  // Arpeggio: one of eight phrases, chosen by the caller's walk.
  const pattern = ARPS[pick % ARPS.length];
  const slow = mood === "title";
  pattern.forEach((tone, step) => {
    if (tone < 0 || (slow && step % 4 !== 0)) return;
    notes.push({ voice: "arp", step, midi: tones[tone] + (mood === "rage" ? 12 : 0), len: 1, vel: mood === "explore" ? 0.45 : 0.6 });
  });
  if (mood === "title") return notes;

  // Bass: whole notes while exploring, eighths in a fight, sixteenths for a boss.
  const root = degree(t, deg, -1);
  const fifth = degree(t, deg + 4, -1);
  const every = mood === "explore" ? 16 : mood === "combat" ? 2 : 1;
  for (let s = 0; s < 16; s += every) {
    notes.push({ voice: "bass", step: s, midi: s % 8 === 6 ? fifth : root, len: Math.min(every, 16), vel: every === 16 ? 0.5 : 0.42 });
  }
  if (mood === "explore") return notes;

  // Drums, only when something wants you dead.
  for (const s of [0, 8]) notes.push({ voice: "kick", step: s, midi: 0, len: 1, vel: 0.8 });
  if (mood !== "combat") notes.push({ voice: "kick", step: 11, midi: 0, len: 1, vel: 0.5 });
  for (let s = 2; s < 16; s += 4) notes.push({ voice: "hat", step: s, midi: 0, len: 1, vel: 0.35 });
  if (mood === "boss" || mood === "rage") {
    for (const s of [4, 12]) notes.push({ voice: "snare", step: s, midi: 0, len: 1, vel: 0.6 });
    // The boss's own five notes on the second and fourth bar of the cycle.
    if (n % 2 === 1) {
      t.motif.forEach((d, i) => notes.push({ voice: "lead", step: i * 3, midi: degree(t, d + deg, 2), len: 2, vel: 0.5 }));
    }
  }
  return notes;
}

/** A rising Lydian run that lands on the root, once, then a held chord. */
function ending(t: Theme, n: number): Note[] {
  if (n > 0) return [{ voice: "pad", step: 0, midi: degree(t, 0, 1), len: 16, vel: 0.5 }];
  const lyd = { ...t, mode: MODES.lydian };
  const notes: Note[] = [];
  for (let i = 0; i < 8; i++) notes.push({ voice: "arp", step: i * 2, midi: degree(lyd, i, 2), len: 2, vel: 0.7 });
  notes.push({ voice: "pad", step: 0, midi: degree(lyd, 0, 1), len: 16, vel: 0.6 });
  return notes;
}

// The vendor: lounge music in Lydian, a walking bass and brushed hats. It
// should sound like a shop that has been open too long.
const SHOP_CHORDS = [0, 3, 1, 4];
const SHOP_MELODY = [4, -1, 2, -1, 3, -1, -1, 1, 2, -1, 0, -1, -1, -1, -1, -1];

function shop(t: Theme, n: number): Note[] {
  const lyd = { ...t, mode: MODES.lydian };
  const deg = SHOP_CHORDS[n % SHOP_CHORDS.length];
  const notes: Note[] = [];
  for (const d of [0, 2, 4, 6]) notes.push({ voice: "pad", step: 0, midi: degree(lyd, deg + d, 0), len: 16, vel: 0.25 });
  SHOP_MELODY.forEach((d, step) => {
    if (d >= 0 && (n % 2 === 0 || step < 8)) notes.push({ voice: "arp", step, midi: degree(lyd, deg + d, 2), len: 2, vel: 0.4 });
  });
  for (const [s, d] of [[0, 0], [4, 2], [8, 4], [12, 5]] as const) {
    notes.push({ voice: "bass", step: s, midi: degree(lyd, deg + d, -1), len: 3, vel: 0.35 });
  }
  for (const s of [4, 10, 12]) notes.push({ voice: "hat", step: s, midi: 0, len: 1, vel: 0.18 });
  return notes;
}

// Building a repo: a fast, rising square arpeggio over one chord, like a
// progress bar that hums. No drums, no bass: it is thinking, not fighting.
function build(t: Theme, n: number): Note[] {
  const notes: Note[] = [];
  const deg = [0, 2, 4, 5][n % 4];
  for (let s = 0; s < 16; s++) {
    notes.push({ voice: "arp", step: s, midi: degree(t, deg + [0, 2, 4, 7][s % 4], 1 + (s >> 3)), len: 1, vel: 0.55 });
  }
  notes.push({ voice: "pad", step: 0, midi: degree(t, deg, 0), len: 16, vel: 0.35 });
  return notes;
}

/** Next phrase in the arp walk: usually a neighbour, sometimes a jump. */
export function nextPick(current: number, roll: number): number {
  if (roll < 0.6) return (current + 1) % ARPS.length;
  if (roll < 0.85) return (current + 3) % ARPS.length;
  return (current + 5) % ARPS.length;
}

export function tempoFor(t: Theme, mood: Mood): number {
  if (mood === "title" || mood === "menu") return 64;
  if (mood === "shop") return 92;
  if (mood === "build") return 132;
  if (mood === "boss") return t.tempo + 8;
  if (mood === "rage") return t.tempo + 16;
  return t.tempo;
}

export function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
