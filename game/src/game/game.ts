// The rules. No DOM in here, so the whole game can run in tests and in the bot.

import { FOV } from "rot-js";
import { Rng } from "../core/rng";
import type { DungeonSpec } from "../spec";
import { seeThrough, Tile, walkable } from "../map/grid";
import { BOSS, COFFEE_HEAL, DROPS, HIT, PLAYER, WAKE_RANGE, bladeBonus, potionHeal, xpForLevel } from "./balance";
import { TUNING } from "./abilities";
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
  private visited = new Set<string>();

  constructor(spec: DungeonSpec, opts: GameOptions = {}) {
    this.spec = spec;
    this.run = opts.run ?? 0;
    this.rng = new Rng(`${spec.seed}/run/${this.run}`);
    this.floor = buildFloor(spec.floors[0], spec.seed, spec.floors.length);
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
    // Sight first, so monsters wake on what the player can see right now.
    this.updateSight();
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
      if (boss?.boss && !this.floor.bossMet) {
        this.floor.bossMet = true;
        boss.awake = true;
        boss.lastTaunt = this.player.turns;
        this.emit({
          t: "intro",
          name: boss.name,
          title: boss.boss.title,
          where: `${room.path}:${boss.boss.line}`,
          text: boss.boss.taunts[0],
          final: Boolean(boss.boss.final),
        });
      } else if (boss) this.taunt(boss);
    }
    if (!this.visited.has(room.id)) {
      this.visited.add(room.id);
      this.say(`${room.path}. ${room.language}, ${room.loc} lines.`, "info");
      if (room.blurb) this.say(`"${room.blurb}"`, "lore");
    }
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
    m.awake = true;
    if (m.archetype === "bug" && this.rng.chance(TUNING.bugDodge)) {
      this.emit({ t: "dodge", x: m.x, y: m.y });
      this.say(`${m.name} dodges. Can't reproduce.`);
      return;
    }
    const crit = this.rng.chance(HIT.crit);
    let dmg = p.atk + p.blade + this.rng.int(0, 1 + Math.floor(p.level / 2));
    if (crit) dmg *= 2;
    if (m.archetype === "wall") dmg = Math.max(1, dmg - TUNING.wallArmor);
    m.hp -= dmg;
    this.emit({ t: "hit", x: m.x, y: m.y, amount: dmg, crit, onPlayer: false });
    if (m.hp <= 0) this.killMonster(m);
    else if (m.boss) this.bossPhase(m);
    else if (m.archetype === "hydra" && !m.split) this.splitHydra(m);
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
      this.say(`${KILL_VERB[m.archetype] ?? "You fix"} ${m.name}.`);
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

  private freeNeighbour(x: number, y: number): [number, number] | null {
    const grid = this.floor.map.grid;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid.get(nx, ny) !== Tile.Floor || this.monsterAt(nx, ny)) continue;
      if (nx === this.player.x && ny === this.player.y) continue;
      return [nx, ny];
    }
    return null;
  }

  /** Too many parameters: hurt it and it comes apart into two smaller calls. */
  private splitHydra(m: Monster): void {
    m.split = true;
    if (m.hp < TUNING.hydraMinHp) return;
    const spot = this.freeNeighbour(m.x, m.y);
    if (!spot) return;
    const half = Math.ceil(m.hp / 2);
    m.hp -= half;
    const n = this.spawnCount++;
    this.floor.monsters.push({ ...m, id: `h${n}`, name: `${m.name}'`, x: spot[0], y: spot[1], hp: half, threat: [], energy: 0 });
    this.emit({ t: "split", x: spot[0], y: spot[1] });
    this.say(`${m.name} splits in two.`, "bad");
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
      threat: [],
      turns: 0,
      cooldown: 0,
      split: true,
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
    this.floor = buildFloor(this.spec.floors[next], this.spec.seed, this.spec.floors.length);
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
    if (room) this.enterRoom(room.index);
  }

  private monstersAct(): void {
    const grid = this.floor.map.grid;
    const chase = this.chaseMap();
    const taken = new Uint8Array(grid.width * grid.height);
    for (const m of this.floor.monsters) taken[grid.idx(m.x, m.y)] = 1;
    for (const m of [...this.floor.monsters]) {
      if (!this.floor.monsters.includes(m)) continue;
      if (!m.awake && this.isVisible(m.x, m.y) && dist(m, this.player) <= (m.boss ? 3 : WAKE_RANGE)) m.awake = true;
      if (!m.awake) continue;
      if (m.archetype === "tangle" && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + TUNING.tangleRegen);
      m.energy += m.speed;
      while (m.energy >= 100 && this.outcome === "playing") {
        m.energy -= 100;
        this.monsterTurn(m, chase, taken);
      }
      if (this.outcome !== "playing") return;
    }
  }

  private monsterTurn(m: Monster, chase: Int16Array, taken: Uint8Array): void {
    const p = this.player;
    if (m.threat.length) {
      this.releaseWindup(m);
      return;
    }
    if (m.cooldown > 0) m.cooldown--;
    if (m.boss) {
      m.turns++;
      if (m.turns % TUNING.bossSweepEvery === 0 && dist(m, p) <= TUNING.bossSweepRadius + 1) {
        this.windUp(m, TUNING.bossSweepRadius, `${m.name} winds up. Get out of the red.`);
        return;
      }
    }
    if (Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1) {
      if (m.archetype === "nest" && m.cooldown === 0) {
        this.windUp(m, 1, `${m.name} digs in for a heavy hit.`);
        return;
      }
      this.monsterAttack(m);
      return;
    }
    if (m.boss && p.turns - m.lastTaunt >= BOSS.tauntEvery && this.isVisible(m.x, m.y)) this.taunt(m);
    const step = this.stepToward(m, chase, taken);
    if (step) {
      const grid = this.floor.map.grid;
      taken[grid.idx(m.x, m.y)] = 0;
      [m.x, m.y] = step;
      taken[grid.idx(m.x, m.y)] = 1;
    }
  }

  /**
   * Steps from every walkable cell to the player, out to CHASE_RANGE. One
   * breadth-first pass per turn serves every monster, instead of an A* each.
   */
  private chaseMap(): Int16Array {
    const grid = this.floor.map.grid;
    const dist = new Int16Array(grid.width * grid.height).fill(-1);
    const start = grid.idx(this.player.x, this.player.y);
    dist[start] = 0;
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi];
      if (dist[i] >= CHASE_RANGE) continue;
      const x = i % grid.width;
      const y = (i - x) / grid.width;
      for (const [dx, dy] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!grid.inside(nx, ny) || !this.canStep(x, y, dx, dy)) continue;
        const ni = grid.idx(nx, ny);
        if (dist[ni] !== -1) continue;
        dist[ni] = dist[i] + 1;
        queue.push(ni);
      }
    }
    return dist;
  }

  private canStep(x: number, y: number, dx: number, dy: number): boolean {
    const grid = this.floor.map.grid;
    if (!walkable(grid.get(x + dx, y + dy))) return false;
    return !(dx && dy && !walkable(grid.get(x + dx, y)) && !walkable(grid.get(x, y + dy)));
  }

  private stepToward(m: Monster, chase: Int16Array, taken: Uint8Array): [number, number] | null {
    const grid = this.floor.map.grid;
    const here = chase[grid.idx(m.x, m.y)];
    if (here === -1) return null;
    let best: [number, number] | null = null;
    let bestDist = here;
    for (const [dx, dy] of STEPS) {
      const nx = m.x + dx;
      const ny = m.y + dy;
      if (!grid.inside(nx, ny) || !this.canStep(m.x, m.y, dx, dy)) continue;
      const ni = grid.idx(nx, ny);
      const d = chase[ni];
      if (d === -1 || d >= bestDist || taken[ni] || d === 0) continue;
      best = [nx, ny];
      bestDist = d;
    }
    return best;
  }

  /** Mark every open cell within `radius` as about to be hit. */
  private windUp(m: Monster, radius: number, message: string): void {
    const grid = this.floor.map.grid;
    m.threat = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if ((dx || dy) && walkable(grid.get(m.x + dx, m.y + dy))) m.threat.push([m.x + dx, m.y + dy]);
      }
    }
    this.emit({ t: "telegraph", x: m.x, y: m.y });
    this.say(message, "bad");
  }

  private releaseWindup(m: Monster): void {
    const p = this.player;
    const hit = m.threat.some(([x, y]) => x === p.x && y === p.y);
    m.threat = [];
    // A wind-up you dodged leaves an opening: plain swings for a few turns.
    m.cooldown = TUNING.windupCooldown;
    if (!hit) {
      this.emit({ t: "miss", x: m.x, y: m.y });
      this.say(`${m.name} hits nothing but air.`);
      return;
    }
    const mult = m.boss ? TUNING.bossSweepMultiplier : TUNING.nestWindupMultiplier;
    this.monsterAttack(m, mult, true);
  }

  /** Cells some monster in sight will hit next turn. */
  threatened(): Set<number> {
    const grid = this.floor.map.grid;
    const out = new Set<number>();
    for (const m of this.floor.monsters) {
      if (!m.threat.length || !this.isVisible(m.x, m.y)) continue;
      for (const [x, y] of m.threat) out.add(grid.idx(x, y));
    }
    return out;
  }

  private monsterAttack(m: Monster, mult = 1, sure = false): void {
    const p = this.player;
    if (!sure && !this.rng.chance(HIT.monster)) {
      this.emit({ t: "miss", x: p.x, y: p.y });
      return;
    }
    const roll = this.rng.int(Math.max(1, Math.ceil(m.damage / 2)), m.damage);
    const dmg = Math.round(roll * mult);
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

const CHASE_RANGE = 30;

const KILL_VERB: Record<string, string> = {
  tangle: "You untangle",
  nest: "You flatten",
  hydra: "You curry away",
  wall: "You split up",
  imp: "You inline",
  bug: "You fix",
  spawn: "You delete",
};

const STEPS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
