// Things you pick up and use: TODOs, HACKs, FIXMEs, XXX curses and coffee.

import { Tile } from "../map/grid";
import { COFFEE_HEAL, DROPS, potionHeal } from "./balance";
import { killMonster, bossPhase } from "./combat";
import { boss, canRewind, heat, npcAt, rewindFloor, timeTravel } from "./extras";
import type { Game } from "./game";
import { ELITE } from "./elites";
import { armor, armorBonus, describe, guardName, TRAITS, weapon, weaponBonus, type Gear } from "./gear";
import type { Item, ItemKind, Monster } from "./types";

/** Leave something on the nearest free floor cell. */
export function drop(g: Game, x: number, y: number, kind: Extract<ItemKind, "coffee" | "weapon" | "armor">, gear?: Gear, source = ""): void {
  const grid = g.floor.map.grid;
  const spots = [
    [x, y],
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
    [x + 1, y + 1],
    [x - 1, y - 1],
  ];
  for (const [sx, sy] of spots) {
    if (grid.get(sx, sy) === Tile.Floor && !g.itemAt(sx, sy) && !npcAt(g.floor, sx, sy) && !(sx === g.player.x && sy === g.player.y)) {
      g.floor.items.push({ id: `c${g.spawnCount++}`, kind, x: sx, y: sy, loot: null, source, ...(gear ? { gear } : {}) });
      return;
    }
  }
}

export function pickUp(g: Game, item: Item): void {
  if (item.gear) return touchGear(g, item, item.gear);
  const p = g.player;
  g.floor.items = g.floor.items.filter((i) => i !== item);
  g.emit({ t: "pickup", x: item.x, y: item.y, kind: item.kind });
  const quote = item.loot ? `"${item.loot.text || item.loot.tag}"` : "";
  // "a TODO from 2019" is half the joke.
  const year = item.loot?.year ? ` from ${item.loot.year}${item.loot.year_or_older ? " or earlier" : ""}` : "";
  const since = item.loot?.author ? `${year} by ${item.loot.author}` : year;
  switch (item.kind) {
    case "potion":
      p.potions.push(item);
      g.say(`You pick up a potion, a TODO${since}: ${quote} (${item.source}). q drinks it.`, "loot");
      break;
    case "scroll":
      p.scrolls.push(item);
      g.say(`You find a scroll, a HACK${since}: ${quote} (${item.source}). r reads it.`, "loot");
      break;
    case "curse":
      p.curses++;
      p.atk += 2;
      p.maxHp = Math.max(10, p.maxHp - 5);
      p.hp = Math.min(p.hp, p.maxHp);
      g.say(`A curse, XXX ${quote}. It bites. Attack +2, max HP -5.`, "bad");
      break;
    case "coffee":
      g.heal(g.has("caffeine") ? COFFEE_HEAL * 3 : COFFEE_HEAL);
      g.say("Coffee. Still warm.", "good");
      break;
  }
}

export function quaff(g: Game): boolean {
  const item = g.player.potions.shift();
  if (!item) {
    g.say("No potions left.");
    return false;
  }
  const heal = potionHeal(item.loot?.power ?? 1);
  g.heal(heat(g.mods) >= 2 ? Math.ceil(heal / 2) : heal);
  g.say(`You finally do the TODO. You feel better.`, "good");
  return true;
}

export function readScroll(g: Game): boolean {
  const item = g.player.scrolls.shift();
  if (!item) {
    g.say("No scrolls to read.");
    return false;
  }
  const power = item.loot?.power ?? 3;
  const target = boss(g.floor);
  const roll = g.rng.int(0, canRewind(g.floor) ? 3 : 2);
  if (roll === 3) {
    const t = target ? timeTravel(target) : null;
    const floor = rewindFloor(g.floor, g.rng, g.spec.floors.length, g.player, g.mods);
    const year = t?.year ?? floor?.year ?? 0;
    g.say(`Time slips. The floor is the way it was in ${year}${floor?.swapped ? `, ${floor.swapped} monsters with it` : ""}. git checkout.`, "loot");
    if (t && target) g.say(`${target.name} goes back to ${t.after} paths from ${t.before}. It was ${t.after < t.before ? "simpler" : "worse"} back then.`, "loot");
    g.emit({ t: "rewind" });
  } else if (roll === 0) {
    const targets = g.floor.monsters.filter((m) => g.isVisible(m.x, m.y));
    g.say(`${targets.length ? "Everything in sight takes a hit." : "Nothing in sight to hit. What a waste."} force push.`, "loot");
    for (const m of targets) {
      const dmg = 6 + power * 2;
      m.hp -= dmg;
      g.emit({ t: "hit", x: m.x, y: m.y, amount: dmg, crit: false, onPlayer: false });
      if (m.hp <= 0) killMonster(g, m);
      else if (m.boss) bossPhase(g, m);
      if (g.outcome !== "playing") break;
    }
  } else if (roll === 1) {
    g.floor.seen.fill(0);
    const grid = g.floor.map.grid;
    for (let i = 0; i < grid.tiles.length; i++) if (grid.tiles[i] !== Tile.Rock) g.floor.seen[i] = 1;
    g.emit({ t: "reveal" });
    g.say("You see the whole floor at once. Thanks, git blame.", "loot");
  } else {
    g.heal(g.player.maxHp);
    g.say("A hotfix. Ugly, but you are back on your feet.", "loot");
  }
  return true;
}

// ---- gear ----------------------------------------------------------------

/** Walking onto a weapon or armor: an empty slot takes it, a full one asks. */
function touchGear(g: Game, item: Item, gear: Gear): void {
  const mine = g.player[gear.slot];
  if (!mine) return equip(g, item, gear);
  g.gearChoice = item;
  g.say(`${describe(gear)} lies here. You have ${describe(mine)}.`, "loot", true);
}

/** Take what lies here. Whatever you had goes down in its place. */
export function equip(g: Game, item: Item, gear: Gear): void {
  const p = g.player;
  const old = p[gear.slot];
  g.floor.items = g.floor.items.filter((i) => i !== item);
  p[gear.slot] = gear;
  g.wielded.push(gear);
  if (old) {
    const id = `g${g.spawnCount++}`;
    g.floor.items.push({ id, kind: old.slot, x: item.x, y: item.y, loot: null, source: "you left it here", gear: old });
    g.declined.add(id);
  }
  g.emit({ t: "equip", x: item.x, y: item.y, gear });
  if (gear.slot === "armor") g.say(`You put on ${gear.name}. Defense ${gear.bonus}.`, "loot");
  else {
    const t = gear.trait === "plain" ? "" : ` ${TRAITS[gear.trait].name}: ${TRAITS[gear.trait].text}.`;
    g.say(`You take up ${gear.name}. Attack +${gear.bonus}.${t}`, "loot");
  }
}

/** Every finished function might leave something behind, named after itself. */
export function dropGear(g: Game, m: Monster): void {
  const e = m.enemy;
  if (!e) return;
  const room = g.floor.map.rooms[m.room]?.spec;
  if (!room) return;
  const depth = g.floor.index;
  if (!g.rng.chance(m.affix ? ELITE.gear : DROPS.gear)) return;
  const asArmor = g.rng.chance(DROPS.armorShare);
  const gear = asArmor
    ? armor(guardName(e.name, room.language), room.language, armorBonus(Math.min(8, e.nesting * 2), depth))
    : weapon(e.name, room.language, weaponBonus(Math.min(9, Math.ceil(e.ccn / 3)), depth));
  drop(g, m.x, m.y, gear.slot, gear, `${room.path}:${e.line}`);
}

/** A beaten boss leaves its own function behind, the best weapon on the floor. */
export function dropBossWeapon(g: Game, m: Monster): void {
  const room = g.floor.map.rooms[m.room]?.spec;
  if (!m.boss || !room) return;
  const gear = weapon(m.name, room.language, weaponBonus(5, g.floor.index));
  drop(g, m.x, m.y, "weapon", gear, `${room.path}:${m.boss.line}`);
}
