// Every tuning number for combat and items lives here.

export const PLAYER = {
  hp: 36,
  atk: 5,
  regenEvery: 4,
  sight: 9,
  hpPerLevel: 8,
  atkPerLevel: 1,
};

export const HIT = {
  player: 0.9,
  monster: 0.68,
  crit: 0.1,
};

export const DROPS = {
  coffee: 0.2,
  bossCoffee: 2,
};

export const BOSS = {
  tauntEvery: 9,
  phaseAt: 0.5,
  phaseSpeed: 20,
  spawns: 2,
};

export function xpForLevel(level: number): number {
  return Math.round(14 * level ** 1.45);
}

export function potionHeal(power: number): number {
  return 8 + power * 2;
}

export const COFFEE_HEAL = 6;

export function bladeBonus(power: number, floor: number): number {
  return 1 + Math.ceil(power / 3) + Math.floor(floor / 2);
}

export const WAKE_RANGE = 5;

/** Deeper floors hit a bit harder, on top of what the code says. */
export function depthScale(floor: number): number {
  return 0.8 + floor * 0.12;
}
