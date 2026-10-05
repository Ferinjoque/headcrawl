// The rules. No DOM in here, so the whole game can run in tests and in the bot.
// Fights live in combat.ts, monster turns in foes.ts, things you carry in
// items.ts. This file is the turn loop and moving around.

import { FOV } from "rot-js";
import { Rng } from "../core/rng";
import type { DungeonSpec } from "../spec";
import { seeThrough, Tile, walkable } from "../map/grid";
import { PLAYER, xpForLevel } from "./balance";
import { PERKS, offer, type PerkId } from "./perks";
import { actionCode, decodeLog, encodeLog } from "./record";
import { buildFloor, type FloorState } from "./world";
import { KEEPER_HEAL, placeKeeper, installLine, npcAt, modFloor, modPlayer, placeVendor, type ModId, type Offer } from "./extras";
import type { LoopTrap } from "../map/layout";
import type { Gear } from "./gear";
import { styleLine } from "./bossmoves";
import { branchFloor, placeBranch, type BranchDoor } from "./branches";
import { gateFor, type Gate } from "./warmup";
import { playerAttack } from "./combat";
import { monstersAct } from "./foes";
import { equip, pickUp, quaff, readScroll } from "./items";
import { review } from "./ranged";
import type { Action, GameEvent, Item, Monster, Outcome, Player, Tone } from "./types";

export interface GameOptions {
  /** Changes combat rolls but not the dungeon, so friends can race the same map. */
  run?: number;
  /** The daily run's twist. Part of what makes a run, like the run number. */
  mods?: ModId[];
}

export class Game {
  readonly spec: DungeonSpec;
  readonly run: number;
  readonly player: Player;
  floor: FloorState;
  outcome: Outcome = "playing";
  killer: string | null = null;
  /** Combat rolls. Used by combat.ts, foes.ts and items.ts too, in a fixed order. */
  readonly rng: Rng;
  private events: GameEvent[] = [];
  spawnCount = 0;
  private visited = new Set<string>();
  /** Three perks to pick from after a level up, or null. */
  perkChoice: PerkId[] | null = null;
  /** What the vendor you just bumped into is selling, or null. */
  vendorChoice: Offer[] | null = null;
  /** Gear you are standing on while that slot is full: take it or leave it. */
  gearChoice: Item | null = null;
  /** Gear you looked at and left lying. Auto-explore stops walking you back to it. */
  readonly declined = new Set<string>();
  /** For the bestiary: the most branches of each kind you finished this run. */
  readonly trophies: Record<string, { name: string; ccn: number }> = {};
  /** Elites finished this run, by affix. */
  readonly eliteKills: Record<string, number> = {};
  /** Every weapon and armor you put on this run, in order. */
  readonly wielded: Gear[] = [];
  /** Lab and practice switches. Never on in a run that counts. */
  readonly cheats = { god: false, frozen: false };
  private main: { floor: FloorState; x: number; y: number; name: string } | null = null;
  /** The floor where a Feature flag saved you, -1 before that. */
  flagUsedOn = -1;
  /** Set by an async weapon: the monsters skip this turn. */
  freeTurn = false;
  readonly mods: ModId[];
  /** Which systems each floor has; see warmup.ts. */
  readonly gate: Gate;
  private lastRoom = -1;
  private perksOwed = 0;
  /** Every action that changed the game, as codes from record.ts. */
  readonly log: string[] = [];
  /** Every message of the run with its turn, for the run log. */
  readonly journal: string[] = [];

  constructor(spec: DungeonSpec, opts: GameOptions = {}) {
    this.spec = spec;
    this.run = opts.run ?? 0;
    this.mods = opts.mods ?? [];
    this.gate = gateFor(spec.floors.length, this.mods.includes("hard") || spec.generator === "lab");
    this.rng = new Rng(`${spec.seed}/run/${this.run}`);
    this.floor = this.makeFloor(0);
    const [x, y] = this.floor.map.start;
    this.player = {
      x,
      y,
      hp: PLAYER.hp,
      maxHp: PLAYER.hp,
      atk: PLAYER.atk,
      weapon: null,
      armor: null,
      review: 0,
      slowed: 0,
      level: 1,
      xp: 0,
      nextXp: xpForLevel(1),
      potions: [],
      scrolls: [],
      curses: 0,
      perks: [],
      kills: 0,
      killsBy: {},
      bossNames: [],
      bosses: 0,
      turns: 0,
    };
    modPlayer(this.player, this.mods);
    this.updateSight();
    this.enterFloorMessages();
  }

  private makeFloor(index: number): FloorState {
    const floor = buildFloor(this.spec.floors[index], this.spec.seed, this.spec.floors.length, this.gate);
    modFloor(floor, this.mods);
    floor.vendor = this.gate("shop", index) ? placeVendor(floor, this.spec) : null;
    floor.keeper = this.gate("keeper", index) ? placeKeeper(floor, this.spec) : null;
    floor.branch = this.gate("branch", index) ? placeBranch(floor, this.spec) : null;
    return floor;
  }

  /** How far you see. Less on a lights-out day. */
  get sight(): number {
    return PLAYER.sight - (this.mods.includes("lightsout") ? 2 : 0);
  }

  /** The run so far, compact enough for a URL. */
  record(): string {
    return encodeLog(this.log);
  }

  /** Play a recorded run forward from the start. Null if the log is broken. */
  static replay(spec: DungeonSpec, run: number, text: string, mods: ModId[] = []): Game | null {
    const actions = decodeLog(text);
    if (!actions) return null;
    const game = new Game(spec, { run, mods });
    for (const a of actions) {
      if (game.outcome !== "playing") break;
      game.act(a);
    }
    game.drain();
    return game;
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

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  /** Quiet lines go to the run log only; the screen already shows them somewhere. */
  say(text: string, tone: Tone = "info", quiet = false): void {
    this.emit(quiet ? { t: "msg", text, tone, quiet } : { t: "msg", text, tone });
    if (this.journal.length < JOURNAL_CAP) this.journal.push(`${String(this.player?.turns ?? 0).padStart(5)}  ${text}`);
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
    // A level-up choice has to be made before anything else happens.
    if (this.perkChoice) {
      if (action.type === "perk" && this.perkChoice[action.index]) {
        this.log.push(actionCode(action));
        this.choosePerk(action.index);
      }
      return false;
    }
    if (this.vendorChoice) {
      if (action.type === "buy") {
        this.log.push(actionCode(action));
        this.buy(action.index);
      }
      return false;
    }
    if (this.gearChoice) {
      if (action.type === "gear") {
        this.log.push(actionCode(action));
        const item = this.gearChoice;
        this.gearChoice = null;
        if (action.take && item.gear) equip(this, item, item.gear);
        else this.declined.add(item.id);
      }
      return false;
    }
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
        took = quaff(this);
        break;
      case "read":
        took = readScroll(this);
        break;
      case "fire":
        took = review(this, action.dx, action.dy);
        break;
      case "perk":
      case "buy":
      case "gear":
        break;
    }
    if (took) this.log.push(actionCode(action));
    if (!took || this.outcome !== "playing") return took;
    this.player.turns++;
    const p = this.player;
    if (p.review > 0) p.review--;
    if (p.slowed > 0) p.slowed--;
    const regenEvery = this.has("caffeine") ? PLAYER.regenEvery - 1 : PLAYER.regenEvery;
    if (p.turns % regenEvery === 0) p.hp = Math.min(p.maxHp, p.hp + 1 + Math.floor(p.level / 4));
    // Sight first, so monsters wake on what the player can see right now.
    this.updateSight();
    if (this.freeTurn) {
      this.freeTurn = false;
      this.say("async. You swing again before anything answers.", "good", true);
    } else if (!this.cheats.frozen) monstersAct(this);
    this.updateSight();
    return true;
  }

  private tryMove(dx: number, dy: number): boolean {
    const p = this.player;
    const nx = p.x + dx;
    const ny = p.y + dy;
    const target = this.monsterAt(nx, ny);
    if (target) {
      playerAttack(this, target);
      return true;
    }
    const keeper = this.floor.keeper;
    if (keeper && keeper.x === nx && keeper.y === ny) {
      this.meetKeeper(keeper);
      return true;
    }
    const vendor = this.floor.vendor;
    if (vendor && vendor.x === nx && vendor.y === ny) {
      if (vendor.sold) this.say("The shop has nothing left for you on this floor.");
      else this.vendorChoice = vendor.offers;
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
    if (item) pickUp(this, item);
    const tile = grid.get(p.x, p.y);
    const roomIndex = grid.roomAt(p.x, p.y);
    if (tile === Tile.Shrine && !this.floor.shrinesUsed.has(roomIndex)) {
      this.floor.shrinesUsed.add(roomIndex);
      const amount = p.maxHp - p.hp;
      p.hp = p.maxHp;
      this.emit({ t: "heal", x: p.x, y: p.y, amount });
      this.say("The tests pass. You feel whole again.", "good");
    }
    if (tile === Tile.StairsDown) this.say(this.main ? "Stairs back to the floor you came from. Press > to go back." : "Stairs down. Press > to descend.", "info");
    const door = this.floor.branch;
    if (door && !door.used && door.x === p.x && door.y === p.y) this.say(`A side door to ${door.name}, another version of this floor. Press > to go in.`, "lore");
    const trap = this.floor.map.loops.find((l) => l.cell === grid.idx(p.x, p.y));
    if (trap && !this.floor.loopsDone.has(trap.cell)) return this.loopBack(trap);
    if (roomIndex >= 0 && roomIndex !== prevRoom && grid.get(p.x, p.y) !== Tile.Wall) this.enterRoom(roomIndex);
  }

  /** An import cycle walks you back to the room you came from, once. */
  private loopBack(trap: LoopTrap): void {
    this.floor.loopsDone.add(trap.cell);
    const room = this.floor.map.rooms[this.lastRoom] ?? this.floor.map.entry;
    const spot = this.freeNeighbour(room.cx, room.cy) ?? [room.cx, room.cy];
    [this.player.x, this.player.y] = spot;
    this.emit({ t: "loop" });
    this.say(`A loop: ${trap.a} needs ${trap.b}, which needs ${trap.a}. You end up back where you started.`, "lore");
  }

  private meetKeeper(k: NonNullable<FloorState["keeper"]>): void {
    if (k.met) return this.say(`${k.name} is busy. Something about a release.`);
    k.met = true;
    const quote = k.subject ? ` Their last commit here: "${k.subject}".` : "";
    this.say(`${k.name} wrote most of this floor.${quote} They hand you a coffee.`, "lore");
    this.heal(Math.max(1, Math.round(this.player.maxHp * KEEPER_HEAL)));
  }

  private buy(index: number): void {
    const offer = this.vendorChoice?.[index];
    this.vendorChoice = null;
    const vendor = this.floor.vendor;
    if (!offer || !vendor) return this.say("You walk away. Fewer dependencies, fewer problems.");
    // Code owners can sign off on both offers; anyone else gets one.
    vendor.offers = vendor.offers.filter((o) => o !== offer);
    vendor.sold = !this.has("owners") || !vendor.offers.length;
    const { weapon, armor } = this.player;
    offer.deal.apply(this.player, { dep: offer.dep, depth: this.floor.index });
    for (const g of [this.player.weapon, this.player.armor]) if (g && g !== weapon && g !== armor) this.wielded.push(g);
    this.emit({ t: "pickup", x: vendor.x, y: vendor.y, kind: "scroll" });
    this.say(`${installLine(offer.dep)}. ${offer.deal.text}`, "loot");
  }

  private enterRoom(index: number): void {
    this.lastRoom = index;
    const rect = this.floor.map.rooms[index];
    const room = rect.spec;
    if (rect === this.floor.map.lair && !this.floor.bossDead) {
      const boss = this.floor.monsters.find((m) => m.boss);
      if (boss?.boss && !this.floor.bossMet) {
        this.floor.bossMet = true;
        boss.awake = true;
        boss.lastTaunt = this.player.turns;
        if (room.last_commit) this.say(`Last change here: "${room.last_commit}"`, "lore");
        this.emit({
          t: "intro",
          name: boss.name,
          title: boss.boss.title,
          where: `${room.path}:${boss.boss.line}`,
          text: boss.boss.taunts[0],
          final: Boolean(boss.boss.final),
          style: styleLine(boss.boss),
        });
      } else if (boss) this.taunt(boss);
    }
    if (!this.visited.has(room.id)) {
      this.visited.add(room.id);
      if (room.conflicts && this.floor.conflictsOn) this.say(`${room.path} has two versions of itself in here, and both want you. A merge conflict.`, "bad");
      this.say(`${room.path}. ${room.language}, ${room.loc} lines.`, "info", true);
      if (room.blurb) this.say(`"${room.blurb}"`, "lore", true);
    }
  }

  taunt(m: Monster, which?: number): void {
    const lines = m.boss?.taunts ?? [];
    if (!lines.length) return;
    const text = lines[which ?? this.rng.int(0, lines.length - 1)];
    m.lastTaunt = this.player.turns;
    this.emit({ t: "taunt", name: `${m.name}, ${m.boss!.title}`, text });
  }

  gainXp(amount: number): void {
    const p = this.player;
    p.xp += amount;
    while (p.xp >= p.nextXp) {
      p.xp -= p.nextXp;
      p.level++;
      p.nextXp = xpForLevel(p.level);
      p.maxHp += PLAYER.hpPerLevel;
      if (p.level % PLAYER.atkEveryLevels === 0) p.atk++;
      p.hp = Math.min(p.maxHp, p.hp + PLAYER.hpPerLevel + Math.ceil(p.maxHp * 0.2));
      this.emit({ t: "levelup", level: p.level });
      this.say(`Level ${p.level}. You understand this code a little better.`, "good");
      this.perksOwed++;
    }
    this.offerPerks();
  }

  has(id: PerkId): boolean {
    return this.player.perks.includes(id);
  }

  private offerPerks(): void {
    if (this.perkChoice || this.perksOwed <= 0) return;
    this.perksOwed--;
    this.perkChoice = offer(this.player.perks, () => this.rng.next());
    this.say("Pick a tool: 1, 2 or 3.", "good");
  }

  private choosePerk(index: number): void {
    const id = this.perkChoice?.[index];
    if (!id) return;
    this.perkChoice = null;
    this.applyPerk(id);
    this.offerPerks();
  }

  /** Take a tool: the ones that change numbers change them now. The lab calls this too. */
  applyPerk(id: PerkId): void {
    const p = this.player;
    p.perks.push(id);
    if (id === "refactoring") p.atk += 2;
    if (id === "monorepo") {
      p.maxHp += 12;
      p.hp += 12;
    }
    if (id === "coverage") {
      p.maxHp += 6;
      p.hp += 6;
      this.floor.shrinesUsed.clear();
    }
    this.emit({ t: "perk", id });
    this.say(`${PERKS[id].name}: ${PERKS[id].text}.`, "good");
  }

  freeNeighbour(x: number, y: number): [number, number] | null {
    const grid = this.floor.map.grid;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid.get(nx, ny) !== Tile.Floor || this.monsterAt(nx, ny) || npcAt(this.floor, nx, ny)) continue;
      if (nx === this.player.x && ny === this.player.y) continue;
      return [nx, ny];
    }
    return null;
  }

  heal(amount: number): void {
    const p = this.player;
    const real = Math.min(amount, p.maxHp - p.hp);
    p.hp += real;
    this.emit({ t: "heal", x: p.x, y: p.y, amount: real });
  }

  private tryDescend(): boolean {
    const p = this.player;
    const door = this.floor.branch;
    if (door && !door.used && door.x === p.x && door.y === p.y) return this.checkout(door);
    if (this.floor.map.grid.get(p.x, p.y) !== Tile.StairsDown) {
      this.say("There are no stairs here.");
      return false;
    }
    if (this.main) return this.merge();
    const next = this.floor.index + 1;
    this.floor = this.makeFloor(next);
    this.lastRoom = -1;
    [p.x, p.y] = this.floor.map.start;
    this.emit({ t: "descend", floor: next });
    if (this.has("stash")) {
      p.potions.push({ id: `stash${next}`, kind: "potion", x: p.x, y: p.y, loot: null, source: "git stash" });
      this.say("git stash pop. A potion you set aside is back in your pack.", "good", true);
    }
    this.enterFloorMessages();
    return true;
  }

  /** Into a side branch: the same floor laid out the way that branch has it. */
  private checkout(door: BranchDoor): boolean {
    const p = this.player;
    door.used = true;
    this.main = { floor: this.floor, x: p.x, y: p.y, name: door.name };
    this.floor = branchFloor(this.spec, this.floor.index, door.name);
    modFloor(this.floor, this.mods);
    this.lastRoom = -1;
    [p.x, p.y] = this.floor.map.start;
    this.emit({ t: "branch", name: door.name, merged: false });
    this.say(`Through the side door: ${door.name}. No boss here; a weapon waits by the stairs, and they take you back.`, "lore");
    return true;
  }

  /** Back to the floor you left, where you left it. */
  private merge(): boolean {
    const main = this.main!;
    this.main = null;
    this.floor = main.floor;
    this.lastRoom = -1;
    [this.player.x, this.player.y] = [main.x, main.y];
    this.emit({ t: "branch", name: main.name, merged: true });
    this.say(`Back on ${main.name}, where you left.`, "lore");
    return true;
  }

  /** On a side branch: the floor you came from, to go back to. */
  get inBranch(): string | null {
    return this.main?.name ?? null;
  }

  private enterFloorMessages(): void {
    const f = this.floorSpec;
    const total = this.spec.floors.length;
    this.say(`Floor ${f.index + 1} of ${total}: ${f.name}. Somewhere here waits ${f.boss.name}.`, "boss", true);
    const room = this.roomOfPlayer();
    if (room) this.enterRoom(room.index);
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

  private updateSight(): void {
    const { grid } = this.floor.map;
    const { visible, seen } = this.floor;
    visible.fill(0);
    const fov = new FOV.PreciseShadowcasting((x, y) => seeThrough(grid.get(x, y)), { topology: 8 });
    fov.compute(this.player.x, this.player.y, this.sight, (x, y) => {
      if (!grid.inside(x, y)) return;
      const i = grid.idx(x, y);
      visible[i] = 1;
      seen[i] = 1;
    });
  }
}

const JOURNAL_CAP = 5000;

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
