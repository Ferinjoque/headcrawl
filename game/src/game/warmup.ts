// New players meet the systems a floor at a time. The first floor is fights
// and loot; the shop, elites and outdated code come in on the second; keepers,
// side doors and two-version rooms on the third. The last floor always has
// everything, and so do hard runs and the lab. Reverted monsters come in with
// the elites.

export type Feature = "shop" | "elites" | "deprecated" | "reverts" | "keeper" | "branch" | "conflicts";

const FROM: Record<Feature, number> = { shop: 1, elites: 1, deprecated: 1, reverts: 1, keeper: 2, branch: 2, conflicts: 2 };

/** Whether a feature shows up on the floor with this index. */
export type Gate = (feature: Feature, index: number) => boolean;

export const OPEN: Gate = () => true;

export function gateFor(floors: number, full: boolean): Gate {
  if (full) return OPEN;
  return (feature, index) => index >= FROM[feature] || index === floors - 1;
}
