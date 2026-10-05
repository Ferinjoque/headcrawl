// Plays gallery dungeons with the bot and prints a table. Settings come from
// environment variables so the same command works anywhere:
//
//   SIM_DUNGEONS=flask,axum   only these (default: the whole gallery)
//   SIM_RUNS=5                runs per dungeon (default 3)
//   SIM_STYLE=careful         plain, careful or both (default both)
//   SIM_LEVEL=hard            story, normal or hard (default normal)
//
// npm run sim, or with variables: SIM_RUNS=10 npm run sim

import { readFileSync, readdirSync } from "node:fs";
import { it } from "vitest";
import { playOut, type BotStyle } from "../src/game/bot";
import { Game } from "../src/game/game";
import type { ModId } from "../src/game/extras";
import { loadSpec, type DungeonSpec } from "../src/spec";

const DIR = new URL("../public/dungeons/", import.meta.url);
const env = process.env;
const only = (env.SIM_DUNGEONS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const runs = Math.max(1, Number(env.SIM_RUNS ?? 3));
const styles: [string, BotStyle][] =
  env.SIM_STYLE === "plain" ? [["plain", {}]] : env.SIM_STYLE === "careful" ? [["careful", { careful: true }]] : [["plain", {}], ["careful", { careful: true }]];
const level = env.SIM_LEVEL === "hard" || env.SIM_LEVEL === "story" ? [env.SIM_LEVEL as ModId] : [];

function dungeons(): [string, DungeonSpec][] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.replace(/\.json$/, ""))
    .filter((name) => !only.length || only.includes(name))
    .flatMap((name) => {
      const res = loadSpec(readFileSync(new URL(`${name}.json`, DIR), "utf8"));
      return res.ok ? [[name, res.spec] as [string, DungeonSpec]] : [];
    });
}

it("balance", () => {
  const rows: string[] = [];
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  rows.push(`${pad("dungeon", 16)}${pad("bot", 9)}${pad("wins", 7)}${pad("floor", 8)}${pad("level", 7)}${pad("kills", 7)}${pad("turns", 8)}killed by`);
  let total = 0;
  let won = 0;
  for (const [name, spec] of dungeons()) {
    for (const [label, style] of styles) {
      const results = Array.from({ length: runs }, (_, run) => {
        const game = new Game(spec, { run, mods: level });
        return { ...playOut(game, 20000, style), killer: game.killer };
      });
      const wins = results.filter((r) => r.outcome === "won").length;
      total += results.length;
      won += wins;
      const avg = (f: (r: (typeof results)[number]) => number) => (results.reduce((s, r) => s + f(r), 0) / results.length).toFixed(0);
      const killers = [...new Set(results.map((r) => r.killer).filter(Boolean))].join(", ");
      rows.push(`${pad(name, 16)}${pad(label, 9)}${pad(`${wins}/${runs}`, 7)}${pad(avg((r) => r.floor + 1) + "/" + spec.floors.length, 8)}${pad(avg((r) => r.level), 7)}${pad(avg((r) => r.kills), 7)}${pad(avg((r) => r.turns), 8)}${killers}`);
    }
  }
  rows.push(`\n${won} of ${total} runs won${level.length ? ` on ${level[0]}` : ""}.`);
  console.log(rows.join("\n"));
});
