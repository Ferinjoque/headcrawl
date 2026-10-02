// What each kind of monster does besides walking at you and hitting. Every
// ability has an answer the player can find: step out of the red, focus the
// regrowing one, don't waste a scroll on the armored one.

import type { Monster } from "./types";

export const ABILITY: Record<Monster["archetype"], string> = {
  tangle: "regrows 1 HP every turn, finish it fast",
  nest: "winds up a heavy hit, step out of the red",
  hydra: "splits in two the first time it gets hurt",
  wall: "armored, takes 2 less damage, slow",
  imp: "small and fast",
  bug: "dodges one hit in five. Can't reproduce.",
  spawn: "a helper its boss called in",
  boss: "winds up an area attack, get out of the red",
};

export const TUNING = {
  tangleRegen: 1,
  wallArmor: 2,
  wallSpeed: 75,
  impSpeed: 130,
  bugDodge: 0.2,
  nestWindupMultiplier: 2,
  bossSweepEvery: 4,
  bossSweepRadius: 2,
  bossSweepMultiplier: 1.5,
  hydraMinHp: 4,
  windupCooldown: 3,
};
