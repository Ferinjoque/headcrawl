// The last stretch of a run as an animated GIF, drawn by the real renderer
// on a canvas that never touches the page. Rebuilt from the action log.

import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { Game } from "../game/game";
import type { ModId } from "../game/extras";
import { decodeLog } from "../game/record";
import { Effects } from "../render/effects";
import { Renderer } from "../render/renderer";
import type { DungeonSpec } from "../spec";

const WIDTH = 640;
const HEIGHT = 400;
const DELAY_MS = 120;

export async function gifOf(spec: DungeonSpec, run: number, mods: ModId[], log: string, turns = 60): Promise<Blob | null> {
  const actions = decodeLog(log);
  if (!actions) return null;
  const probe = new Game(spec, { run, mods });
  for (const a of actions) if (probe.outcome === "playing") probe.act(a);
  const from = Math.max(0, probe.player.turns - turns);

  const canvas = document.createElement("canvas");
  const renderer = new Renderer(canvas);
  renderer.reduced = true;
  renderer.sizeTo(WIDTH, HEIGHT, 1);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const fx = new Effects();
  fx.reduced = true;
  const gif = GIFEncoder();
  const game = new Game(spec, { run, mods });
  let frames = 0;
  const shoot = (hold = 1) => {
    renderer.render(
      { floor: game.floor, player: game.player, sight: game.sight, threat: game.threatened() },
      fx,
      frames * DELAY_MS,
    );
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(data, 96);
    gif.writeFrame(applyPalette(data, palette), canvas.width, canvas.height, { palette, delay: DELAY_MS * hold });
    frames++;
  };
  renderer.snapCamera();
  if (from === 0) shoot();
  for (const a of actions) {
    if (game.outcome !== "playing") break;
    const before = game.player.turns;
    const floor = game.floor.index;
    game.act(a);
    if (game.floor.index !== floor) renderer.snapCamera();
    if (game.player.turns !== before && game.player.turns >= from) {
      shoot();
      // Let the page breathe between frames on long clips.
      if (frames % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }
  shoot(12);
  gif.finish();
  return new Blob([new Uint8Array(gif.bytes())], { type: "image/gif" });
}
