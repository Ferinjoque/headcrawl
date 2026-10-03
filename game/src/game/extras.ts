// Mechanics that come from things around the code rather than the code
// itself: the dependency vendor, dead-code ghosts, import-cycle loops, the
// daily run's twist and the time-travel HACK. Pure helpers; game.ts calls in.

import { Rng, hashString } from "../core/rng";
import type { Dependency, DungeonSpec } from "../spec";
import { roomCells } from "../map/layout";
import type { Grid } from "../map/grid";
import { fromEnemy, type FloorState } from "./world";
import type { Monster, Player } from "./types";

// ---- vendor ---------------------------------------------------------------

export interface Deal {
  id: string;
  text: string;
  apply(p: Player): void;
}

const lowerMax = (p: Player, by: number) => {
  p.maxHp = Math.max(10, p.maxHp - by);
  p.hp = Math.min(p.hp, p.maxHp);
};

/** Every dependency helps and every one costs something. */
export const DEALS: Deal[] = [
  {
    id: "framework",
    text: "attack +3, max HP -6. Does everything, weighs a ton.",
    apply: (p) => {
      p.atk += 3;
      lowerMax(p, 6);
    },
  },
  {
    id: "stable",
    text: "max HP +10, attack -1. Boring and solid.",
    apply: (p) => {
      p.maxHp += 10;
      p.hp += 10;
      p.atk = Math.max(1, p.atk - 1);
    },
  },
  {
    id: "polyfill",
    text: "heals you to full, max HP -3.",
    apply: (p) => {
      lowerMax(p, 3);
      p.hp = p.maxHp;
    },
  },
  {
    id: "tiny",
    text: "attack +1, and you drop every TODO you carry. Eleven lines, somehow essential.",
    apply: (p) => {
      p.atk += 1;
      p.potions = [];
    },
  },
  {
    id: "peer",
    text: "attack +2 and max HP +4, but one more XXX curse on you.",
    apply: (p) => {
      p.atk += 2;
      p.maxHp += 4;
      p.hp += 4;
      p.curses++;
    },
  },
];

export interface Offer {
  dep: Dependency;
  deal: Deal;
}

export interface Vendor {
  x: number;
  y: number;
  offers: Offer[];
  sold: boolean;
}

const INSTALL: Record<Dependency["ecosystem"], string> = {
  npm: "npm install",
  pypi: "pip install",
  go: "go get",
  cargo: "cargo add",
  gem: "gem install",
  composer: "composer require",
};

export function installLine(dep: Dependency): string {
  return `${INSTALL[dep.ecosystem]} ${dep.name}`;
}

export function dealFor(dep: Dependency): Deal {
  return DEALS[hashString(`deal/${dep.ecosystem}/${dep.name}`) % DEALS.length];
}

/** Two dependencies for sale on this floor, the same for every run of the commit. */
export function vendorOffers(spec: DungeonSpec, floor: number): Offer[] {
  const deps = spec.repo.dependencies ?? [];
  if (!deps.length) return [];
  const picks = new Rng(`${spec.seed}/vendor/${floor}`).shuffle([...deps]).slice(0, 2);
  return picks.map((dep) => ({ dep, deal: dealFor(dep) }));
}

/** The vendor waits in the entry room, out of the doorway, away from you. */
export function placeVendor(state: FloorState, spec: DungeonSpec): Vendor | null {
  const offers = vendorOffers(spec, state.index);
  if (!offers.length) return null;
  const { map } = state;
  const [sx, sy] = map.start;
  const busy = (x: number, y: number) =>
    (x === sx && y === sy) || state.monsters.some((m) => m.x === x && m.y === y) || state.items.some((i) => i.x === x && i.y === y);
  const cells = roomCells(map, map.entry)
    .filter(([x, y]) => !busy(x, y) && Math.max(Math.abs(x - sx), Math.abs(y - sy)) >= 2)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const spot = cells[Math.floor(cells.length / 3)];
  return spot ? { x: spot[0], y: spot[1], offers, sold: false } : null;
}

/** The vendor and the keeper stand still and take up their cells. Paths go around them. */
export function npcAt(state: FloorState, x: number, y: number): boolean {
  const at = (n: { x: number; y: number } | null) => !!n && n.x === x && n.y === y;
  return at(state.vendor) || at(state.keeper);
}

// ---- the keeper ----------------------------------------------------------

/** Whoever committed most to this floor, standing in one of its rooms. */
export interface KeeperNpc {
  x: number;
  y: number;
  name: string;
  commits: number;
  subject: string | null;
  met: boolean;
}

/** Heals this share of max HP, once per floor. */
export const KEEPER_HEAL = 0.3;

export function placeKeeper(state: FloorState, spec: DungeonSpec): KeeperNpc | null {
  const k = spec.floors[state.index].keeper;
  if (!k) return null;
  const { map } = state;
  const rooms = map.rooms.filter((r) => r !== map.entry && r !== map.lair && r.spec.kind === "hall");
  if (!rooms.length) return null;
  const rng = new Rng(`${spec.seed}/keeper/${state.index}`);
  const room = rooms[rng.int(0, rooms.length - 1)];
  const free = rng
    .shuffle(roomCells(map, room))
    .find(([x, y]) => !state.monsters.some((m) => m.x === x && m.y === y) && !state.items.some((i) => i.x === x && i.y === y) && !npcAt(state, x, y));
  return free ? { x: free[0], y: free[1], name: k.name, commits: k.commits, subject: k.subject ?? null, met: false } : null;
}

// ---- ghosts ---------------------------------------------------------------

/** Dead code drifts straight at you, through walls if it has to. */
export function ghostStep(m: Monster, p: { x: number; y: number }, grid: Grid, taken: Uint8Array): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y));
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const nx = m.x + dx;
    const ny = m.y + dy;
    if (nx <= 0 || ny <= 0 || nx >= grid.width - 1 || ny >= grid.height - 1) continue;
    if (nx === p.x && ny === p.y) continue;
    if (taken[grid.idx(nx, ny)]) continue;
    const d = Math.max(Math.abs(nx - p.x), Math.abs(ny - p.y));
    if (d < bestD) {
      best = [nx, ny];
      bestD = d;
    }
  }
  return best;
}

/** Ghosts hit softly: nothing calls them, so they never got much practice. */
export const GHOST_DAMAGE = 0.5;

// ---- daily twists ---------------------------------------------------------

export type ModId = "friday" | "legacy" | "hotfix" | "review" | "lightsout";

export const MODS: Record<ModId, { name: string; text: string }> = {
  friday: { name: "friday deploy", text: "Bosses move faster. Nobody deploys on a Friday, and yet." },
  legacy: { name: "legacy code", text: "Every monster has a quarter more HP and gives a quarter more XP." },
  hotfix: { name: "hotfix", text: "Attack +2, max HP down a fifth. Ship it." },
  review: { name: "code review", text: "Every kill heals 1." },
  lightsout: { name: "lights out", text: "You see two cells less. The office turned the lights off." },
};

const ROTATION: ModId[] = ["legacy", "hotfix", "review", "lightsout"];

/** The twist for a daily run, from its run number (yyyymmdd). Fridays are Fridays. */
export function dailyMod(run: number): ModId | null {
  const y = Math.floor(run / 10000);
  const m = Math.floor(run / 100) % 100;
  const d = run % 100;
  if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5) return "friday";
  return ROTATION[hashString(`mod/${run}`) % ROTATION.length];
}

export function modPlayer(p: Player, mods: readonly ModId[]): void {
  if (mods.includes("hotfix")) {
    p.atk += 2;
    p.maxHp = Math.round(p.maxHp * 0.8);
    p.hp = p.maxHp;
  }
}

export function modFloor(state: FloorState, mods: readonly ModId[]): void {
  for (const m of state.monsters) modMonster(m, mods);
}

export function modMonster(m: Monster, mods: readonly ModId[]): void {
  if (mods.includes("legacy")) {
    m.maxHp = Math.round(m.maxHp * 1.25);
    m.hp = m.maxHp;
    m.xp = Math.round(m.xp * 1.25);
  }
  if (mods.includes("friday") && m.boss) m.speed += 30;
}

// ---- time travel ----------------------------------------------------------

/** Whether a git checkout HACK has anything to rewind on this floor. */
export function canRewind(state: FloorState): boolean {
  if (state.rewound) return false;
  if (boss(state)?.boss?.past) return true;
  return state.map.rooms.some((r) => r.spec.past && state.monsters.some((m) => m.room === r.index && m.enemy && m.archetype !== "spawn"));
}

/**
 * git checkout, floor-wide: every room's living functions are swapped for
 * the ones the file had a year before. What you already refactored stays
 * refactored: a room never gets more monsters back than it had left.
 * Returns how many functions changed and the year, or null.
 */
export function rewindFloor(
  state: FloorState,
  rng: Rng,
  floors: number,
  player: { x: number; y: number },
  mods: readonly ModId[] = [],
): { swapped: number; year: number } | null {
  let swapped = 0;
  let year = 0;
  for (const rect of state.map.rooms) {
    const past = rect.spec.past;
    if (!past) continue;
    const alive = state.monsters.filter((m) => m.room === rect.index && m.enemy && m.archetype !== "spawn");
    if (!alive.length) continue;
    year = past.year;
    const spots = alive.map((m) => [m.x, m.y] as const);
    state.monsters = state.monsters.filter((m) => !alive.includes(m));
    const roster = rng.shuffle([...past.enemies]).slice(0, alive.length);
    roster.forEach((e, i) => {
      const [x, y] = spots[i];
      if (x === player.x && y === player.y) return;
      const m = fromEnemy(e, x, y, rect.index, state.index, floors);
      modMonster(m, mods);
      // A rewind changes the code, not how beaten up it already is.
      const was = alive[i];
      m.hp = Math.max(1, Math.round(m.maxHp * (was.hp / was.maxHp)));
      m.awake = was.awake;
      state.monsters.push(m);
    });
    swapped += Math.max(alive.length, roster.length);
  }
  state.rewound = true;
  return swapped || year ? { swapped, year } : null;
}

/** git checkout: the boss as it was a year before. Null if there is no past. */
export function boss(state: FloorState): Monster | undefined {
  return state.monsters.find((m) => m.boss);
}

export function timeTravel(m: Monster): { year: number; before: number; after: number } | null {
  const past = m.boss?.past;
  if (!past || !m.boss) return null;
  const ratio = past.ccn / Math.max(1, m.boss.ccn);
  const maxHp = Math.max(1, Math.round(m.maxHp * ratio));
  const hp = Math.max(1, Math.min(maxHp, Math.round(m.hp * ratio)));
  const out = { year: past.year, before: m.boss.ccn, after: past.ccn };
  m.maxHp = maxHp;
  m.hp = hp;
  // Once is enough: the boss is now its old self, with no further past to go back to.
  m.boss = { ...m.boss, ccn: past.ccn, past: undefined };
  return out;
}
