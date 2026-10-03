// The bestiary: what you have refactored across every run in this browser,
// the bosses you beat and what keeps getting you. Local only, like saves.

import type { Game } from "../game/game";

const KEY = "headcrawl.codex.v1";
const TOP = 12;

export interface Codex {
  runs: number;
  wins: number;
  /** Kills per monster kind. */
  kills: Record<string, number>;
  /** Bosses beaten, worst (most branches) first. */
  bosses: { name: string; repo: string; ccn: number }[];
  /** What killed you, by function name. */
  deaths: Record<string, number>;
  /** Repos you have played. */
  repos: string[];
}

export function emptyCodex(): Codex {
  return { runs: 0, wins: 0, kills: {}, bosses: [], deaths: {}, repos: [] };
}

const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9;

function counts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) if (k.length <= 100 && count(v)) out[k] = v;
  return out;
}

export function loadCodex(): Codex {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Codex> | null;
    if (!raw || typeof raw !== "object") return emptyCodex();
    return {
      runs: count(raw.runs) ? raw.runs : 0,
      wins: count(raw.wins) ? raw.wins : 0,
      kills: counts(raw.kills),
      bosses: Array.isArray(raw.bosses)
        ? raw.bosses.filter((b) => b && typeof b.name === "string" && typeof b.repo === "string" && count(b.ccn)).slice(0, TOP)
        : [],
      deaths: counts(raw.deaths),
      repos: Array.isArray(raw.repos) ? raw.repos.filter((r): r is string => typeof r === "string").slice(-50) : [],
    };
  } catch {
    return emptyCodex();
  }
}

/** Folds a finished run into the codex. Pure, so it can be tested. */
export function addRun(c: Codex, game: Game): Codex {
  const repo = game.spec.repo.name;
  const kills = { ...c.kills };
  for (const [k, n] of Object.entries(game.player.killsBy)) kills[k] = (kills[k] ?? 0) + n;
  const beaten = game.spec.floors
    .slice(0, game.player.bosses)
    .map((f) => ({ name: f.boss.name, repo, ccn: f.boss.ccn }));
  const bosses = [...c.bosses, ...beaten]
    .filter((b, i, all) => all.findIndex((x) => x.name === b.name && x.repo === b.repo) === i)
    .sort((a, b) => b.ccn - a.ccn)
    .slice(0, TOP);
  const deaths = { ...c.deaths };
  if (game.outcome === "dead" && game.killer) deaths[game.killer] = (deaths[game.killer] ?? 0) + 1;
  return {
    runs: c.runs + 1,
    wins: c.wins + (game.outcome === "won" ? 1 : 0),
    kills,
    bosses,
    deaths,
    repos: [...c.repos.filter((r) => r !== repo), repo].slice(-50),
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
