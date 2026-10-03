import type {
  Boss,
  Dependency,
  DungeonSpec,
  Edge,
  Enemy,
  Floor,
  Loot1 as Loot,
  Room,
  Wing1 as Wing,
} from "./types.generated";
import { validate } from "./validate.generated.js";

export type { Boss, Dependency, DungeonSpec, Edge, Enemy, Floor, Loot, Room, Wing };

export type LoadResult = { ok: true; spec: DungeonSpec } | { ok: false; error: string };

const MAX_BYTES = 8 * 1024 * 1024;

/** Parse and check a dungeon file. Never throws. */
export function loadSpec(input: string | unknown): LoadResult {
  let data: unknown = input;
  if (typeof input === "string") {
    if (input.length > MAX_BYTES) return { ok: false, error: "That file is too big for a dungeon." };
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, error: "That is not valid JSON." };
    }
  }
  if (!validate(data)) {
    const err = (validate as unknown as { errors?: { instancePath: string; message?: string }[] }).errors?.[0];
    const where = err?.instancePath || "the top level";
    return { ok: false, error: `Not a dungeon file: ${where} ${err?.message ?? "is wrong"}.` };
  }
  const spec = data as DungeonSpec;
  if (hasControl(spec)) return { ok: false, error: "Not a dungeon file: it has control characters in its text." };
  const problem = checkLinks(spec);
  return problem ? { ok: false, error: problem } : { ok: true, spec };
}

// The analyzer strips these from everything it writes (text.clean). A spec
// from a link could carry them anyway, and they would reach saved run logs
// and asciinema casts, where a terminal acts on escape sequences.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

function hasControl(value: unknown, depth = 0): boolean {
  if (typeof value === "string") return CONTROL.test(value);
  if (depth > 12 || value === null || typeof value !== "object") return false;
  return Object.values(value).some((v) => hasControl(v, depth + 1));
}

/** The parts of the contract JSON Schema can't express. Mirrors the Pydantic validators. */
function checkLinks(spec: DungeonSpec): string | null {
  const seen = new Set<string>();
  const claim = (id: string) => {
    if (seen.has(id)) return `Duplicate id ${id}.`;
    seen.add(id);
    return null;
  };
  for (const [i, floor] of spec.floors.entries()) {
    if (floor.index !== i) return `Floor ${floor.id} is out of order.`;
    const rooms = new Set(floor.rooms.map((r) => r.id));
    const wings = new Set(floor.wings.map((w) => w.id));
    if (!rooms.has(floor.entry) || !rooms.has(floor.lair)) return `Floor ${floor.id} has a bad entry or lair.`;
    for (const id of [floor.id, floor.boss.id, ...wings]) {
      const dup = claim(id);
      if (dup) return dup;
    }
    for (const r of floor.rooms) {
      if (!wings.has(r.wing)) return `Room ${r.id} is in an unknown wing.`;
      for (const id of [r.id, ...r.enemies.map((e) => e.id), ...r.loot.map((l) => l.id)]) {
        const dup = claim(id);
        if (dup) return dup;
      }
    }
    for (const e of floor.edges) {
      if (!rooms.has(e.a) || !rooms.has(e.b) || e.a === e.b) return `Floor ${floor.id} has a bad corridor.`;
    }
    if (!connected(floor)) return `Floor ${floor.id} has rooms you can't reach.`;
  }
  const last = spec.floors.length - 1;
  if (spec.floors.some((f, i) => f.boss.final !== (i === last))) return "Only the last floor can hold the final boss.";
  return null;
}

export function connected(floor: Floor): boolean {
  const adj = new Map<string, string[]>(floor.rooms.map((r) => [r.id, []]));
  for (const e of floor.edges) {
    adj.get(e.a)?.push(e.b);
    adj.get(e.b)?.push(e.a);
  }
  const start = floor.rooms[0].id;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    for (const next of adj.get(stack.pop()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen.size === floor.rooms.length;
}
