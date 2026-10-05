import type { Game } from "../game/game";
import { styleLine } from "../game/bossmoves";
import { AFFIX } from "../game/elites";
import { describe, TRAITS } from "../game/gear";
import { PERKS } from "../game/perks";
import type { Monster } from "../game/types";
import { drawMinimap } from "../render/minimap";
import { h, plural, replace } from "./dom";
import { LOOT, MONSTERS } from "./glossary";

/** "tangle: regrows". Helpers and bosses go by the kind alone. */
const kindLine = (k: Monster["archetype"]) => (k === "spawn" || k === "boss" ? MONSTERS[k].name : `${MONSTERS[k].name}: ${MONSTERS[k].short}`);

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
    ? `${m.boss.title}. ${styleLine(m.boss) ? `${styleLine(m.boss)}. ` : ""}${plural(m.boss.ccn, "path")}, changed ${plural(m.boss.churn, "time")}`
    : e
      ? `${m.affix ? `elite, ${AFFIX[m.affix].name}. ` : ""}${e.deprecated ? "outdated, slows you. " : ""}${m.undo ? "comes back once. " : ""}${kindLine(m.archetype)}. ${plural(e.ccn, "path")}, ${e.nesting} deep, ${plural(e.params, "input")}, line ${e.line}`
      : kindLine(m.archetype);
  return h(
    "div",
    { class: "foe" },
    h("span", { class: `${m.boss ? "t-boss glow" : m.awake ? "t-bad" : "dim"}${m.affix ? " elite" : ""}`, title: m.affix ? `elite: ${AFFIX[m.affix].name}` : undefined }, m.glyph),
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

/**
 * Order things in sight by when they came into view, not by distance, so a
 * row stays where it is while you move. Per floor; a WeakMap forgets old ones.
 */
const firstSeen = new WeakMap<object, Map<string, number>>();

function seenOrder(floor: object, ids: string[]): Map<string, number> {
  let order = firstSeen.get(floor);
  if (!order) firstSeen.set(floor, (order = new Map()));
  for (const id of ids) if (!order.has(id)) order.set(id, order.size);
  return order;
}

function itemRow(i: Game["floor"]["items"][number]) {
  return h(
    "div",
    { class: "foe" },
    h("span", { class: "t-loot" }, LOOT[i.kind].glyph),
    h("span", { class: "name t-loot", title: i.gear?.name ?? "" }, i.gear ? shortName(i.gear.name) : LOOT[i.kind].name),
    h("span", { class: "stats inline" }, lootNote(i)),
  );
}

export function renderPanel(el: HTMLElement, game: Game): void {
  const room = game.roomOfPlayer();
  const p = game.player;

  // Fixed places, like Brogue's sidebar: the nearest thing gets the focus box
  // with its stats, the rest keep the row they got when they came into view.
  const visible = game.floor.monsters.filter((m) => game.isVisible(m.x, m.y));
  const items = game.floor.items.filter((i) => game.isVisible(i.x, i.y));
  const order = seenOrder(game.floor, [...visible.map((m) => m.id), ...items.map((i) => i.id)]);
  const nearest = [...visible].sort((a, b) => Number(!!b.boss) - Number(!!a.boss) || dist(a, p) - dist(b, p))[0];
  const rest = visible.filter((m) => m !== nearest).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const rows = [...rest.map((m) => foe(m, false)), ...items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map(itemRow)];
  const shown = rows.slice(0, SIGHT_ROWS);
  const more = rows.length - shown.length;
  const sight = h(
    "section",
    { class: "pane sight" },
    h("h2", null, "in sight"),
    h("div", { class: "focus" }, nearest ? foe(nearest, true) : h("p", { class: "faint" }, "Nothing. Quiet, for now.")),
    h("div", { class: "rows" }, ...(rows.length ? shown : idleLines(game)), more > 0 ? h("p", { class: "faint more" }, `+${more} more`) : null),
  );

  // The pack always shows the same lines, so nothing moves when you pick
  // something up: the two gear slots, then what you carry, then tools.
  const slot = (glyph: string, g: typeof p.weapon, stat: string, empty: string) =>
    h(
      "p",
      { class: g ? "" : "faint", title: g ? `${describe(g)}${g.trait !== "plain" ? `. ${TRAITS[g.trait].text}` : ""}` : "" },
      h("kbd", null, " "),
      ` ${glyph} `,
      g ? `${shortName(g.name, 26)} ${stat}` : empty,
    );
  const held = [
    slot("/", p.weapon, `+${p.weapon?.bonus ?? 0}`, "bare hands"),
    slot("[", p.armor, `def ${p.armor?.bonus ?? 0}`, "no armor"),
    h(
      "p",
      { class: "carry" },
      h("span", { class: p.potions.length ? "t-good" : "faint" }, h("kbd", null, "q"), ` ! potion ${p.potions.length}`),
      h("span", { class: p.scrolls.length ? "t-loot" : "faint" }, h("kbd", null, "r"), ` ? scroll ${p.scrolls.length}`),
      p.curses ? h("span", { class: "t-bad" }, ` % curse ${p.curses}`) : null,
    ),
    p.perks.length > 3
      ? h("p", { class: "faint tools" }, `${plural(p.perks.length, "tool")}, `, h("kbd", null, "c"), " lists them")
      : h("p", { class: "faint tools" }, p.perks.length ? p.perks.map((id) => PERKS[id].name).join(", ") : "no tools yet"),
  ];
  const pack = h("section", { class: "pane pack" }, h("h2", null, "pack"), ...held);

  const canvas = h("canvas", { class: "minimap", "aria-label": "Map of what you have seen" }) as HTMLCanvasElement;
  drawMinimap(canvas, game);
  const map = h("section", { class: "pane" }, canvas);

  const here = h(
    "section",
    { class: "pane here" },
    ...(room
      ? [
        h("p", { class: "path" }, room.spec.path),
        h("p", { class: "faint" }, `${room.spec.language}, ${room.spec.loc} lines, changed ${plural(room.spec.churn, "time")}`),
        room.spec.kind === "shrine" ? h("p", { class: "t-good" }, "A test file. Step on * to heal.") : null,
        room.spec.blurb ? h("p", { class: "blurb" }, `"${room.spec.blurb}"`) : null,
        room.spec.last_commit ? h("p", { class: "faint" }, "last change ", h("span", { class: "t-lore" }, `"${room.spec.last_commit}"`)) : null,
        ]
      : [h("p", { class: "faint" }, "In a corridor between files.")]),
  );

  replace(el, sight, pack, map, here);
}

/** With nothing in sight the rows say what's next, so the space isn't blank. */
function idleLines(game: Game) {
  const lines = game.floor.bossDead
    ? ["The stairs are open. > takes them."]
    : [`${game.floorSpec.boss.name} is somewhere on this floor.`, "x explores until something shows up."];
  return lines.map((l) => h("p", { class: "faint idle" }, l));
}

/** Monsters listed under "in sight" before the rest are folded into a count. */
const SIGHT_ROWS = 6;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
