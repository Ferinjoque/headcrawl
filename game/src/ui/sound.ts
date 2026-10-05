// Small synth sounds made with WebAudio, no audio files. On unless the player
// turned it off with m; the choice is remembered in this browser. Browsers
// keep it silent until the first key press anyway.

import type { GameEvent } from "../game/types";

const KEY = "headcrawl.sound";

type Wave = OscillatorType;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = false;

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) !== "off";
    } catch {
      this.enabled = true;
    }
  }

  /** The audio context, once the player has turned sound on and pressed a key. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  set(on: boolean): void {
    if (on !== this.enabled) this.toggle();
  }

  /** Must run inside a key or click handler, browsers block audio otherwise. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(KEY, this.enabled ? "on" : "off");
    } catch {
      // Storage blocked: the setting just won't stick.
    }
    if (this.enabled) this.wake();
    return this.enabled;
  }

  wake(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.14;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private tone(freq: number, dur: number, wave: Wave = "square", vol = 1, slideTo?: number, delay = 0): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.6, hp = 800, delay = 0): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
  }

  play(e: GameEvent): void {
    if (!this.enabled || !this.ctx) return;
    switch (e.t) {
      case "hit":
        if (e.onPlayer) {
          this.tone(110, 0.16, "sine", 0.9, 55);
          this.noise(0.06, 0.4, 300);
        } else {
          this.tone(e.crit ? 520 : 330, 0.07, "square", 0.5, e.crit ? 260 : 180);
          if (e.crit) this.noise(0.08, 0.5, 2000);
        }
        break;
      case "miss":
      case "dodge":
        this.noise(0.05, 0.25, 3000);
        break;
      case "kill":
        if (e.boss) [262, 196, 147, 98].forEach((f, i) => this.tone(f, 0.35, "sawtooth", 0.5, undefined, i * 0.12));
        else [440, 330, 220].forEach((f, i) => this.tone(f, 0.08, "square", 0.4, undefined, i * 0.05));
        break;
      case "pickup":
        this.tone(660, 0.06, "triangle", 0.6);
        this.tone(990, 0.09, "triangle", 0.6, undefined, 0.06);
        break;
      case "heal":
        if (e.amount > 0) this.tone(523, 0.18, "sine", 0.5, 784);
        break;
      case "levelup":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, "triangle", 0.6, undefined, i * 0.08));
        break;
      case "intro":
        this.tone(55, 1.2, "sawtooth", 0.6, 41);
        this.tone(82, 1.2, "sawtooth", 0.35, 61);
        break;
      case "telegraph":
        if (e.line) {
          // A connection opening: a modem-ish chirp that climbs.
          this.tone(600, 0.16, "sine", 0.45, 1400);
          this.tone(1400, 0.05, "square", 0.25, undefined, 0.17);
        } else {
          this.tone(880, 0.05, "square", 0.4);
          this.tone(880, 0.05, "square", 0.4, undefined, 0.09);
        }
        break;
      case "equip":
        if (e.gear.slot === "weapon") {
          this.noise(0.09, 0.35, 4000);
          this.tone(1200, 0.14, "triangle", 0.45, 1800, 0.02);
        } else {
          this.tone(140, 0.12, "sine", 0.7, 90);
          this.tone(620, 0.05, "square", 0.3, undefined, 0.05);
        }
        break;
      case "loop":
        this.tone(330, 0.18, "sine", 0.5, 160);
        this.tone(160, 0.18, "sine", 0.5, 330, 0.18);
        break;
      case "rewind":
        this.tone(900, 0.45, "sawtooth", 0.35, 180);
        this.noise(0.4, 0.2, 1500);
        break;
      case "split":
        this.tone(300, 0.06, "square", 0.4, 600);
        this.tone(300, 0.06, "square", 0.4, 150, 0.07);
        break;
      case "descend":
        this.tone(400, 0.5, "sine", 0.5, 80);
        break;
      case "death":
        this.tone(220, 1.1, "sawtooth", 0.5, 40);
        break;
      case "victory":
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, "triangle", 0.6, undefined, i * 0.11));
        break;
      default:
        break;
    }
  }
}
