// Gamepads, polled once a frame. Buttons turn into the key presses the game
// already understands, so menus, cards and aiming all work without a second
// set of handlers. Standard mapping (Xbox names): d-pad or left stick moves,
// A confirms, B backs out, X explores, Y rests, LB potion, RB scroll,
// LT shoot, RT next target or tab, Start menu, Back help.

const BUTTON_KEYS: Record<number, string> = {
  0: "Enter",
  1: "Escape",
  2: "x",
  3: "z",
  4: "q",
  5: "r",
  6: "f",
  7: "Tab",
  8: "?",
  9: "Escape",
  10: "c",
  11: "c",
  12: "ArrowUp",
  13: "ArrowDown",
  14: "ArrowLeft",
  15: "ArrowRight",
};

/** Stick directions as the vi keys for all eight ways. */
const STICK_KEYS: Record<string, string> = {
  "0,-1": "ArrowUp",
  "0,1": "ArrowDown",
  "-1,0": "ArrowLeft",
  "1,0": "ArrowRight",
  "-1,-1": "y",
  "1,-1": "u",
  "-1,1": "b",
  "1,1": "n",
};

const DEADZONE = 0.5;
/** Holding a direction: first repeat after this, then every REPEAT_MS. */
const DELAY_MS = 260;
const REPEAT_MS = 120;
const REPEATS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "y", "u", "b", "n"]);

function stickKey(pad: Gamepad): string | null {
  const [x = 0, y = 0] = pad.axes;
  const dx = Math.abs(x) > DEADZONE ? Math.sign(x) : 0;
  const dy = Math.abs(y) > DEADZONE ? Math.sign(y) : 0;
  return dx || dy ? (STICK_KEYS[`${dx},${dy}`] ?? null) : null;
}

/** Up, down, left, right and A move between and press a card's buttons. */
function onCard(key: string): boolean {
  const card = document.querySelector<HTMLElement>("#banner .choice");
  if (!card) return false;
  const buttons = [...card.querySelectorAll<HTMLButtonElement>("button")];
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (key === "Enter" && at >= 0) {
    buttons[at].click();
    return true;
  }
  const step = key === "ArrowDown" || key === "ArrowRight" ? 1 : key === "ArrowUp" || key === "ArrowLeft" ? -1 : 0;
  if (!step) return false;
  buttons[at < 0 ? 0 : (at + step + buttons.length) % buttons.length]?.focus();
  return true;
}

export class Pads {
  private held = new Map<string, number>();
  private connected = false;
  /** Says hi in the log; false when there is no log on screen yet, to try again later. */
  private hello: (text: string) => boolean;

  constructor(hello: (text: string) => boolean) {
    this.hello = hello;
  }

  poll(now: number): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p): p is Gamepad => !!p && p.connected);
    if (!pad) return;
    if (!this.connected) {
      this.connected = this.hello("Gamepad found. D-pad moves, A confirms, B backs out, Back shows every button.");
    }
    const down = new Set<string>();
    pad.buttons.forEach((b, i) => {
      const key = BUTTON_KEYS[i];
      if (key && b.pressed) down.add(key);
    });
    const stick = stickKey(pad);
    if (stick) down.add(stick);
    for (const key of [...this.held.keys()]) if (!down.has(key)) this.held.delete(key);
    for (const key of down) {
      const next = this.held.get(key);
      if (next === undefined) {
        this.held.set(key, now + DELAY_MS);
        this.press(key);
      } else if (REPEATS.has(key) && now >= next) {
        this.held.set(key, now + REPEAT_MS);
        this.press(key);
      }
    }
  }

  private press(key: string): void {
    if (onCard(key)) return;
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }
}
