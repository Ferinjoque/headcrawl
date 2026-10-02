import type { Tone } from "../game/types";
import { h, replace } from "./dom";

interface Line {
  text: string;
  tone: Tone;
  count: number;
}

const KEEP = 60;

export class Log {
  private lines: Line[] = [];
  private el: HTMLElement;
  private visible: number;

  constructor(el: HTMLElement, visible = 5) {
    this.el = el;
    this.visible = visible;
  }

  push(text: string, tone: Tone = "info"): void {
    const last = this.lines.at(-1);
    if (last && last.text === text) last.count++;
    else this.lines.push({ text, tone, count: 1 });
    if (this.lines.length > KEEP) this.lines.splice(0, this.lines.length - KEEP);
  }

  clear(): void {
    this.lines = [];
    this.render();
  }

  setVisible(n: number): void {
    this.visible = n;
  }

  render(): void {
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
