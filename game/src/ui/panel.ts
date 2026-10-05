import type { Game } from "../game/game";
import { describe, TRAITS } from "../game/gear";
import { PERKS } from "../game/perks";
import type { Monster } from "../game/types";
import { drawMinimap } from "../render/minimap";
import { h, plural, replace } from "./dom";

const ARCH_NAME: Record<string, string> = {
  tangle: "tangle: regrows",
  nest: "nest: winds up big hits",
  hydra: "hydra: splits when hurt",
  wall: "wall: armored, slow",
  imp: "imp: fast",
  bug: "bug: dodgy",
  ghost: "ghost: dead code, walks through walls",
  spawn: "helper",
  boss: "boss",
};

const ITEM: Record<string, [string, string]> = {
  potion: ["!", "TODO"],
  weapon: ["/", "weapon"],
  armor: ["[", "armor"],
  scroll: ["?", "HACK"],
  curse: ["%", "XXX"],
  coffee: ["c", "coffee"],
};

/** "test_app_tearing_down_with_unhandled" -> "test_app_te…with_unhandled": the end is what differs. */
export function shortName(name: string, max = 28): string {
  if (name.length <= max) return name;
  const tail = Math.ceil((max - 1) * 0.6);
  return `${name.slice(0, max - 1 - tail)}…${name.slice(-tail)}`;
}

function hpBar(hp: number, max: number): HTMLElement {
  const fill = h("i");
  fill.style.width = `${max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)).toFixed(1) : 0}%`;
  return h("span", { class: hp < max * 0.3 ? "mini-bar low" : "mini-bar", title: `${hp} of ${max}` }, fill);
}

function foe(m: Monster, detail: boolean) {
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
    h("span", { class: "name", title: e?.signature ?? m.boss?.signature ?? m.name }, shortName(m.name)),
    hpBar(m.hp, m.maxHp),
    detail ? h("span", { class: "stats" }, stats) : null,
  );
}

function lootNote(i: Game["floor"]["items"][number]): string {
  if (i.gear) return i.gear.slot === "armor" ? `defense ${i.gear.bonus}` : `attack +${i.gear.bonus}, ${TRAITS[i.gear.trait].name}`;
  if (!i.loot) return "still warm";
  const year = i.loot.year ? `${i.loot.year}${i.loot.year_or_older ? " or earlier" : ""}` : "";
  const who = i.loot.author ? ` by ${i.loot.author}` : "";
  const when = year || who ? `${year}${who}: ` : "";
  return `${when}"${i.loot.text}"`;
}

export function renderPanel(el: HTMLElement, game: Game): void {
  const room = game.roomOfPlayer();
  const p = game.player;

  // What is near you comes first. Full stats only for the closest one; the
  // rest get a name and a health bar, and hovering a monster tells the rest.
  const seen = game.floor.monsters
    .filter((m) => game.isVisible(m.x, m.y))
    .sort((a, b) => Number(!!b.boss) - Number(!!a.boss) || dist(a, p) - dist(b, p))
    .slice(0, 8);
  const items = game.floor.items.filter((i) => game.isVisible(i.x, i.y)).slice(0, 5);
  const sight =
    seen.length || items.length
      ? h(
          "section",
          { class: "pane" },
          h("h2", null, "in sight"),
          ...seen.map((m, i) => foe(m, i === 0)),
          ...items.map((i) =>
            h(
              "div",
              { class: "foe" },
              h("span", { class: "t-loot" }, ITEM[i.kind][0]),
              h("span", { class: "name t-loot", title: i.gear?.name ?? "" }, i.gear ? shortName(i.gear.name) : ITEM[i.kind][1]),
              h("span", null, ""),
              h("span", { class: "stats" }, lootNote(i)),
            ),
          ),
        )
      : null;

  // The pack lists only what you carry, each with the key that uses it.
  const held = [
    p.potions.length ? h("p", { class: "t-good" }, h("kbd", null, "q"), ` ! TODO x${p.potions.length}`) : null,
    p.scrolls.length ? h("p", { class: "t-loot" }, h("kbd", null, "r"), ` ? HACK x${p.scrolls.length}`) : null,
    p.weapon ? h("p", { title: `${describe(p.weapon)}. ${TRAITS[p.weapon.trait].text}` }, h("kbd", null, " "), ` / ${shortName(p.weapon.name, 30)} +${p.weapon.bonus}`) : null,
    p.armor ? h("p", { title: describe(p.armor) }, h("kbd", null, " "), ` [ ${shortName(p.armor.name, 30)} def ${p.armor.bonus}`) : null,
    p.curses ? h("p", { class: "t-bad" }, h("kbd", null, " "), ` % XXX x${p.curses}`) : null,
    p.perks.length ? h("p", { class: "faint tools" }, p.perks.map((id) => PERKS[id].name).join(", ")) : null,
  ];
  const pack = held.some(Boolean) ? h("section", { class: "pane pack" }, h("h2", null, "pack"), ...held) : null;

  const canvas = h("canvas", { class: "minimap", "aria-label": "Map of what you have seen" }) as HTMLCanvasElement;
  drawMinimap(canvas, game);
  const map = h("section", { class: "pane" }, canvas);

  const here = room
    ? h(
        "section",
        { class: "pane here" },
        h("p", { class: "path" }, room.spec.path),
        h("p", { class: "faint" }, `${room.spec.language}, ${room.spec.loc} lines, ${plural(room.spec.churn, "commit")}`),
        room.spec.kind === "shrine" ? h("p", { class: "t-good" }, "A test file. Step on * to heal.") : null,
        room.spec.blurb ? h("p", { class: "blurb" }, `"${room.spec.blurb}"`) : null,
        room.spec.last_commit ? h("p", { class: "faint" }, "last commit ", h("span", { class: "t-lore" }, `"${room.spec.last_commit}"`)) : null,
      )
    : null;

  replace(el, sight, pack, map, here);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
