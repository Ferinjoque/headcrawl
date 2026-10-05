import type { Tone } from "../game/types";
import { h, replace } from "./dom";

interface Line {
  text: string;
  tone: Tone;
  count: number;
}

const KEEP = 60;
/** Lines kept in the screen reader's copy of the log. */
const SPOKEN = 20;

export class Log {
  private lines: Line[] = [];
  private el: HTMLElement;
  private visible: number;
  /** The canvas says nothing to a screen reader, so new lines go to a live region one by one. */
  private spoken: HTMLElement | null;
  private pending: string[] = [];

  constructor(el: HTMLElement, visible = 5, spoken: HTMLElement | null = null) {
    this.el = el;
    this.visible = visible;
    this.spoken = spoken;
  }

  push(text: string, tone: Tone = "info"): void {
    const last = this.lines.at(-1);
    if (last && last.text === text) last.count++;
    else this.lines.push({ text, tone, count: 1 });
    if (this.lines.length > KEEP) this.lines.splice(0, this.lines.length - KEEP);
    this.pending.push(text);
  }

  clear(): void {
    this.lines = [];
    this.pending = [];
    this.spoken?.replaceChildren();
    this.render();
  }

  setVisible(n: number): void {
    this.visible = n;
  }

  render(): void {
    if (this.spoken) {
      for (const text of this.pending) this.spoken.append(h("p", null, text));
      while (this.spoken.childElementCount > SPOKEN) this.spoken.firstElementChild?.remove();
    }
    this.pending = [];
    const shown = this.lines.slice(-this.visible);
    replace(
      this.el,
      ...shown.map((line, i) => {
        const age = shown.length - 1 - i;
        const p = h("p", { class: `t-${line.tone}` }, line.text, line.count > 1 ? ` x${line.count}` : "");
        p.style.opacity = String(Math.max(0.35, 1 - age * 0.16));
        return p;
      }),
    );
  }
}
