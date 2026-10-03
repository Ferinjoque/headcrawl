// Taking a finished run with you: the run log, a GIF, an asciinema cast and
// replay or race links. All of them are rebuilt from the action log.

import type { Game } from "../game/game";
import { RULES } from "../game/record";
import { castOf } from "./cast";
import { downloadBlob, downloadText, logFileName, runLog } from "./morgue";
import { encodeSpec, playRoute, routeHash, shareLink, type PlayRoute } from "./share";

export function saveLog(game: Game): void {
  downloadText(logFileName(game), runLog(game, shareLink(location.href)));
}

/** The GIF encoder loads only when someone asks for a GIF. */
export async function saveGif(game: Game): Promise<void> {
  const { gifOf } = await import("./gif");
  const blob = await gifOf(game.spec, game.run, game.mods, game.record());
  if (blob) downloadBlob(logFileName(game).replace(/\.txt$/, ".gif"), blob);
}

export function saveCast(game: Game): void {
  const cast = castOf(game.spec, game.run, game.mods, game.record());
  if (cast) downloadBlob(logFileName(game).replace(/\.txt$/, ".cast"), new Blob([cast], { type: "application/x-asciicast" }));
}

/** A link that replays the run (watch) or lets someone play against it (race). */
export function runLink(game: Game, route: PlayRoute, race: boolean): string {
  const log = encodeSpec(game.record());
  const base = playRoute(route);
  const linked: PlayRoute = race ? { ...base, race: log, v: RULES } : { ...base, watch: log, v: RULES };
  return shareLink(location.href.split("#")[0] + routeHash(linked));
}

/** Resolves true when the text made it to the clipboard. */
export function copyText(text: string): Promise<boolean> {
  return navigator.clipboard ? navigator.clipboard.writeText(text).then(() => true, () => false) : Promise.resolve(false);
}
