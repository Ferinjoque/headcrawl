// The cards that stop the game until you choose: a perk on level up, the
// shop's two deals, or gear on the floor when that slot is full.
// Keys 1, 2 and 3 pick; esc walks away where walking away is allowed.

import type { Game } from "../game/game";
import { TRAITS, type Gear } from "../game/gear";
import { PERKS, type PerkId } from "../game/perks";
import type { Action } from "../game/types";
import type { Offer } from "../game/extras";
import { codeEverywhere, toolName } from "./detail";
import { h, replace } from "./dom";
import type { Command } from "./input";

function option(key: string, name: string, text: string, pick: () => void, cls = "", about = "") {
  return h(
    "button",
    { class: `perk ${cls}`.trim(), type: "button", onclick: pick, title: about || undefined },
    h("kbd", null, key),
    h("span", { class: "perk-name" }, name),
    // At the moment of choosing, only what it does. The real tool behind it is a hover away.
    h("span", { class: "perk-text" }, text, about && codeEverywhere() ? h("small", { class: "perk-about" }, about) : null),
  );
}

export function perkCard(ids: PerkId[], pick: (index: number) => void) {
  return h(
    "div",
    { class: "card choice", role: "dialog", "aria-label": "Pick a tool" },
    h("div", { class: "card-kicker" }, "level up. pick a tool"),
    ...ids.map((id, i) => option(String(i + 1), toolName(id), PERKS[id].rare ? `rare. ${PERKS[id].text}` : PERKS[id].text, () => pick(i), PERKS[id].rare ? "rare" : "", `${PERKS[id].name}: ${PERKS[id].about}`)),
  );
}

export function vendorCard(offers: Offer[], pick: (index: number) => void) {
  return h(
    "div",
    { class: "card choice", role: "dialog", "aria-label": "The shop" },
    h("div", { class: "card-kicker" }, "the shop. one buy per floor, from the libraries this code uses"),
    ...offers.map((o, i) => option(String(i + 1), o.dep.name, o.deal.text, () => pick(i))),
    option("esc", "walk away", "", () => pick(-1)),
  );
}

/** "attack +5 (2 more), rust. borrow checked: ignores armor" */
function gearText(g: Gear, other?: Gear): string {
  const stat = g.slot === "armor" ? "defense" : "attack +";
  const diff = other ? g.bonus - other.bonus : 0;
  const delta = !other || !diff ? "" : diff > 0 ? ` (${diff} more)` : ` (${-diff} less)`;
  const head = g.slot === "armor" ? `${stat} ${g.bonus}${delta}` : `${stat}${g.bonus}${delta}, ${g.language}`;
  return g.trait === "plain" ? head : `${head}. ${TRAITS[g.trait].name}: ${TRAITS[g.trait].text}`;
}

const short = (s: string, n = 18) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function gearCard(found: Gear, mine: Gear, pick: (take: boolean) => void) {
  return h(
    "div",
    { class: "card choice", role: "dialog", "aria-label": `Swap your ${found.slot}?` },
    h("div", { class: "card-kicker" }, `a ${found.slot}. you carry one: take it, or keep yours`),
    option("1", short(found.name), gearText(found, mine), () => pick(true)),
    option("2", short(mine.name), `yours. ${gearText(mine)}`, () => pick(false), "keep"),
  );
}

/** What is waiting on the player, as a key that changes when the card should. */
function pending(game: Game): string {
  if (game.perkChoice) return `perk:${game.perkChoice.join(",")}:${game.player.perks.length}`;
  if (game.vendorChoice) return "vendor";
  if (game.gearChoice) return `gear:${game.gearChoice.id}`;
  return "";
}

/** Puts the right card in the banner, or clears it when nothing is pending. */
export function syncChoice(banner: HTMLElement, game: Game, act: (a: Action) => void): void {
  const key = pending(game);
  const card = banner.querySelector<HTMLElement>(".choice");
  if (card?.dataset.key === key) return;
  if (!key) {
    if (card) replace(banner);
    return;
  }
  const mine = game.gearChoice?.gear ? game.player[game.gearChoice.gear.slot] : null;
  const next = game.perkChoice
    ? perkCard(game.perkChoice, (index) => act({ type: "perk", index }))
    : game.vendorChoice
      ? vendorCard(game.vendorChoice, (index) => act({ type: "buy", index }))
      : game.gearChoice?.gear && mine
        ? gearCard(game.gearChoice.gear, mine, (take) => act({ type: "gear", take }))
        : null;
  if (!next) return;
  next.dataset.key = key;
  replace(banner, next);
}

/**
 * The action a key stands for while a card is up. Undefined when no card is
 * up, null when the key means nothing to this card.
 */
export function choiceAction(game: Game, c: Command): Action | null | undefined {
  const index = c.kind === "perk" ? c.index : -1;
  if (game.perkChoice) return index >= 0 ? { type: "perk", index } : null;
  if (game.vendorChoice) {
    if (index === 0 || index === 1) return { type: "buy", index };
    return c.kind === "menu" ? { type: "buy", index: -1 } : null;
  }
  if (game.gearChoice) {
    if (index === 0 || index === 1) return { type: "gear", take: index === 0 };
    return c.kind === "menu" ? { type: "gear", take: false } : null;
  }
  return undefined;
}
