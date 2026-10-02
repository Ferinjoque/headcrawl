// Then vs now: the same repo at two commits, compared as dungeons.
// Functions are matched by file path and name, so a function that moved to
// another file counts as slain in one place and new in the other.

import type { DungeonSpec } from "../spec";

export interface Change {
  name: string;
  path: string;
  before: number;
  after: number;
}

export interface Comparison {
  then: { head: string; floors: number; files: number; functions: number; loc: number; todos: number };
  now: { head: string; floors: number; files: number; functions: number; loc: number; todos: number };
  grew: Change[];
  shrank: Change[];
  born: number;
  slain: number;
  todosAdded: string[];
  todosDone: string[];
  bossThen: string;
  bossNow: string;
}

function monsters(spec: DungeonSpec): Map<string, { name: string; path: string; ccn: number }> {
  const out = new Map<string, { name: string; path: string; ccn: number }>();
  for (const f of spec.floors) {
    for (const r of f.rooms) {
      // Methods often share a name within a file (three classes with an
      // unsign()), so the nth one by line number matches the nth one.
      const seen = new Map<string, number>();
      for (const e of [...r.enemies].sort((x, y) => x.line - y.line)) {
        const n = seen.get(e.name) ?? 0;
        seen.set(e.name, n + 1);
        out.set(`${r.path}\u0000${e.name}\u0000${n}`, { name: e.name, path: r.path, ccn: e.ccn });
      }
    }
    const lair = f.rooms.find((r) => r.id === f.lair);
    if (lair) out.set(`${lair.path}\u0000${f.boss.name}\u0000boss`, { name: f.boss.name, path: lair.path, ccn: f.boss.ccn });
  }
  return out;
}

function todos(spec: DungeonSpec): Set<string> {
  return new Set(spec.floors.flatMap((f) => f.rooms.flatMap((r) => r.loot.map((l) => `${l.tag}: ${l.text}`))));
}

function summary(spec: DungeonSpec) {
  return {
    head: spec.repo.head,
    floors: spec.floors.length,
    files: spec.totals.files,
    functions: spec.totals.functions,
    loc: spec.totals.loc,
    todos: spec.totals.loot,
  };
}

export function compareSpecs(then: DungeonSpec, now: DungeonSpec, top = 6): Comparison {
  const a = monsters(then);
  const b = monsters(now);
  const changes: Change[] = [];
  for (const [key, m] of b) {
    const old = a.get(key);
    if (old && old.ccn !== m.ccn) changes.push({ name: m.name, path: m.path, before: old.ccn, after: m.ccn });
  }
  const byGrowth = (x: Change, y: Change) => y.after - y.before - (x.after - x.before) || x.name.localeCompare(y.name);
  const ta = todos(then);
  const tb = todos(now);
  const bossOf = (s: DungeonSpec) => {
    const f = s.floors[s.floors.length - 1];
    return `${f.boss.name}, ${f.boss.title}`;
  };
  return {
    then: summary(then),
    now: summary(now),
    grew: changes.filter((c) => c.after > c.before).sort(byGrowth).slice(0, top),
    shrank: changes
      .filter((c) => c.after < c.before)
      .sort((x, y) => byGrowth(y, x))
      .slice(0, top),
    born: [...b.keys()].filter((k) => !a.has(k)).length,
    slain: [...a.keys()].filter((k) => !b.has(k)).length,
    todosAdded: [...tb].filter((t) => !ta.has(t)).slice(0, top),
    todosDone: [...ta].filter((t) => !tb.has(t)).slice(0, top),
    bossThen: bossOf(then),
    bossNow: bossOf(now),
  };
}
