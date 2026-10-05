// Things you pick up and use: TODOs, HACKs, FIXMEs, XXX curses and coffee.

import { Tile } from "../map/grid";
import { COFFEE_HEAL, bladeBonus, potionHeal } from "./balance";
import { killMonster, bossPhase } from "./combat";
import { boss, canRewind, npcAt, rewindFloor, timeTravel } from "./extras";
import type { Game } from "./game";
import type { Item } from "./types";

/** Leave a coffee on the nearest free floor cell. */
export function drop(g: Game, x: number, y: number, kind: "coffee"): void {
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
      g.floor.items.push({ id: `c${g.spawnCount++}`, kind, x: sx, y: sy, loot: null, source: "" });
      return;
    }
  }
}

export function pickUp(g: Game, item: Item): void {
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
      g.say(`You pick up a TODO${since}: ${quote} (${item.source}). Press q to drink it.`, "loot");
      break;
    case "scroll":
      p.scrolls.push(item);
      g.say(`You find a HACK${since}: ${quote} (${item.source}). Press r to read it.`, "loot");
      break;
    case "blade": {
      const bonus = bladeBonus(item.loot?.power ?? 1, g.floor.index);
      if (bonus > p.blade) {
        p.blade = bonus;
        g.say(`You take up the FIXME${since} ${quote}. Attack +${bonus}.`, "loot");
      } else {
        g.say(`Another FIXME ${quote}. Your current one is sharper.`, "loot");
      }
      break;
    }
    case "curse":
      p.curses++;
      p.atk += 2;
      p.maxHp = Math.max(10, p.maxHp - 5);
      p.hp = Math.min(p.hp, p.maxHp);
      g.say(`XXX ${quote}. It bites. Attack +2, max HP -5.`, "bad");
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
    g.say("No TODOs left to finish.");
    return false;
  }
  g.heal(potionHeal(item.loot?.power ?? 1));
  g.say(`You finally do the TODO. You feel better.`, "good");
  return true;
}

export function readScroll(g: Game): boolean {
  const item = g.player.scrolls.shift();
  if (!item) {
    g.say("You have no HACKs to read.");
    return false;
  }
  const power = item.loot?.power ?? 3;
  const target = boss(g.floor);
  const roll = g.rng.int(0, canRewind(g.floor) ? 3 : 2);
  if (roll === 3) {
    const t = target ? timeTravel(target) : null;
    const floor = rewindFloor(g.floor, g.rng, g.spec.floors.length, g.player, g.mods);
    const year = t?.year ?? floor?.year ?? 0;
    g.say(`git checkout ${year}. The floor goes back a year${floor?.swapped ? `: ${floor.swapped} functions are the way they were` : ""}.`, "loot");
    if (t && target) g.say(`${target.name} goes back to ${t.after} branches from ${t.before}. It was ${t.after < t.before ? "simpler" : "worse"} back then.`, "loot");
    g.emit({ t: "rewind" });
  } else if (roll === 0) {
    const targets = g.floor.monsters.filter((m) => g.isVisible(m.x, m.y));
    g.say(`force push. ${targets.length ? "Everything in sight takes a hit." : "Nothing in sight. What a waste."}`, "loot");
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
    g.say("git blame. The whole floor lights up in your head.", "loot");
  } else {
    g.heal(g.player.maxHp);
    g.say("hotfix. Ugly, but you are back on your feet.", "loot");
  }
  return true;
}
