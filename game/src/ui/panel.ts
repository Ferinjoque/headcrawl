import type { Game } from "../game/game";
import { PERKS } from "../game/perks";
import type { Monster } from "../game/types";
import { drawMinimap } from "../render/minimap";
import { bar, h, plural, replace } from "./dom";

const ARCH_NAME: Record<string, string> = {
  tangle: "tangle: regrows",
  nest: "nest: winds up big hits",
  hydra: "hydra: splits when hurt",
  wall: "wall: armored, slow",
  imp: "imp: fast",
  bug: "bug: dodgy",
  spawn: "helper",
  boss: "boss",
};

const ITEM: Record<string, [string, string]> = {
  potion: ["!", "TODO"],
  blade: ["/", "FIXME"],
  scroll: ["?", "HACK"],
  curse: ["%", "XXX"],
  coffee: ["c", "coffee"],
};

function foe(m: Monster) {
  const e = m.enemy;
  const stats = m.boss
    ? `${m.boss.title}. ${plural(m.boss.ccn, "branch")}, changed ${plural(m.boss.churn, "time")}`
    : e
      ? `${ARCH_NAME[m.archetype]}. ${plural(e.ccn, "branch")}, depth ${e.nesting}, ${e.params} args, line ${e.line}`
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
        room.spec.last_commit ? h("p", { class: "dim" }, "last commit: ", h("span", { class: "t-lore" }, `"${room.spec.last_commit}"`)) : null,
      )
    : h("section", { class: "pane" }, h("h2", null, "here"), h("p", { class: "dim" }, "a corridor between files"));

  const seen = game.floor.monsters
    .filter((m) => game.isVisible(m.x, m.y))
    .sort((a, b) => Number(!!b.boss) - Number(!!a.boss) || dist(a, p) - dist(b, p))
    .slice(0, 8);
  const items = game.floor.items.filter((i) => game.isVisible(i.x, i.y)).slice(0, 5);
  const sight = h(
    "section",
    { class: "pane" },
    h("h2", null, "in sight"),
    ...(seen.length ? seen.map(foe) : [h("p", { class: "dim" }, "nothing moving")]),
    ...items.map((i) =>
      h(
        "div",
        { class: "foe" },
        h("span", { class: "t-loot" }, ITEM[i.kind][0]),
        h("span", { class: "name t-loot" }, ITEM[i.kind][1]),
        h("span", null, ""),
        h("span", { class: "stats" }, i.loot ? `${i.loot.year ? `${i.loot.year}${i.loot.year_or_older ? " or earlier" : ""}: ` : ""}"${i.loot.text}"` : "still warm"),
      ),
    ),
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
    p.perks.length ? h("p", { class: "t-loot" }, `tools: ${p.perks.map((id) => PERKS[id].name).join(", ")}`) : null,
  );

  const keys = h(
    "section",
    { class: "pane keys" },
    h("h2", null, "keys"),
    h("p", null, h("b", null, "arrows hjkl yubn"), " move, bump to attack"),
    h("p", null, h("b", null, "x"), " explore  ", h("b", null, "z"), " rest  ", h("b", null, "."), " wait"),
    h("p", null, h("b", null, ">"), " descend  ", h("b", null, "q"), " drink  ", h("b", null, "r"), " read"),
    h("p", null, h("b", null, "?"), " help  ", h("b", null, "esc"), " menu  ", h("b", null, "m"), " sound  ", h("b", null, ","), " settings"),
    h("p", null, h("b", null, "click"), " walk there, ", h("b", null, "hover"), " inspect"),
  );

  const canvas = h("canvas", { class: "minimap", "aria-label": "Map of what you have seen" }) as HTMLCanvasElement;
  drawMinimap(canvas, game);
  const map = h("section", { class: "pane" }, h("h2", null, "map"), canvas);

  replace(el, here, sight, map, pack, keys);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
