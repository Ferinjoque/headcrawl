// How much of the code the screens show. On hover (the default) they talk
// about the game, and code facts (paths, metrics, commits, git words) wait
// for a hover or a tap. Everywhere puts them back in the panel, log and cards.

import { PERKS, type PerkId } from "../game/perks";

export type CodeDetail = "hover" | "all";

let mode: CodeDetail = "hover";

export function setCodeDetail(next: CodeDetail): void {
  mode = next;
}

/** True when code facts go everywhere, not just in hover tips. */
export function codeEverywhere(): boolean {
  return mode === "all";
}

/** A log line in the current mode; null when there is nothing to show. */
export function logText(e: { text: string; full?: string }): string | null {
  const text = mode === "all" && e.full ? e.full : e.text;
  return text || null;
}

/** "src/app/views.py" -> "views.py": the room's name without the folders. */
export function roomName(path: string): string {
  return path.split("/").pop() || path;
}

/** A tool's game name, or the developer's word for it with code details on. */
export function toolName(id: PerkId): string {
  return mode === "all" ? PERKS[id].name : PERKS[id].title;
}
