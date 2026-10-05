// Tiny element builder. Strings always become text nodes, so names and
// comments from a repo can never turn into markup. Nothing in src parses
// strings as HTML, and tests/ui.test.ts checks that it stays that way.

export type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h(tag: string, attrs: Attrs | null = null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
      else if (k === "class") el.className = String(v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

export function replace(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

export function bar(value: number, max: number, width: number): string {
  const n = max > 0 ? Math.max(0, Math.min(width, Math.round((value / max) * width))) : 0;
  return "#".repeat(n) + "-".repeat(width - n);
}

export function plural(n: number, word: string): string {
  const many = /(s|sh|ch|x)$/.test(word) ? `${word}es` : `${word}s`;
  return `${n} ${n === 1 ? word : many}`;
}
