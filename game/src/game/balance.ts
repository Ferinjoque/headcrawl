// Tuning numbers for combat, items and difficulty.

export const PLAYER = {
  hp: 36,
  atk: 5,
  regenEvery: 4,
  sight: 9,
  hpPerLevel: 5,
  // Perks carry most of the growth now; raw attack only every other level.
  atkEveryLevels: 2,
};

export const HIT = {
  player: 0.9,
  monster: 0.72,
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
  return 0.9 + floor * 0.15;
}

/**
 * Squash values above `cap / 2` so the order between monsters survives but a
 * 300-branch function on floor 1 doesn't end the run on turn 20.
 */
export function softCap(value: number, cap: number): number {
  const knee = cap / 2;
  if (value <= knee) return value;
  return knee + knee * (1 - Math.exp(-(value - knee) / knee));
}

/** 0 on the first floor, 1 on the last. */
export function depthFraction(floor: number, floors: number): number {
  return floors > 1 ? floor / (floors - 1) : 1;
}

export function capsFor(floor: number, floors: number) {
  const t = depthFraction(floor, floors);
  return { hp: 24 + 56 * t, damage: 4 + 6 * t, bossHp: 70 + 230 * t, bossDamage: 5 + 9 * t };
}
