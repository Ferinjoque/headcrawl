// The bestiary: what you have refactored across every run in this browser,
// the bosses you beat and what keeps getting you. Local only, like saves.
// Fields added later are optional in storage, so an older codex still loads.

import type { Game } from "../game/game";

const KEY = "headcrawl.codex.v1";
const TOP = 12;

/** A function you finished, and where. */
export interface Trophy {
  name: string;
  repo: string;
  ccn: number;
}

export interface BestWeapon {
  name: string;
  repo: string;
  bonus: number;
  trait: string;
}

export interface Codex {
  runs: number;
  wins: number;
  /** Kills per monster kind. */
  kills: Record<string, number>;
  /** Bosses beaten, worst (most branches) first. */
  bosses: Trophy[];
  /** What killed you, by function name. */
  deaths: Record<string, number>;
  /** Repos you have played. */
  repos: string[];
  /** Per kind: the repo you first finished one in. */
  first: Record<string, string>;
  /** Per kind: the gnarliest one you finished. */
  worst: Record<string, Trophy>;
  /** Elites finished, by affix. */
  elites: Record<string, number>;
  /** Weapons carried, by trait. */
  traits: Record<string, number>;
  /** The best weapon you ever held. */
  best: BestWeapon | null;
}

export function emptyCodex(): Codex {
  return { runs: 0, wins: 0, kills: {}, bosses: [], deaths: {}, repos: [], first: {}, worst: {}, elites: {}, traits: {}, best: null };
}

const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9;
const text = (v: unknown, max = 200): v is string => typeof v === "string" && v.length <= max;

function counts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) if (k.length <= 100 && count(v)) out[k] = v;
  return out;
}

function trophy(v: unknown): v is Trophy {
  const t = v as Trophy | null;
  return !!t && typeof t === "object" && text(t.name) && text(t.repo) && count(t.ccn);
}

function strings(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) if (k.length <= 100 && text(v)) out[k] = v;
  return out;
}

function trophies(raw: unknown): Record<string, Trophy> {
  const out: Record<string, Trophy> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) if (k.length <= 100 && trophy(v)) out[k] = { name: v.name, repo: v.repo, ccn: v.ccn };
  return out;
}

function bestWeapon(v: unknown): BestWeapon | null {
  const b = v as BestWeapon | null;
  if (!b || typeof b !== "object" || !text(b.name) || !text(b.repo) || !count(b.bonus) || !text(b.trait, 20)) return null;
  return { name: b.name, repo: b.repo, bonus: b.bonus, trait: b.trait };
}

export function loadCodex(): Codex {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Codex> | null;
    if (!raw || typeof raw !== "object") return emptyCodex();
    return {
      runs: count(raw.runs) ? raw.runs : 0,
      wins: count(raw.wins) ? raw.wins : 0,
      kills: counts(raw.kills),
      bosses: Array.isArray(raw.bosses) ? raw.bosses.filter(trophy).slice(0, TOP) : [],
      deaths: counts(raw.deaths),
      repos: Array.isArray(raw.repos) ? raw.repos.filter((r): r is string => typeof r === "string").slice(-50) : [],
      first: strings(raw.first),
      worst: trophies(raw.worst),
      elites: counts(raw.elites),
      traits: counts(raw.traits),
      best: bestWeapon(raw.best),
    };
  } catch {
    return emptyCodex();
  }
}

const add = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n;
  return out;
};

/** Folds a finished run into the codex. Pure, so it can be tested. */
export function addRun(c: Codex, game: Game): Codex {
  const repo = game.spec.repo.name;
  const beaten = game.spec.floors
    .slice(0, game.player.bosses)
    .map((f) => ({ name: f.boss.name, repo, ccn: f.boss.ccn }));
  const bosses = [...c.bosses, ...beaten]
    .filter((b, i, all) => all.findIndex((x) => x.name === b.name && x.repo === b.repo) === i)
    .sort((a, b) => b.ccn - a.ccn)
    .slice(0, TOP);
  const deaths = { ...c.deaths };
  if (game.outcome === "dead" && game.killer) deaths[game.killer] = (deaths[game.killer] ?? 0) + 1;

  const first = { ...c.first };
  for (const kind of Object.keys(game.player.killsBy)) first[kind] ??= repo;
  const worst = { ...c.worst };
  for (const [kind, t] of Object.entries(game.trophies)) {
    if (!worst[kind] || t.ccn > worst[kind].ccn) worst[kind] = { name: t.name, repo, ccn: t.ccn };
  }
  const weapons = game.wielded.filter((g) => g.slot === "weapon");
  const traits = { ...c.traits };
  for (const g of weapons) traits[g.trait] = (traits[g.trait] ?? 0) + 1;
  const top = weapons.reduce<BestWeapon | null>((b, g) => (!b || g.bonus > b.bonus ? { name: g.name, repo, bonus: g.bonus, trait: g.trait } : b), null);
  const best = top && (!c.best || top.bonus > c.best.bonus) ? top : c.best;

  return {
    runs: c.runs + 1,
    wins: c.wins + (game.outcome === "won" ? 1 : 0),
    kills: add(c.kills, game.player.killsBy),
    bosses,
    deaths,
    repos: [...c.repos.filter((r) => r !== repo), repo].slice(-50),
    first,
    worst,
    elites: add(c.elites, game.eliteKills),
    traits,
    best,
  };
}

export function saveCodex(c: Codex): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // Blocked storage: the bestiary just stays empty.
  }
}

export function topDeaths(c: Codex, n = 5): [string, number][] {
  return Object.entries(c.deaths)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n);
}
