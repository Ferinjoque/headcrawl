// Colors are picked in OKLCH (see DESIGN.md) and turned into sRGB once, so
// the renderer can scale brightness with plain numbers every frame.

export type RGB = readonly [number, number, number];

export function oklch(l: number, c: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const gamma = (x: number) => {
    const v = Math.max(0, Math.min(1, x));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  };
  return [Math.round(gamma(lin[0]) * 255), Math.round(gamma(lin[1]) * 255), Math.round(gamma(lin[2]) * 255)];
}

const GLOW = {
  ink: oklch(0.14, 0.02, 20),
  ember: oklch(0.66, 0.17, 45),
  brick: oklch(0.8, 0.15, 62),
  floor: oklch(0.62, 0.2, 345),
  current: oklch(0.64, 0.17, 255),
  currentDeep: oklch(0.3, 0.1, 260),
  passage: oklch(0.6, 0.04, 255),
  loot: oklch(0.86, 0.22, 140),
  hp: oklch(0.82, 0.19, 150),
  danger: oklch(0.68, 0.23, 25),
  boss: oklch(0.72, 0.26, 340),
  player: oklch(0.97, 0.03, 90),
  gold: oklch(0.88, 0.16, 90),
  text: oklch(0.92, 0.02, 70),
  dim: oklch(0.7, 0.03, 60),
  shrine: oklch(0.85, 0.17, 165),
  violet: oklch(0.7, 0.2, 300),
  steel: oklch(0.88, 0.06, 220),
  coffee: oklch(0.72, 0.12, 60),
};

export type ColorRole = keyof typeof GLOW;

/** The colors in use right now. setColors() swaps them in place. */
export const C: Record<ColorRole, RGB> = { ...GLOW };

const GLOW_ARCHETYPE: Record<string, RGB> = {
  tangle: oklch(0.72, 0.24, 330),
  nest: oklch(0.72, 0.2, 35),
  hydra: oklch(0.82, 0.14, 200),
  wall: oklch(0.7, 0.1, 250),
  imp: oklch(0.88, 0.17, 100),
  bug: oklch(0.85, 0.2, 130),
  spawn: oklch(0.75, 0.15, 340),
  boss: GLOW.boss,
};

export const ARCHETYPE: Record<string, RGB> = { ...GLOW_ARCHETYPE };

// Okabe-Ito colors, picked to stay apart for the common kinds of color
// blindness, lifted a little to read on the dark background.
const CB = {
  orange: [230, 159, 0],
  sky: [86, 180, 233],
  green: [0, 190, 140],
  yellow: [240, 228, 66],
  blue: [90, 150, 230],
  vermillion: [240, 110, 30],
  purple: [220, 130, 180],
} satisfies Record<string, RGB>;

const PALETTES: Record<string, { roles: Partial<Record<ColorRole, RGB>>; archetypes: Record<string, RGB> }> = {
  glow: { roles: {}, archetypes: {} },
  colorblind: {
    roles: { hp: CB.sky, danger: CB.vermillion, loot: CB.yellow, boss: CB.purple, shrine: CB.green, gold: CB.orange },
    archetypes: {
      tangle: CB.purple,
      nest: CB.vermillion,
      hydra: CB.sky,
      wall: CB.blue,
      imp: CB.yellow,
      bug: CB.green,
      spawn: [200, 160, 190],
      boss: CB.purple,
    },
  },
  contrast: {
    roles: {
      ink: [8, 6, 6],
      dim: oklch(0.85, 0.03, 60),
      floor: oklch(0.75, 0.2, 345),
      passage: oklch(0.78, 0.05, 255),
      text: oklch(0.98, 0.01, 70),
    },
    archetypes: {},
  },
};

export function setColors(name: string): void {
  const p = PALETTES[name] ?? PALETTES.glow;
  Object.assign(C, GLOW, p.roles);
  Object.assign(ARCHETYPE, GLOW_ARCHETYPE, p.archetypes);
}

export const LANGUAGE: Record<string, RGB> = {
  python: oklch(0.7, 0.13, 250),
  javascript: oklch(0.85, 0.16, 100),
  typescript: oklch(0.68, 0.14, 245),
  go: oklch(0.78, 0.12, 210),
  rust: oklch(0.7, 0.15, 45),
  java: oklch(0.7, 0.14, 50),
  kotlin: oklch(0.68, 0.18, 300),
  c: oklch(0.7, 0.05, 250),
  cpp: oklch(0.65, 0.14, 0),
  csharp: oklch(0.6, 0.17, 145),
  ruby: oklch(0.6, 0.2, 25),
  php: oklch(0.6, 0.1, 280),
  swift: oklch(0.72, 0.18, 40),
  scala: oklch(0.62, 0.2, 25),
  lua: oklch(0.55, 0.15, 265),
};

export function rgba(c: RGB, a = 1): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
}

export function scale(c: RGB, k: number): RGB {
  return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function css(c: RGB): string {
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}
