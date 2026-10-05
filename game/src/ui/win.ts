// The pieces menus are built from: a framed window with its title set into
// the frame, tabs along its top edge, and key buttons. Terminal windows, not
// web cards: one border, a title in it, and panes split by a single line.

import { h, type Child } from "./dom";

/** A framed window. The title sits in the top border, like an old TUI. */
export function win(title: Child, cls: string, ...body: Child[]): HTMLElement {
  return h("section", { class: `win ${cls}`.trim() }, h("div", { class: "win-title" }, title), ...body);
}

/** A key button: the key in a cap, then what it does. */
export function key(cap: string, label: Child, onclick: () => void, extra: Record<string, string> = {}): HTMLElement {
  return h("button", { class: "key", type: "button", onclick, ...extra }, h("kbd", null, cap), h("span", null, label));
}

export interface Tab<T extends string> {
  id: T;
  label: string;
  cap: string;
}

/** Tabs on the window's top edge. The current one opens into the window below it. */
export function tabs<T extends string>(list: Tab<T>[], current: T, pick: (id: T) => void): HTMLElement {
  return h(
    "div",
    { class: "tabs", role: "tablist" },
    ...list.map((t) =>
      h(
        "button",
        { class: "tab", type: "button", role: "tab", "aria-selected": String(t.id === current), onclick: () => pick(t.id) },
        h("kbd", null, t.cap),
        t.label,
      ),
    ),
  );
}

/**
 * Tabs that switch panes inside one page, for overlays too long to scroll
 * through. The number keys switch them too (the app clicks the tab).
 */
export function paneTabs(panes: { label: string; body: Child[] }[]): HTMLElement {
  const bodies = panes.map((p, i) => h("div", { class: "tab-pane", role: "tabpanel", hidden: i !== 0 }, ...p.body));
  const buttons = panes.map((p, i) =>
    h(
      "button",
      {
        class: "tab",
        type: "button",
        role: "tab",
        "aria-selected": String(i === 0),
        onclick: () => {
          bodies.forEach((b, j) => (b.hidden = j !== i));
          buttons.forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
        },
      },
      h("kbd", null, String(i + 1)),
      p.label,
    ),
  );
  return h("div", { class: "pane-tabs" }, h("div", { class: "tabs inner", role: "tablist" }, ...buttons), ...bodies);
}

/** A number key in an overlay with tabs: open that tab. True if it did. */
export function tabKey(root: HTMLElement, key: string): boolean {
  if (!/^[1-9]$/.test(key)) return false;
  const tab = root.querySelectorAll<HTMLElement>('.pane-tabs [role="tab"]')[Number(key) - 1];
  tab?.click();
  return !!tab;
}
