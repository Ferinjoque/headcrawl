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

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ch: string;
  color: RGB;
  born: number;
  life: number;
}

/** Short-lived visual effects. Times are performance.now() milliseconds. */
export class Effects {
  floaters: Floater[] = [];
  particles: Particle[] = [];
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
    if (this.reduced) return;
    this.flashes.push({ x, y, color, born: now, life: 160 });
  }

  /**
   * Throw characters out of a cell. Visual only, so plain Math.random is fine:
   * nothing here feeds back into the game.
   */
  burst(x: number, y: number, chars: string, color: RGB, now: number, speed = 1): void {
    if (this.reduced) return;
    const list = [...chars].filter((c) => c.trim()).slice(0, 14);
    list.forEach((ch, i) => {
      const angle = (i / list.length) * Math.PI * 2 + Math.random() * 0.6;
      const v = (0.004 + Math.random() * 0.004) * speed;
      this.particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v * 0.8,
        ch,
        color,
        born: now,
        life: 650 + Math.random() * 350,
      });
    });
  }

  /** The weapon in your hand, cutting from your cell into the target's for a moment. */
  swing(fromX: number, fromY: number, toX: number, toY: number, color: RGB, now: number): void {
    if (this.reduced) return;
    const dx = Math.sign(toX - fromX);
    const dy = Math.sign(toY - fromY);
    const ch = !dy ? "-" : !dx ? "|" : dx === dy ? "\\" : "/";
    this.particles.push({ x: fromX + 0.5 + dx * 0.55, y: fromY + 0.5 + dy * 0.55, vx: dx * 0.0012, vy: dy * 0.0012, ch, color, born: now, life: 190 });
  }

  shake(power: number, now: number): void {
    if (this.reduced) return;
    this.shakePower = Math.max(this.shakePower, power);
    this.shakeUntil = now + 260;
  }

  busy(now: number): boolean {
    this.floaters = this.floaters.filter((f) => now - f.born < f.life);
    this.flashes = this.flashes.filter((f) => now - f.born < f.life);
    this.particles = this.particles.filter((p) => now - p.born < p.life);
    if (now > this.shakeUntil) this.shakePower = 0;
    return this.floaters.length > 0 || this.flashes.length > 0 || this.particles.length > 0 || this.shakePower > 0;
  }

  clear(): void {
    this.floaters = [];
    this.flashes = [];
    this.particles = [];
    this.shakePower = 0;
  }
}
