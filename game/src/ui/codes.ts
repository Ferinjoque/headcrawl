// Run codes: a dungeon and its rolls in a form you can say out loud.
//   flask-4821                     gallery dungeon, run 4821
//   pallets/flask@672971d-4821     any GitHub repo at that commit
//   flask-4821-hard                the same, on hard (or -story)
// Dungeons opened from a file have no code; their link is the only way back.

import type { Level } from "../game/extras";
import type { PlayRoute } from "./share";

const GALLERY = /^([a-z0-9._-]{1,60})-(\d{1,9})(?:-(story|hard))?$/;
const GITHUB = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})@([0-9a-f]{7,40})-(\d{1,9})(?:-(story|hard))?$/i;

export function runCode(route: PlayRoute, head?: string): string | null {
  const level = route.level ? `-${route.level}` : "";
  if (route.kind === "gallery") return `${route.slug}-${route.run}${level}`;
  if (route.kind === "github") return `${route.owner}/${route.repo}@${(head ?? route.sha).slice(0, 7)}-${route.run}${level}`;
  return null;
}

export function parseCode(text: string): PlayRoute | null {
  const code = text.trim().toLowerCase().replace(/\s+/g, "");
  const g = code.match(GALLERY);
  if (g) return { kind: "gallery", slug: g[1], run: Number(g[2]), ...(g[3] ? { level: g[3] as Level } : {}) };
  const raw = text.trim().replace(/\s+/g, "");
  const h = raw.match(GITHUB);
  if (h && h[2] !== "." && h[2] !== "..") {
    const level = h[5] ? { level: h[5].toLowerCase() as Level } : {};
    return { kind: "github", owner: h[1], repo: h[2], sha: h[3].toLowerCase(), run: Number(h[4]), ...level };
  }
  return null;
}
