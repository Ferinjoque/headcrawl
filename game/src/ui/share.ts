// Share links and the result text.
//
// Gallery dungeons:  #/play/<slug>?run=<n>
// Your own dungeon:  #/x/<run>/<deflated spec, base64url>
// Everything lives after the #, so it never reaches a server.

import { Inflate, deflateSync, strFromU8, strToU8 } from "fflate";
import type { Game } from "../game/game";

const MAX_INFLATED = 4 * 1024 * 1024;

export type Route =
  | { kind: "title" }
  | { kind: "gallery"; slug: string; run: number }
  | { kind: "custom"; run: number; data: string };

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, "");
  const play = h.match(/^\/play\/([a-z0-9._-]{1,60})(?:\?run=(\d{1,9}))?$/i);
  if (play) return { kind: "gallery", slug: play[1].toLowerCase(), run: Number(play[2] ?? 0) };
  const custom = h.match(/^\/x\/(\d{1,9})\/([A-Za-z0-9_-]+)$/);
  if (custom) return { kind: "custom", run: Number(custom[1]), data: custom[2] };
  return { kind: "title" };
}

export function routeHash(route: Route): string {
  switch (route.kind) {
    case "title":
      return "#/";
    case "gallery":
      return `#/play/${route.slug}${route.run ? `?run=${route.run}` : ""}`;
    case "custom":
      return `#/x/${route.run}/${route.data}`;
  }
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
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const inflater = new Inflate((chunk) => {
      total += chunk.length;
      if (total > MAX_INFLATED) throw new Error("too big");
      chunks.push(chunk);
    });
    inflater.push(fromBase64Url(data), true);
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

export function resultText(game: Game, link: string): string {
  const p = game.player;
  const total = game.spec.floors.length;
  const f = game.floorSpec;
  const repo = `${game.spec.repo.name} @${game.spec.repo.head.slice(0, 7)}`;
  const progress = "#".repeat(f.index + (game.outcome === "won" ? 1 : 0)) + "-".repeat(total - f.index - (game.outcome === "won" ? 1 : 0));
  const head =
    game.outcome === "won"
      ? `reached HEAD in ${p.turns} turns`
      : game.outcome === "dead"
        ? `died on floor ${f.index + 1}/${total} (${f.name}) to ${game.killer}, turn ${p.turns}`
        : `on floor ${f.index + 1}/${total} (${f.name}), turn ${p.turns}`;
  return [
    `HEADCRAWL  ${repo}`,
    head,
    `lv ${p.level}, ${p.kills} functions refactored, ${p.bosses}/${total} bosses  [${progress}]`,
    link,
  ].join("\n");
}
