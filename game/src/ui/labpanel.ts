// The lab tools: a panel over the map in the lab and in practice runs. Spawn
// any monster, hand yourself gear or tools, turn on god mode or freeze the
// floor. ` shows and hides it.

import { AFFIX, type Affix } from "../game/elites";
import type { Game } from "../game/game";
import { TRAITS, traitFor } from "../game/gear";
import {
  LAB_KINDS,
  LAB_LANGUAGES,
  clearMonsters,
  dropItem,
  giveArmor,
  giveWeapon,
  grant,
  healFull,
  levelUp,
  openStairs,
  revealAll,
  spawn,
  spawnBoss,
} from "../game/lab";
import { BOSS_STYLE, type BossStyle } from "../game/bossmoves";
import { ALL_PERKS, PERKS, type PerkId } from "../game/perks";
import { h, replace } from "./dom";

export interface LabHost {
  /** The game, while one is being played. */
  game(): Game | null;
  /** Something changed: show its events and redraw. */
  changed(): void;
}

export class LabPanel {
  private open = false;
  private enabled = false;
  private affix: Affix | null = null;
  private deprecated = false;
  private reverted = false;

  private el: HTMLElement;
  private host: LabHost;

  constructor(el: HTMLElement, host: LabHost) {
    this.el = el;
    this.host = host;
  }

  /** On for the lab and practice runs, off for runs that count. */
  enable(on: boolean): void {
    this.enabled = on;
    this.open = on;
    this.render();
  }

  toggle(): void {
    if (!this.enabled) return;
    this.open = !this.open;
    this.render();
  }

  private act(f: (g: Game) => void): void {
    const g = this.host.game();
    if (!g || g.outcome !== "playing") return;
    f(g);
    this.host.changed();
    this.render();
  }

  render(): void {
    this.el.hidden = !this.enabled;
    if (!this.enabled) return;
    const g = this.host.game();
    const chip = (label: string, title: string, on: () => void, pressed?: boolean) =>
      h(
        "button",
        {
          class: "chip",
          type: "button",
          title,
          "aria-pressed": pressed === undefined ? undefined : String(pressed),
          // Let go of focus, or space (wait) would press the button again.
          onclick: (e: Event) => {
            (e.currentTarget as HTMLElement).blur();
            on();
          },
        },
        label,
      );
    const head = h(
      "button",
      { class: "lab-head", type: "button", "aria-expanded": String(this.open), onclick: () => this.toggle() },
      h("span", null, "lab tools"),
      h("kbd", null, "`"),
    );
    if (!this.open || !g) {
      replace(this.el, head);
      return;
    }
    const perkSelect = h(
      "select",
      { class: "lab-select", "aria-label": "Tool to grant" },
      ...ALL_PERKS.map((id) => h("option", { value: id }, PERKS[id].name)),
    ) as HTMLSelectElement;
    replace(
      this.el,
      head,
      h(
        "div",
        { class: "lab-body" },
        h("h3", null, "spawn"),
        h("div", { class: "chips" }, ...LAB_KINDS.map((k) => chip(k, `spawn a ${k} near you`, () => this.act((x) => void spawn(x, k, this.affix, this.deprecated, this.reverted))))),
        h(
          "div",
          { class: "chips" },
          chip("plain", "spawn ordinary monsters", () => this.setAffix(null), this.affix === null),
          ...(Object.keys(AFFIX) as Affix[]).map((a) => chip(AFFIX[a].name, `spawn elites: ${AFFIX[a].text}`, () => this.setAffix(a), this.affix === a)),
          chip("outdated", "spawn outdated ones: their hits slow you", () => {
            this.deprecated = !this.deprecated;
            this.render();
          }, this.deprecated),
          chip("reverted", "spawn reverted ones: they come back once at half HP", () => {
            this.reverted = !this.reverted;
            this.render();
          }, this.reverted),
        ),
        h(
          "div",
          { class: "chips" },
          ...(Object.keys(BOSS_STYLE) as BossStyle[]).map((s) => chip(`boss: ${BOSS_STYLE[s].name}`, BOSS_STYLE[s].text, () => this.act((x) => void spawnBoss(x, s)))),
        ),
        h("h3", null, "gear"),
        h(
          "div",
          { class: "chips" },
          ...LAB_LANGUAGES.map((l) => chip(l, `a ${l} weapon: ${TRAITS[traitFor(l)].text}`, () => this.act((x) => giveWeapon(x, l)))),
        ),
        h("div", { class: "chips" }, chip("armor 2", "put on defense 2", () => this.act((x) => giveArmor(x, 2))), chip("armor 4", "put on defense 4", () => this.act((x) => giveArmor(x, 4))), chip("no armor", "take armor off", () => this.act((x) => giveArmor(x, 0)))),
        h("h3", null, "tools"),
        h("div", { class: "chips" }, perkSelect, chip("grant", "take the picked tool", () => this.act((x) => grant(x, perkSelect.value as PerkId)))),
        h("h3", null, "you and the floor"),
        h(
          "div",
          { class: "chips" },
          chip("god", "you can't drop below 1 HP", () => this.act((x) => (x.cheats.god = !x.cheats.god)), g.cheats.god),
          chip("freeze", "monsters don't move or attack", () => this.act((x) => (x.cheats.frozen = !x.cheats.frozen)), g.cheats.frozen),
          chip("heal", "back to full HP", () => this.act(healFull)),
          chip("level up", "one level, with its tool pick", () => this.act(levelUp)),
          chip("reveal", "map the whole floor", () => this.act(revealAll)),
          chip("clear", "remove every monster but the boss", () => this.act(clearMonsters)),
          chip("stairs", "open the stairs down", () => this.act(openStairs)),
        ),
        h(
          "div",
          { class: "chips" },
          chip("potion", "drop a potion (TODO) near you", () => this.act((x) => dropItem(x, "potion"))),
          chip("scroll", "drop a scroll (HACK) near you", () => this.act((x) => dropItem(x, "scroll"))),
          chip("curse", "drop a curse (XXX) near you", () => this.act((x) => dropItem(x, "curse"))),
          chip("coffee", "drop a coffee near you", () => this.act((x) => dropItem(x, "coffee"))),
        ),
        h("p", { class: "faint lab-note" }, "Practice: no save, no records, no daily."),
      ),
    );
  }

  private setAffix(a: Affix | null): void {
    this.affix = a;
    this.render();
  }
}
