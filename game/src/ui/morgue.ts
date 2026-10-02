// The run log you can save at the end, in the spirit of DCSS morgue files:
// plain text, everything that happened, nice to diff against a friend's.

import type { Game } from "../game/game";
import { floorRow } from "./share";

const KIND_NAMES: Record<string, string> = {
  tangle: "tangles",
  nest: "nests",
  hydra: "hydras",
  wall: "walls",
  imp: "imps",
  bug: "bugs",
  spawn: "helpers",
  boss: "bosses",
};

export function runLog(game: Game, link: string): string {
  const p = game.player;
  const spec = game.spec;
  const f = game.floorSpec;
  const outcome =
    game.outcome === "won"
      ? "Reached HEAD."
      : game.outcome === "dead"
        ? `Killed by ${game.killer} on floor ${f.index + 1} (${f.name}).`
        : `Still on floor ${f.index + 1} (${f.name}).`;
  const kills = Object.entries(p.killsBy)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `  ${String(n).padStart(4)} ${KIND_NAMES[k] ?? k}`);
  const lines = [
    "HEADCRAWL run log",
    "",
    `repo     ${spec.repo.name}`,
    `commit   ${spec.repo.head}`,
    `run      ${game.run}`,
    `link     ${link}`,
    "",
    outcome,
    `floors   ${floorRow(game)}`,
    `level    ${p.level}, ${p.maxHp} max HP, attack ${p.atk + p.blade}`,
    `turns    ${p.turns}`,
    `cursed   ${p.curses}`,
    "",
    `Refactored ${p.kills} functions:`,
    ...(kills.length ? kills : ["  none"]),
    "",
    "Bosses beaten:",
    ...(p.bossNames.length ? p.bossNames.map((b) => `  ${b}`) : ["  none"]),
    "",
    "Floors:",
    ...spec.floors.map((fl) => `  ${String(fl.index + 1).padStart(2)}. ${fl.name.padEnd(28)} boss ${fl.boss.name}`),
    "",
    "Everything that happened (turn, message):",
    ...game.journal,
    "",
  ];
  return lines.join("\n");
}

export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function logFileName(game: Game): string {
  const repo = game.spec.repo.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "repo";
  return `headcrawl-${repo}-${game.spec.repo.head.slice(0, 7)}-run${game.run}.txt`;
}
