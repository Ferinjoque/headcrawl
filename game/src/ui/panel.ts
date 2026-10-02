import type { Game } from "../game/game";
import type { Monster } from "../game/types";
import { bar, h, plural, replace } from "./dom";

const ARCH_NAME: Record<string, string> = {
  tangle: "tangle, too many branches",
  nest: "nest, buried deep",
  hydra: "hydra, too many arguments",
  wall: "wall, long and slow",
  imp: "imp, small but quick",
  bug: "bug",
  spawn: "helper",
  boss: "boss",
};

function foe(m: Monster) {
  const e = m.enemy;
  const stats = m.boss
    ? `${m.boss.title}. ${m.boss.ccn} branches, changed ${plural(m.boss.churn, "time")}`
    : e
      ? `${ARCH_NAME[m.archetype]}. ${e.ccn} branches, depth ${e.nesting}, ${e.params} args, line ${e.line}`
      : ARCH_NAME[m.archetype];
  return h(
    "div",
    { class: "foe" },
    h("span", { class: m.boss ? "t-boss glow" : m.awake ? "t-bad" : "dim" }, m.glyph),
    h("span", { class: "name", title: e?.signature ?? m.boss?.signature ?? m.name }, m.name),
    h("span", { class: m.hp < m.maxHp * 0.3 ? "t-bad" : "dim" }, `${bar(m.hp, m.maxHp, 6)} ${m.hp}`),
    h("span", { class: "stats" }, stats),
  );
}

export function renderPanel(el: HTMLElement, game: Game): void {
  const room = game.roomOfPlayer();
  const p = game.player;
  const here = room
    ? h(
        "section",
        { class: "pane" },
        h("h2", null, "here"),
        h("p", { class: "path" }, room.spec.path),
        h(
          "p",
          { class: "dim" },
          `${room.spec.language}, ${room.spec.loc} loc, ${plural(room.spec.functions, "function")}`,
        ),
        h("p", { class: "dim" }, `changed in ${plural(room.spec.churn, "commit")}, heat ${bar(room.spec.heat, 1, 6)}`),
        room.spec.kind === "shrine" ? h("p", { class: "t-good" }, "A test file. Step on * to heal.") : null,
        room.spec.blurb ? h("p", { class: "blurb" }, `"${room.spec.blurb}"`) : null,
      )
    : h("section", { class: "pane" }, h("h2", null, "here"), h("p", { class: "dim" }, "a corridor between files"));

  const seen = game.floor.monsters
    .filter((m) => game.isVisible(m.x, m.y))
    .sort((a, b) => Number(!!b.boss) - Number(!!a.boss) || dist(a, p) - dist(b, p))
    .slice(0, 8);
  const sight = h(
    "section",
    { class: "pane" },
    h("h2", null, "in sight"),
    ...(seen.length ? seen.map(foe) : [h("p", { class: "dim" }, "nothing moving")]),
  );

  const count = (n: number) => (n ? ` x${n}` : "");
  const pack = h(
    "section",
    { class: "pane" },
    h("h2", null, "pack"),
    h("p", { class: p.potions.length ? "t-good" : "faint" }, `! TODO${count(p.potions.length)}`, h("span", { class: "faint" }, "  q to drink")),
    h("p", { class: p.scrolls.length ? "t-loot" : "faint" }, `? HACK${count(p.scrolls.length)}`, h("span", { class: "faint" }, "  r to read")),
    h("p", { class: p.blade ? "" : "faint" }, `/ FIXME ${p.blade ? `+${p.blade} attack` : "none yet"}`),
    p.curses ? h("p", { class: "t-bad" }, `% XXX x${p.curses}`) : null,
  );

  const keys = h(
    "section",
    { class: "pane keys" },
    h("h2", null, "keys"),
    h("p", null, h("b", null, "arrows hjkl yubn"), " move, bump to attack"),
    h("p", null, h("b", null, "x"), " explore  ", h("b", null, "z"), " rest  ", h("b", null, "."), " wait"),
    h("p", null, h("b", null, ">"), " descend  ", h("b", null, "q"), " drink  ", h("b", null, "r"), " read"),
    h("p", null, h("b", null, "?"), " help  ", h("b", null, "esc"), " menu  ", h("b", null, "click"), " walk there"),
  );

  replace(el, here, sight, pack, keys);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
