// The rules. No DOM in here, so the whole game can run in tests and in the bot.

import { FOV } from "rot-js";
import { Rng } from "../core/rng";
import type { DungeonSpec } from "../spec";
import { findPath } from "../map/astar";
import { seeThrough, Tile, walkable } from "../map/grid";
import { BOSS, COFFEE_HEAL, DROPS, HIT, PLAYER, WAKE_RANGE, bladeBonus, potionHeal, xpForLevel } from "./balance";
import { buildFloor, type FloorState } from "./world";
import type { Action, GameEvent, Item, Monster, Outcome, Player, Tone } from "./types";

export interface GameOptions {
  /** Changes combat rolls but not the dungeon, so friends can race the same map. */
  run?: number;
}

export class Game {
  readonly spec: DungeonSpec;
  readonly run: number;
  readonly player: Player;
  floor: FloorState;
  outcome: Outcome = "playing";
  killer: string | null = null;
  private rng: Rng;
  private events: GameEvent[] = [];
  private spawnCount = 0;

  constructor(spec: DungeonSpec, opts: GameOptions = {}) {
    this.spec = spec;
    this.run = opts.run ?? 0;
    this.rng = new Rng(`${spec.seed}/run/${this.run}`);
    this.floor = buildFloor(spec.floors[0], spec.seed);
    const [x, y] = this.floor.map.start;
    this.player = {
      x,
      y,
      hp: PLAYER.hp,
      maxHp: PLAYER.hp,
      atk: PLAYER.atk,
      blade: 0,
      level: 1,
      xp: 0,
      nextXp: xpForLevel(1),
      potions: [],
      scrolls: [],
      curses: 0,
      kills: 0,
      bosses: 0,
      turns: 0,
    };
    this.updateSight();
    this.enterFloorMessages();
  }

  get floorSpec() {
    return this.spec.floors[this.floor.index];
  }

  /** Events produced since the last call. The UI animates and logs these. */
  drain(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private say(text: string, tone: Tone = "info"): void {
    this.emit({ t: "msg", text, tone });
  }

  monsterAt(x: number, y: number): Monster | undefined {
    return this.floor.monsters.find((m) => m.x === x && m.y === y);
  }

  itemAt(x: number, y: number): Item | undefined {
    return this.floor.items.find((i) => i.x === x && i.y === y);
  }

  roomOfPlayer() {
    const i = this.floor.map.grid.roomAt(this.player.x, this.player.y);
    return i >= 0 ? this.floor.map.rooms[i] : null;
  }

  isVisible(x: number, y: number): boolean {
    const g = this.floor.map.grid;
    return g.inside(x, y) && this.floor.visible[g.idx(x, y)] === 1;
  }

  /** Apply one player action. Returns false if it did not take a turn. */
  act(action: Action): boolean {
    if (this.outcome !== "playing") return false;
    let took = false;
    switch (action.type) {
      case "move":
        took = this.tryMove(action.dx, action.dy);
        break;
      case "wait":
        took = true;
        break;
      case "descend":
        took = this.tryDescend();
        break;
      case "quaff":
        took = this.quaff();
        break;
      case "read":
        took = this.readScroll();
        break;
    }
    if (!took || this.outcome !== "playing") return took;
    this.player.turns++;
    const p = this.player;
    if (p.turns % PLAYER.regenEvery === 0) p.hp = Math.min(p.maxHp, p.hp + 1 + Math.floor(p.level / 4));
    this.monstersAct();
    this.updateSight();
    return true;
  }

  private tryMove(dx: number, dy: number): boolean {
    const p = this.player;
    const nx = p.x + dx;
    const ny = p.y + dy;
    const target = this.monsterAt(nx, ny);
    if (target) {
      this.playerAttack(target);
      return true;
    }
    const grid = this.floor.map.grid;
    if (!walkable(grid.get(nx, ny))) return false;
    // No squeezing diagonally between two walls.
    if (dx && dy && !walkable(grid.get(p.x + dx, p.y)) && !walkable(grid.get(p.x, p.y + dy))) return false;
    const before = grid.roomAt(p.x, p.y);
    p.x = nx;
    p.y = ny;
    this.stepOn(before);
    return true;
  }

  private stepOn(prevRoom: number): void {
    const p = this.player;
    const grid = this.floor.map.grid;
    const item = this.itemAt(p.x, p.y);
    if (item) this.pickUp(item);
    const tile = grid.get(p.x, p.y);
    const roomIndex = grid.roomAt(p.x, p.y);
    if (tile === Tile.Shrine && !this.floor.shrinesUsed.has(roomIndex)) {
      this.floor.shrinesUsed.add(roomIndex);
      const amount = p.maxHp - p.hp;
      p.hp = p.maxHp;
      this.emit({ t: "heal", x: p.x, y: p.y, amount });
      this.say("The tests pass. You feel whole again.", "good");
    }
    if (tile === Tile.StairsDown) this.say("Stairs down. Press > to descend.", "info");
    if (roomIndex >= 0 && roomIndex !== prevRoom && grid.get(p.x, p.y) !== Tile.Wall) this.enterRoom(roomIndex);
  }

  private enterRoom(index: number): void {
    const rect = this.floor.map.rooms[index];
    const room = rect.spec;
    if (rect === this.floor.map.lair && !this.floor.bossDead) {
      const boss = this.floor.monsters.find((m) => m.boss);
      if (boss) this.taunt(boss, 0);
    }
    if (room.blurb) this.say(`${room.path}: ${room.blurb}`, "lore");
  }

  private taunt(m: Monster, which?: number): void {
    const lines = m.boss?.taunts ?? [];
    if (!lines.length) return;
    const text = lines[which ?? this.rng.int(0, lines.length - 1)];
    m.lastTaunt = this.player.turns;
    this.emit({ t: "taunt", name: `${m.name}, ${m.boss!.title}`, text });
  }

  private playerAttack(m: Monster): void {
    const p = this.player;
    if (!this.rng.chance(HIT.player)) {
      this.emit({ t: "miss", x: m.x, y: m.y });
      this.say(`You miss ${m.name}.`);
      return;
    }
    const crit = this.rng.chance(HIT.crit);
    let dmg = p.atk + p.blade + this.rng.int(0, 1 + Math.floor(p.level / 2));
    if (crit) dmg *= 2;
    m.hp -= dmg;
    m.awake = true;
    this.emit({ t: "hit", x: m.x, y: m.y, amount: dmg, crit, onPlayer: false });
    if (m.hp <= 0) this.killMonster(m);
    else if (m.boss) this.bossPhase(m);
  }

  private killMonster(m: Monster): void {
    const p = this.player;
    this.floor.monsters = this.floor.monsters.filter((x) => x !== m);
    p.kills++;
    this.emit({ t: "kill", x: m.x, y: m.y, name: m.name, boss: !!m.boss });
    if (m.boss) {
      p.bosses++;
      this.floor.bossDead = true;
      this.say(`${m.name} falls. ${m.boss.final ? "HEAD is yours." : "The way down opens."}`, "boss");
      if (m.boss.final) {
        this.outcome = "won";
        this.emit({ t: "victory" });
        return;
      }
      const [sx, sy] = this.floor.map.stairsDown;
      this.floor.map.grid.set(sx, sy, Tile.StairsDown);
      this.emit({ t: "reveal" });
      for (let i = 0; i < DROPS.bossCoffee; i++) this.drop(m.x, m.y, "coffee");
    } else {
      this.say(`You refactor ${m.name} out of existence.`);
      if (this.rng.chance(DROPS.coffee)) this.drop(m.x, m.y, "coffee");
    }
    this.gainXp(m.xp);
  }

  private drop(x: number, y: number, kind: "coffee"): void {
    const grid = this.floor.map.grid;
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
      if (grid.get(sx, sy) === Tile.Floor && !this.itemAt(sx, sy) && !(sx === this.player.x && sy === this.player.y)) {
        this.floor.items.push({ id: `c${this.spawnCount++}`, kind, x: sx, y: sy, loot: null, source: "" });
        return;
      }
    }
  }

  private gainXp(amount: number): void {
    const p = this.player;
    p.xp += amount;
    while (p.xp >= p.nextXp) {
      p.xp -= p.nextXp;
      p.level++;
      p.nextXp = xpForLevel(p.level);
      p.maxHp += PLAYER.hpPerLevel;
      p.atk += PLAYER.atkPerLevel;
      p.hp = Math.min(p.maxHp, p.hp + PLAYER.hpPerLevel + Math.ceil(p.maxHp * 0.3));
      this.emit({ t: "levelup", level: p.level });
      this.say(`Level ${p.level}. You understand this codebase a little better.`, "good");
    }
  }

  private bossPhase(m: Monster): void {
    if (m.phase === 0 && m.hp <= m.maxHp * BOSS.phaseAt) {
      m.phase = 1;
      m.speed += BOSS.phaseSpeed;
      this.taunt(m);
      const grid = this.floor.map.grid;
      let made = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ]) {
        if (made >= BOSS.spawns) break;
        const x = m.x + dx;
        const y = m.y + dy;
        if (grid.get(x, y) !== Tile.Floor || this.monsterAt(x, y) || (x === this.player.x && y === this.player.y)) continue;
        this.floor.monsters.push(this.spawnHelper(m, x, y));
        made++;
      }
      if (made) this.say(`${m.name} calls its helpers.`, "boss");
    }
  }

  private spawnHelper(boss: Monster, x: number, y: number): Monster {
    const n = this.spawnCount++;
    const name = `_${boss.name}_helper${n ? n : ""}`.slice(0, 40);
    return {
      id: `s${n}`,
      name,
      glyph: "_",
      archetype: "spawn",
      x,
      y,
      hp: 6 + this.floor.index * 2,
      maxHp: 6 + this.floor.index * 2,
      damage: 1 + Math.ceil(this.floor.index / 2),
      speed: 110,
      energy: 0,
      xp: 3,
      room: boss.room,
      awake: true,
      boss: null,
      enemy: null,
      phase: 0,
      lastTaunt: 0,
    };
  }

  private pickUp(item: Item): void {
    const p = this.player;
    this.floor.items = this.floor.items.filter((i) => i !== item);
    this.emit({ t: "pickup", x: item.x, y: item.y, kind: item.kind });
    const quote = item.loot ? `"${item.loot.text || item.loot.tag}"` : "";
    switch (item.kind) {
      case "potion":
        p.potions.push(item);
        this.say(`You pick up a TODO: ${quote} (${item.source}). Press q to drink it.`, "loot");
        break;
      case "scroll":
        p.scrolls.push(item);
        this.say(`You find a HACK: ${quote} (${item.source}). Press r to read it.`, "loot");
        break;
      case "blade": {
        const bonus = bladeBonus(item.loot?.power ?? 1, this.floor.index);
        if (bonus > p.blade) {
          p.blade = bonus;
          this.say(`You take up the FIXME ${quote}. Attack +${bonus}.`, "loot");
        } else {
          this.say(`Another FIXME ${quote}. Your current one is sharper.`, "loot");
        }
        break;
      }
      case "curse":
        p.curses++;
        p.atk += 2;
        p.maxHp = Math.max(10, p.maxHp - 5);
        p.hp = Math.min(p.hp, p.maxHp);
        this.say(`XXX ${quote}. It bites. Attack +2, max HP -5.`, "bad");
        break;
      case "coffee":
        this.heal(COFFEE_HEAL);
        this.say("Coffee. Still warm.", "good");
        break;
    }
  }

  private heal(amount: number): void {
    const p = this.player;
    const real = Math.min(amount, p.maxHp - p.hp);
    p.hp += real;
    this.emit({ t: "heal", x: p.x, y: p.y, amount: real });
  }

  private quaff(): boolean {
    const item = this.player.potions.shift();
    if (!item) {
      this.say("No TODOs left to finish.");
      return false;
    }
    this.heal(potionHeal(item.loot?.power ?? 1));
    this.say(`You finally do the TODO. You feel better.`, "good");
    return true;
  }

  private readScroll(): boolean {
    const item = this.player.scrolls.shift();
    if (!item) {
      this.say("You have no HACKs to read.");
      return false;
    }
    const power = item.loot?.power ?? 3;
    const roll = this.rng.int(0, 2);
    if (roll === 0) {
      const targets = this.floor.monsters.filter((m) => this.isVisible(m.x, m.y));
      this.say(`force push. ${targets.length ? "Everything in sight takes a hit." : "Nothing in sight. What a waste."}`, "loot");
      for (const m of targets) {
        const dmg = 6 + power * 2;
        m.hp -= dmg;
        this.emit({ t: "hit", x: m.x, y: m.y, amount: dmg, crit: false, onPlayer: false });
        if (m.hp <= 0) this.killMonster(m);
        else if (m.boss) this.bossPhase(m);
        if (this.outcome !== "playing") break;
      }
    } else if (roll === 1) {
      this.floor.seen.fill(0);
      const g = this.floor.map.grid;
      for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] !== Tile.Rock) this.floor.seen[i] = 1;
      this.emit({ t: "reveal" });
      this.say("git blame. The whole floor lights up in your head.", "loot");
    } else {
      this.heal(this.player.maxHp);
      this.say("hotfix. Ugly, but you are back on your feet.", "loot");
    }
    return true;
  }

  private tryDescend(): boolean {
    const p = this.player;
    if (this.floor.map.grid.get(p.x, p.y) !== Tile.StairsDown) {
      this.say("There are no stairs here.");
      return false;
    }
    const next = this.floor.index + 1;
    this.floor = buildFloor(this.spec.floors[next], this.spec.seed);
    [p.x, p.y] = this.floor.map.start;
    this.emit({ t: "descend", floor: next });
    this.enterFloorMessages();
    return true;
  }

  private enterFloorMessages(): void {
    const f = this.floorSpec;
    const total = this.spec.floors.length;
    this.say(`Floor ${f.index + 1} of ${total}: ${f.name}. Somewhere here waits ${f.boss.name}.`, "boss");
    const room = this.roomOfPlayer();
    if (room) {
      if (room.spec.blurb) this.say(`${room.spec.path}: ${room.spec.blurb}`, "lore");
    }
  }

  private monstersAct(): void {
    for (const m of [...this.floor.monsters]) {
      if (!this.floor.monsters.includes(m)) continue;
      if (!m.awake && this.isVisible(m.x, m.y) && dist(m, this.player) <= (m.boss ? 3 : WAKE_RANGE)) m.awake = true;
      if (!m.awake) continue;
      m.energy += m.speed;
      while (m.energy >= 100 && this.outcome === "playing") {
        m.energy -= 100;
        this.monsterTurn(m);
      }
      if (this.outcome !== "playing") return;
    }
  }

  private monsterTurn(m: Monster): void {
    const p = this.player;
    if (Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1) {
      this.monsterAttack(m);
      return;
    }
    if (m.boss && p.turns - m.lastTaunt >= BOSS.tauntEvery && this.isVisible(m.x, m.y)) this.taunt(m);
    const step = this.stepToward(m);
    if (step) [m.x, m.y] = step;
  }

  private stepToward(m: Monster): [number, number] | null {
    const grid = this.floor.map.grid;
    const p = this.player;
    // Only chase what is reasonably close; sleeping halls stay cheap.
    if (dist(m, p) > 24) return null;
    const path = findPath(grid.width, grid.height, [m.x, m.y], [p.x, p.y], (x, y) => {
      if (!walkable(grid.get(x, y))) return Infinity;
      if (x === p.x && y === p.y) return 1;
      return this.monsterAt(x, y) ? 8 : 1;
    });
    if (!path || path.length < 2) return null;
    const [nx, ny] = path[1];
    if (this.monsterAt(nx, ny) || (nx === p.x && ny === p.y)) return null;
    return [nx, ny];
  }

  private monsterAttack(m: Monster): void {
    const p = this.player;
    if (!this.rng.chance(HIT.monster)) {
      this.emit({ t: "miss", x: p.x, y: p.y });
      return;
    }
    const dmg = this.rng.int(Math.max(1, Math.ceil(m.damage / 2)), m.damage);
    p.hp -= dmg;
    this.emit({ t: "hit", x: p.x, y: p.y, amount: dmg, crit: false, onPlayer: true });
    if (p.hp <= 0) {
      p.hp = 0;
      this.outcome = "dead";
      this.killer = m.name;
      const where = m.enemy ? ` at line ${m.enemy.line}` : "";
      this.say(`${m.name}${where} got you.`, "bad");
      this.emit({ t: "death", killer: m.name });
    }
  }

  private updateSight(): void {
    const { grid } = this.floor.map;
    const { visible, seen } = this.floor;
    visible.fill(0);
    const fov = new FOV.PreciseShadowcasting((x, y) => seeThrough(grid.get(x, y)), { topology: 8 });
    fov.compute(this.player.x, this.player.y, PLAYER.sight, (x, y) => {
      if (!grid.inside(x, y)) return;
      const i = grid.idx(x, y);
      visible[i] = 1;
      seen[i] = 1;
    });
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
