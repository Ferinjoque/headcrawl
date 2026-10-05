// What each game event looks like: floating numbers, flashes, sparks and
// shake. Sound, the log and the title cards are the app's business.

import type { Game } from "../game/game";
import type { GameEvent } from "../game/types";
import type { Effects } from "./effects";
import { C } from "./palette";

export function eventFx(e: GameEvent, fx: Effects, game: Game, now: number, quiet = false): void {
  // Behind the title only light shows: flashes and sparks, never words or numbers.
  if (quiet && (e.t === "hit" || e.t === "miss" || e.t === "heal" || e.t === "levelup" || e.t === "dodge" || e.t === "split" || e.t === "equip")) {
    if (e.t === "hit" || e.t === "split") fx.flash(e.x, e.y, e.t === "hit" && e.onPlayer ? C.danger : C.player, now);
    return;
  }
  switch (e.t) {
    case "hit":
      if (!e.onPlayer && game.player.weapon && Math.max(Math.abs(e.x - game.player.x), Math.abs(e.y - game.player.y)) === 1) {
        fx.swing(game.player.x, game.player.y, e.x, e.y, e.crit ? C.gold : C.steel, now);
      }
      fx.float(e.x, e.y, e.crit ? `${e.amount}!` : String(e.amount), e.onPlayer ? C.danger : e.crit ? C.gold : C.text, now);
      fx.flash(e.x, e.y, e.onPlayer ? C.danger : C.player, now);
      if (e.onPlayer && e.amount >= 5) fx.shake(4, now);
      if (e.crit) {
        fx.shake(3, now);
        fx.burst(e.x, e.y, "*+*+", C.gold, now, 0.7);
      }
      break;
    case "miss":
      fx.float(e.x, e.y, "miss", C.dim, now);
      break;
    case "kill":
      fx.flash(e.x, e.y, e.boss ? C.boss : C.ember, now);
      fx.burst(e.x, e.y, e.name, e.boss ? C.boss : C.ember, now, e.boss ? 1.6 : 1);
      if (e.boss) fx.shake(9, now);
      break;
    case "heal":
      if (e.amount > 0) fx.float(e.x, e.y, `+${e.amount}`, C.hp, now);
      break;
    case "pickup":
      fx.flash(e.x, e.y, C.loot, now);
      break;
    case "shot": {
      const steps = Math.max(Math.abs(e.tx - e.x), Math.abs(e.ty - e.y));
      for (let i = 1; i < steps; i++) {
        fx.flash(Math.round(e.x + ((e.tx - e.x) * i) / steps), Math.round(e.y + ((e.ty - e.y) * i) / steps), C.gold, now);
      }
      if (!quiet) fx.float(e.tx, e.ty - 0.6, "nit:", C.gold, now);
      break;
    }
    case "equip":
      fx.flash(e.x, e.y, C.loot, now);
      fx.float(e.x, e.y, e.gear.name.length > 18 ? `${e.gear.name.slice(0, 17)}…` : e.gear.name, C.loot, now);
      break;
    case "levelup":
      fx.float(game.player.x, game.player.y, `LEVEL ${e.level}`, C.gold, now);
      break;
    case "intro":
      fx.shake(5, now);
      break;
    case "death":
      fx.shake(10, now);
      break;
    case "telegraph":
      fx.flash(e.x, e.y, C.danger, now);
      break;
    case "dodge":
      fx.float(e.x, e.y, "dodge", C.dim, now);
      break;
    case "split":
      fx.float(e.x, e.y, "split", C.danger, now);
      fx.flash(e.x, e.y, C.danger, now);
      break;
    case "loop":
      fx.flash(game.player.x, game.player.y, C.violet, now);
      break;
    case "rewind":
      for (const m of game.floor.monsters) if (game.isVisible(m.x, m.y)) fx.flash(m.x, m.y, C.violet, now);
      fx.shake(4, now);
      break;
    case "descend":
      fx.clear();
      break;
    default:
      break;
  }
}
