export type Command =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "wait" }
  | { kind: "descend" }
  | { kind: "quaff" }
  | { kind: "read" }
  | { kind: "explore" }
  | { kind: "rest" }
  | { kind: "help" }
  | { kind: "menu" }
  | { kind: "panel" }
  | { kind: "sound" }
  | { kind: "perk"; index: number };

const MOVES: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  k: [0, -1],
  j: [0, 1],
  h: [-1, 0],
  l: [1, 0],
  y: [-1, -1],
  u: [1, -1],
  b: [-1, 1],
  n: [1, 1],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  Home: [-1, -1],
  PageUp: [1, -1],
  End: [-1, 1],
  PageDown: [1, 1],
};

const NUMPAD: Record<string, [number, number]> = {
  Numpad8: [0, -1],
  Numpad2: [0, 1],
  Numpad4: [-1, 0],
  Numpad6: [1, 0],
  Numpad7: [-1, -1],
  Numpad9: [1, -1],
  Numpad1: [-1, 1],
  Numpad3: [1, 1],
};

export function keyToCommand(e: KeyboardEvent): Command | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const numpad = NUMPAD[e.code];
  if (numpad) return { kind: "move", dx: numpad[0], dy: numpad[1] };
  const move = MOVES[e.key];
  if (move) return { kind: "move", dx: move[0], dy: move[1] };
  switch (e.key) {
    case ".":
    case " ":
    case "5":
      return { kind: "wait" };
    case ">":
      return { kind: "descend" };
    case "q":
      return { kind: "quaff" };
    case "r":
      return { kind: "read" };
    case "x":
      return { kind: "explore" };
    case "z":
      return { kind: "rest" };
    case "?":
      return { kind: "help" };
    case "Escape":
      return { kind: "menu" };
    case "Tab":
      return { kind: "panel" };
    case "m":
      return { kind: "sound" };
    case "1":
    case "2":
    case "3":
      return { kind: "perk", index: Number(e.key) - 1 };
  }
  if (e.code === "Numpad5") return { kind: "wait" };
  return null;
}

/** On-screen buttons for touch devices. */
export function touchPad(el: HTMLElement, send: (c: Command) => void): void {
  const pad: [string, Command][] = [
    ["y", { kind: "move", dx: -1, dy: -1 }],
    ["k", { kind: "move", dx: 0, dy: -1 }],
    ["u", { kind: "move", dx: 1, dy: -1 }],
    ["h", { kind: "move", dx: -1, dy: 0 }],
    [".", { kind: "wait" }],
    ["l", { kind: "move", dx: 1, dy: 0 }],
    ["b", { kind: "move", dx: -1, dy: 1 }],
    ["j", { kind: "move", dx: 0, dy: 1 }],
    ["n", { kind: "move", dx: 1, dy: 1 }],
    ["x", { kind: "explore" }],
    [">", { kind: "descend" }],
    ["q", { kind: "quaff" }],
    ["menu", { kind: "menu" }],
    ["panel", { kind: "panel" }],
    ["?", { kind: "help" }],
  ];
  const arrows: Record<string, string> = { y: "↖", k: "↑", u: "↗", h: "←", l: "→", b: "↙", j: "↓", n: "↘", menu: "≡", panel: "i" };
  el.replaceChildren(
    ...pad.map(([label, cmd]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = arrows[label] ?? label;
      b.setAttribute("aria-label", cmd.kind === "move" ? `move ${label}` : cmd.kind);
      b.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        send(cmd);
      });
      return b;
    }),
  );
}
