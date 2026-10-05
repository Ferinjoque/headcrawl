// A run as an asciinema cast (v2): the last stretch of turns drawn as ANSI
// text, one frame per turn. Rebuilt from the action log, so it shows exactly
// what happened. `asciinema play run.cast` in any terminal.

import { Game } from "../game/game";
import type { ModId } from "../game/extras";
import { decodeLog } from "../game/record";
import { Tile } from "../map/grid";
import type { DungeonSpec } from "../spec";

const W = 64;
const H = 22;
const FRAME_S = 0.14;

const ESC = "\x1b[";
const fg = (n: number, bold = false) => `${ESC}${bold ? "1;" : ""}38;5;${n}m`;
const RESET = `${ESC}0m`;

const MONSTER: Record<string, number> = { tangle: 170, nest: 202, hydra: 87, wall: 111, imp: 227, bug: 154, ghost: 189, spawn: 175 };
const ITEM: Record<string, string> = { potion: "!", weapon: "/", armor: "[", scroll: "?", curse: "%", coffee: "c" };

function cell(game: Game, x: number, y: number): [string, number] {
  const f = game.floor;
  const g = f.map.grid;
  if (!g.inside(x, y)) return [" ", 0];
  const i = g.idx(x, y);
  const vis = f.visible[i] === 1;
  if (!vis && !f.seen[i]) return [" ", 0];
  const p = game.player;
  if (x === p.x && y === p.y) return ["@", 231];
  if (vis) {
    const m = game.monsterAt(x, y);
    if (m) return [m.glyph, m.boss ? 199 : (MONSTER[m.archetype] ?? 203)];
    const it = game.itemAt(x, y);
    if (it) return [ITEM[it.kind] ?? "?", 228];
    if (f.vendor && f.vendor.x === x && f.vendor.y === y) return ["$", 220];
    if (f.keeper && f.keeper.x === x && f.keeper.y === y) return ["&", 153];
  }
  const dim = vis ? 0 : 1;
  switch (g.tiles[i]) {
    case Tile.Wall:
      return [x % 2 ? "]" : "[", dim ? 94 : 215];
    case Tile.Floor:
      return [".", dim ? 238 : 168];
    case Tile.Corridor:
      return g.way[i] === 3 ? ["o", dim ? 60 : 141] : g.way[i] === 1 ? ["~", dim ? 24 : 75] : ["#", dim ? 238 : 245];
    case Tile.Door:
      return ["+", dim ? 94 : 215];
    case Tile.StairsDown:
      return [">", 220];
    case Tile.StairsUp:
      return ["<", 178];
    case Tile.Shrine:
      return ["*", 49];
    default:
      return [" ", 0];
  }
}

export function frame(game: Game): string {
  const g = game.floor.map.grid;
  const p = game.player;
  const x0 = Math.max(0, Math.min(g.width - W, p.x - (W >> 1)));
  const y0 = Math.max(0, Math.min(g.height - H, p.y - (H >> 1)));
  const rows: string[] = [];
  for (let y = y0; y < y0 + H; y++) {
    let row = "";
    let last = -1;
    for (let x = x0; x < x0 + W; x++) {
      const [ch, col] = cell(game, x, y);
      if (col !== last && ch !== " ") {
        row += fg(col, ch === "@");
        last = col;
      }
      row += ch;
    }
    rows.push(row + RESET);
  }
  const f = game.floorSpec;
  const hp = p.hp <= p.maxHp * 0.3 ? 203 : 120;
  rows.push(`${fg(hp, true)}HP ${p.hp}/${p.maxHp}${RESET}  ${fg(215)}floor ${f.index + 1}/${game.spec.floors.length} ${f.name}${RESET}  ${fg(245)}turn ${p.turns}${RESET}`);
  return rows.join("\r\n");
}

/** The last `turns` turns of a run as a .cast file, or null if the log is broken. */
export function castOf(spec: DungeonSpec, run: number, mods: ModId[], log: string, turns = 120): string | null {
  const actions = decodeLog(log);
  if (!actions) return null;
  // First pass: how long the run is.
  const probe = new Game(spec, { run, mods });
  for (const a of actions) if (probe.outcome === "playing") probe.act(a);
  const from = Math.max(0, probe.player.turns - turns);

  const game = new Game(spec, { run, mods });
  const header = { version: 2, width: W, height: H + 1, title: `HEADCRAWL ${spec.repo.name}`, env: { TERM: "xterm-256color" } };
  const lines = [JSON.stringify(header)];
  let t = 0;
  const push = () => {
    lines.push(JSON.stringify([Number(t.toFixed(3)), "o", `${ESC}2J${ESC}H${frame(game)}`]));
    t += FRAME_S;
  };
  if (from === 0) push();
  for (const a of actions) {
    if (game.outcome !== "playing") break;
    const before = game.player.turns;
    game.act(a);
    if (game.player.turns !== before && game.player.turns >= from) push();
  }
  // Hold the last frame a moment so the ending reads.
  lines.push(JSON.stringify([Number((t + 1.5).toFixed(3)), "o", ""]));
  return lines.join("\n") + "\n";
}
