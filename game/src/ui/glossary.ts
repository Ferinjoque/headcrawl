// What each thing in the dungeon is, said once. Game words first, so nobody
// needs to know code to play; `real` is the bit of code it was made from, in
// plain words, for anyone curious. Help, the bestiary, the side panel and the
// hover tips all read from here.

import type { ItemKind, Monster } from "../game/types";

export interface Term {
  name: string;
  /** What it does to you, or what you do with it. */
  does: string;
  /** Where it comes from in the code. */
  real: string;
}

export const MONSTERS: Record<Monster["archetype"], Term & { short: string }> = {
  tangle: { name: "tangle", short: "regrows", does: "regrows 1 HP every turn. Finish it fast.", real: "a function with lots of paths through it" },
  nest: { name: "nest", short: "winds up big hits", does: "winds up a heavy hit. Step out of the red.", real: "code nested many levels deep" },
  hydra: { name: "hydra", short: "splits when hurt", does: "splits in two the first time it gets hurt", real: "a function that takes too many inputs" },
  wall: { name: "wall", short: "armored, slow", does: "armored, takes 2 less damage. Slow.", real: "a very long function" },
  imp: { name: "imp", short: "fast", does: "small and fast", real: "a tiny function" },
  bug: { name: "bug", short: "dodgy", does: "dodges one hit in five. Can't reproduce.", real: "an everyday function" },
  ghost: { name: "ghost", short: "walks through walls", does: "drifts through walls, hits softly", real: "dead code: nothing uses it any more" },
  remote: { name: "remote", short: "shoots from afar", does: "shoots along a line from up to 4 cells. Step off the red.", real: "a small function that talks to the internet" },
  spawn: { name: "helper", short: "helper", does: "called in by its boss", real: "the boss asking for help" },
  boss: { name: "boss", short: "boss", does: "winds up area attacks. Get out of the red.", real: "the worst function in the file people keep rewriting" },
};

export const LOOT: Record<ItemKind, Term & { glyph: string }> = {
  potion: { glyph: "!", name: "potion", does: "heals you. q drinks one.", real: "a TODO: a note someone left to finish later" },
  scroll: { glyph: "?", name: "scroll", does: "a random trick. r reads one.", real: "a HACK: a quick fix nobody was proud of" },
  curse: { glyph: "%", name: "curse", does: "attack up, max HP down", real: "an XXX: a warning that something here is wrong" },
  weapon: { glyph: "/", name: "weapon", does: "adds to your attack and fights like its language", real: "a FIXME, or the function a monster dropped" },
  armor: { glyph: "[", name: "armor", does: "takes some damage off every hit", real: "a file of tests, or the error handling around a function" },
  coffee: { glyph: "c", name: "coffee", does: "heals a little", real: "what monsters drop. Same as in real life." },
};

export const PLACES: (Term & { glyph: string })[] = [
  { glyph: ">", name: "floor", does: "beat its boss and the stairs down open", real: "a folder. Deeper floors hold the code the rest relies on." },
  { glyph: "", name: "room", does: "bigger rooms hold more", real: "a file, sized by how long it is" },
  { glyph: "~", name: "corridor", does: "", real: "one file using another" },
  { glyph: "#", name: "passage", does: "", real: "files that sit next to each other in a folder" },
  { glyph: "o~", name: "loop", does: "walks you back where you came from, once", real: "two files that each need the other" },
  { glyph: "*", name: "shrine", does: "step on it to heal, once", real: "a test file" },
  { glyph: "<<<", name: "two-version room", does: "both versions of the room fight you", real: "a merge conflict: two edits pasted into one file by mistake" },
  { glyph: "Y", name: "side door", does: "> goes in: no boss, a weapon by the stairs", real: "a branch: another version of the same code" },
  { glyph: "$", name: "shop", does: "one buy per floor. Every deal helps and every one costs.", real: "the libraries the code is built on" },
  { glyph: "&", name: "keeper", does: "say hi once for a coffee", real: "whoever wrote most of this floor" },
];

/** The help tab for the curious: how code turns into a dungeon. */
export const BEHIND = [
  "Every dungeon is built from a real program's source code. You don't need to read code to play.",
  "Folders are floors and files are rooms. Every function, one small job the program does, is a monster, and its name comes from the function's: load_payload is the Payload Loader.",
  "A function that is hard to follow is a tough monster: more paths through it means more HP, deeper nesting hits harder, more inputs moves faster.",
  "Each floor's boss is the most tangled function in the file that changed the most.",
  "Notes programmers leave in their code are the loot. TODO is a potion, FIXME a weapon, HACK a scroll, XXX a curse.",
  "The same version of the code always builds the same dungeon, so a run code gives a friend your exact game.",
];
