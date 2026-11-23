// Share links and the result text.
//
// Gallery dungeons:  #/play/<slug>?run=<n>
// Your own dungeon:  #/x/<run>/<deflated spec, base64url>
// Built in browser:  #/gh/<owner>/<repo>@<commit sha>?run=<n>  (rebuilt on open)
// The lab:           #/lab   (any dungeon also takes ?practice=1)
// Everything lives after the #, so it never reaches a server.

import { Inflate, deflateSync, strFromU8, strToU8 } from "fflate";
import type { Game } from "../game/game";
import { isLevel, type Level } from "../game/extras";

const MAX_INFLATED = 4 * 1024 * 1024;
const MAX_LINK = 1024 * 1024;
const STEP = 1024;

// Any dungeon route can also carry ?watch=<deflated action log> to replay a run.
interface Extra {
  run: number;
  watch?: string;
  /** A friend's run to race: their @ moves along with you. */
  race?: string;
  /** The rules version a watch or race log was recorded under. */
  v?: number;
  /** Difficulty other than normal. Part of the run, like the run number. */
  level?: Level;
  /** Lab tools on, and the run counts for nothing: no save, records or daily. */
  practice?: boolean;
}

export type Route =
  | { kind: "title" }
  | { kind: "compare"; owner: string; repo: string; a: string; b: string }
  | ({ kind: "gallery"; slug: string } & Extra)
  | ({ kind: "custom"; data: string } & Extra)
  | ({ kind: "github"; owner: string; repo: string; sha: string } & Extra)
  | ({ kind: "lab" } & Extra);

export type PlayRoute = Exclude<Route, { kind: "title" } | { kind: "compare" }>;

function parseExtra(query: string): Extra | null {
  const params = new URLSearchParams(query);
  const run = params.get("run") ?? "0";
  const watch = params.get("watch");
  const race = params.get("race");
  if (!/^\d{1,9}$/.test(run)) return null;
  const log = /^[A-Za-z0-9_-]{1,400000}$/;
  if (watch !== null && !log.test(watch)) return null;
  if (race !== null && !log.test(race)) return null;
  const level = params.get("level");
  const lv = isLevel(level) ? { level } : {};
  if (level !== null && !("level" in lv)) return null;
  const practice = params.get("practice");
  if (practice !== null && practice !== "1") return null;
  const v = params.get("v");
  const version = v && /^\d{1,4}$/.test(v) ? { v: Number(v) } : {};
  return { run: Number(run), ...lv, ...(practice ? { practice: true } : {}), ...(watch ? { watch } : {}), ...(race ? { race } : {}), ...((watch || race) ? version : {}) };
}

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, "");
  const q = h.indexOf("?");
  const path = q < 0 ? h : h.slice(0, q);
  const extra = parseExtra(q < 0 ? "" : h.slice(q + 1));
  if (!extra) return { kind: "title" };
  const vs = path.match(/^\/vs\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})@([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})$/);
  if (vs && vs[2] !== "." && vs[2] !== "..") return { kind: "compare", owner: vs[1], repo: vs[2], a: vs[3], b: vs[4] };
  if (path === "/lab") return { kind: "lab", ...extra, practice: true };
  const play = path.match(/^\/play\/([a-z0-9._-]{1,60})$/i);
  if (play) return { kind: "gallery", slug: play[1].toLowerCase(), ...extra };
  const gh = path.match(/^\/gh\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})@([0-9a-f]{7,40})$/);
  if (gh && gh[2] !== "." && gh[2] !== "..") return { kind: "github", owner: gh[1], repo: gh[2], sha: gh[3], ...extra };
  // Older custom links put the run number in the path.
  const custom = path.match(/^\/x\/(\d{1,9})\/([A-Za-z0-9_-]{1,1400000})$/);
  if (custom) return { kind: "custom", data: custom[2], ...extra, run: Number(custom[1]) };
  return { kind: "title" };
}

export function routeHash(route: Route): string {
  if (route.kind === "title") return "#/";
  if (route.kind === "compare") return `#/vs/${route.owner}/${route.repo}@${route.a}..${route.b}`;
  const params = new URLSearchParams();
  if (route.run && route.kind !== "custom") params.set("run", String(route.run));
  if (route.level) params.set("level", route.level);
  if (route.practice && route.kind !== "lab") params.set("practice", "1");
  if (route.watch) params.set("watch", route.watch);
  if (route.race) params.set("race", route.race);
  if ((route.watch || route.race) && route.v) params.set("v", String(route.v));
  const query = params.size ? `?${params}` : "";
  switch (route.kind) {
    case "gallery":
      return `#/play/${route.slug}${query}`;
    case "custom":
      return `#/x/${route.run}/${route.data}${query}`;
    case "github":
      return `#/gh/${route.owner}/${route.repo}@${route.sha}${query}`;
    case "lab":
      return `#/lab${query}`;
  }
}

/** The same dungeon and run, without any replay or race attached. */
export function playRoute(route: PlayRoute): PlayRoute {
  const { watch: _w, race: _r, v: _v, ...rest } = route;
  return rest as PlayRoute;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSpec(json: string): string {
  return toBase64Url(deflateSync(strToU8(json), { level: 9 }));
}

/** Returns the JSON text, or null if the data is broken or inflates too big. */
export function decodeSpec(data: string): string | null {
  if (data.length > MAX_LINK) return null;
  try {
    const input = fromBase64Url(data);
    const chunks: Uint8Array[] = [];
    let total = 0;
    let tooBig = false;
    const inflater = new Inflate((chunk) => {
      total += chunk.length;
      if (total > MAX_INFLATED) tooBig = true;
      else chunks.push(chunk);
    });
    // fflate hands over everything one push produces in a single callback, so
    // feed it small slices. Deflate tops out near 1:1032, which keeps each
    // step around a megabyte no matter how hostile the input is.
    for (let i = 0; i < input.length && !tooBig; i += STEP) {
      inflater.push(input.subarray(i, i + STEP), i + STEP >= input.length);
    }
    if (tooBig) return null;
    const all = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.length;
    }
    return strFromU8(all);
  } catch {
    return null;
  }
}

/** One mark per floor, like a Wordle row: # cleared, x died there, @ still there, . not reached. */
export function floorRow(game: Game): string {
  const here = game.floor.index;
  return game.spec.floors
    .map((_, i) => {
      if (i < here) return "#";
      if (i > here) return ".";
      return game.outcome === "won" ? "#" : game.outcome === "dead" ? "x" : "@";
    })
    .join(" ");
}

// Everyone runs their own copy, so a localhost link means nothing to a friend.
// Locally we hand out just the part after #, which the code box on the title
// screen accepts as is.
export function shareLink(href: string): string {
  const url = new URL(href);
  const local = url.protocol === "file:" || /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(url.hostname);
  return local ? url.hash : href;
}

export function resultText(game: Game, link: string, label = "", code: string | null = null): string {
  const p = game.player;
  const total = game.spec.floors.length;
  const f = game.floorSpec;
  const repo = `${game.spec.repo.name} @${game.spec.repo.head.slice(0, 7)}`;
  const head =
    game.outcome === "won"
      ? `cleared in ${p.turns} turns`
      : game.outcome === "dead"
        ? `died to ${game.killerLabel ?? game.killer} on floor ${f.index + 1} of ${total}, turn ${p.turns}`
        : `on floor ${f.index + 1} of ${total}, turn ${p.turns}`;
  return [
    `HEADCRAWL${label ? ` ${label}` : ""}  ${repo}`,
    floorRow(game),
    head,
    `lv ${p.level}, ${p.kills} kills, ${p.bosses} of ${total} bosses`,
    ...(code ? [`run code ${code}`] : []),
    // A local link only repeats what the run code already says.
    ...(code && link.startsWith("#") ? [] : [link]),
  ].join("\n");
}
