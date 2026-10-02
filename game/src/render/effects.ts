import type { RGB } from "./palette";

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: RGB;
  born: number;
  life: number;
}

export interface Flash {
  x: number;
  y: number;
  color: RGB;
  born: number;
  life: number;
}

/** Short-lived visual effects. Times are performance.now() milliseconds. */
export class Effects {
  floaters: Floater[] = [];
  flashes: Flash[] = [];
  shakeUntil = 0;
  shakePower = 0;
  reduced = false;

  float(x: number, y: number, text: string, color: RGB, now: number): void {
    // Stack numbers that land on the same cell so they don't overlap.
    const same = this.floaters.filter((f) => f.x === x && f.y === y && now - f.born < 300).length;
    this.floaters.push({ x, y: y - same * 0.6, text, color, born: now, life: 800 });
  }

  flash(x: number, y: number, color: RGB, now: number): void {
    this.flashes.push({ x, y, color, born: now, life: 160 });
  }

  shake(power: number, now: number): void {
    if (this.reduced) return;
    this.shakePower = Math.max(this.shakePower, power);
    this.shakeUntil = now + 260;
  }

  busy(now: number): boolean {
    this.floaters = this.floaters.filter((f) => now - f.born < f.life);
    this.flashes = this.flashes.filter((f) => now - f.born < f.life);
    if (now > this.shakeUntil) this.shakePower = 0;
    return this.floaters.length > 0 || this.flashes.length > 0 || this.shakePower > 0;
  }

  clear(): void {
    this.floaters = [];
    this.flashes = [];
    this.shakePower = 0;
  }
}
