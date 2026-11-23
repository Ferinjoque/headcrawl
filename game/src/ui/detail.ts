// How much of the code the screens show. On hover (the default) they talk
// about the game, and code facts (paths, metrics, commits, git words) wait
// for a hover or a tap. Everywhere puts them back in the panel, log and cards.

import { TRAITS, type Gear, type Trait } from "../game/gear";
import { gameName, gearLabel, monsterLabel, showNames } from "../game/names";
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
  return text ? showNames(text, mode === "all") : null;
}

/** "src/app/views.py" -> "views.py": the room's file, without the folders. */
export function roomName(path: string): string {
  return path.split("/").pop() || path;
}

/** "tests/test_signer.py" -> "the Signer's room". */
export function roomLabel(path: string): string {
  const stem = roomName(path).replace(/.[A-Za-z0-9]+$/, "");
  const name = gameName(stem).replace(/^the /, "");
  return `the ${name.endsWith("s") ? `${name}'` : `${name}'s`} room`;
}

/** A tool's game name, or the developer's word for it with code details on. */
export function toolName(id: PerkId): string {
  return mode === "all" ? PERKS[id].name : PERKS[id].title;
}

/** A monster's name on screen: its game name, or its real one with code details on. */
export function monsterName(m: { name: string; boss?: { title: string } | null }): string {
  return mode === "all" ? m.name : monsterLabel(m);
}

/** A piece of gear's name on screen. */
export function gearShown(g: Gear): string {
  return mode === "all" ? g.name : gearLabel(g);
}

export function traitName(t: Trait): string {
  return mode === "all" ? TRAITS[t].name : TRAITS[t].title;
}

/** "Payload Loader's Spear +4, quick" or, with code details on, "load_payload +4, async". */
export function gearLine(g: Gear): string {
  if (g.slot === "armor") return `${gearShown(g)}, defense ${g.bonus}`;
  return g.trait === "plain" ? `${gearShown(g)} +${g.bonus}` : `${gearShown(g)} +${g.bonus}, ${traitName(g.trait)}`;
}
