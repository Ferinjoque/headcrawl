// Plays the score from score.ts with WebAudio. No files: every note is an
// oscillator or a burst of noise, scheduled a bar ahead on the audio clock
// ("A Tale of Two Clocks"), so timing holds even when the main thread is busy.
// Mood and theme changes wait for the next bar line, so nothing cuts mid-phrase.

import { bar, hz, nextPick, tempoFor, type Extras, type Mood, type Note, type Theme } from "./score";

/** How far ahead of the audio clock bars get scheduled, in seconds. */
const AHEAD = 0.25;
const TICK_MS = 50;
const VOLUME = 0.7;

export class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private wet: GainNode | null = null;
  private echo: GainNode | null = null;
  private delay: DelayNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private pulse: PeriodicWave | null = null;
  private timer = 0;
  private theme: Theme | null = null;
  private nextTheme: Theme | null = null;
  private mood: Mood = "title";
  private nextMood: Mood = "title";
  private extras: Extras = {};
  private barNo = 0;
  private barTime = 0;
  private pick = 0;
  private walk = 1;
  private pan = 1;
  enabled = true;

  /** Hooks up to the sound effects' AudioContext once it exists. */
  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx === ctx) return;
    this.ctx = ctx;
    const out = ctx.createGain();
    out.gain.value = VOLUME;
    // A gentle lowpass and a compressor on the whole bus: night-time listening.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    out.connect(lp).connect(comp).connect(ctx.destination);
    this.bus = ctx.createGain();
    this.bus.connect(out);

    // Room: a short seeded-noise reverb for the pad and arp.
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(ctx, 2.4);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.3;
    this.wet.connect(verb).connect(this.bus);

    // Dotted-eighth echo with the highs rolled off inside the loop.
    const delay = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.33;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.28;
    this.echo.connect(delay);
    delay.connect(tone).connect(fb).connect(delay);
    tone.connect(this.bus);
    this.delay = delay;

    const len = Math.ceil(ctx.sampleRate * 0.3);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let s = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = s / 2147483648 - 1;
    }
    // A 25% pulse, the classic thin chiptune lead. WebAudio's square is 50%.
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    this.pulse = ctx.createPeriodicWave(real, imag);
  }


  /** Set what plays. Takes effect on the next bar line. */
  set(theme: Theme, mood: Mood, extras: Extras = {}): void {
    this.nextTheme = theme;
    this.nextMood = mood;
    this.extras = extras;
    this.start();
  }

  setMood(mood: Mood): void {
    this.nextMood = mood;
  }

  private start(): void {
    if (this.timer || !this.ctx || !this.enabled) return;
    this.barTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (!this.timer) return;
    window.clearInterval(this.timer);
    this.timer = 0;
    if (this.bus && this.ctx) {
      const g = this.bus.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      g.setTargetAtTime(1, this.ctx.currentTime + 2, 0.01);
    }
  }

  /** A short dip when you get hit, so the hit reads over the music. */
  duck(): void {
    if (!this.bus || !this.ctx) return;
    const g = this.bus.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.6, t + 0.03);
    g.setTargetAtTime(1, t + 0.2, 0.15);
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return this.stop();
    if (ctx.state !== "running") return;
    // If the tab slept, don't try to catch up on every missed bar.
    if (this.barTime < ctx.currentTime - 1) this.barTime = ctx.currentTime + 0.05;
    while (this.barTime < ctx.currentTime + AHEAD) this.scheduleBar();
  }

  private scheduleBar(): void {
    if (this.nextTheme) {
      this.theme = this.nextTheme;
      this.nextTheme = null;
    }
    if (this.nextMood !== this.mood) {
      this.mood = this.nextMood;
      this.barNo = 0;
    }
    const t = this.theme;
    if (!t) return;
    const sixteenth = 60 / tempoFor(t, this.mood) / 4;
    if (this.delay) this.delay.delayTime.setValueAtTime(sixteenth * 3, this.barTime);
    if (this.echo) this.echo.gain.setValueAtTime(t.echo, this.barTime);
    for (const n of bar(t, this.mood, this.barNo, this.pick, this.extras)) this.play(n, this.barTime + n.step * sixteenth, sixteenth);
    // A cheap, repeatable walk through the phrases.
    this.walk = (this.walk * 48271) % 2147483647;
    this.pick = nextPick(this.pick, this.walk / 2147483647);
    this.barNo++;
    this.barTime += 16 * sixteenth;
  }

  private play(n: Note, at: number, sixteenth: number): void {
    const t = this.theme!;
    switch (n.voice) {
      case "pad":
        return this.pad(n, at, n.len * sixteenth);
      case "arp":
        return this.arp(n, at, t.arpWave);
      case "bass":
        return this.bass(n, at, n.len * sixteenth);
      case "lead":
        return this.lead(n, at, n.len * sixteenth);
      case "kick":
        return this.kick(n, at);
      case "hat":
        return this.hit(n, at, "highpass", 7000, 0.04);
      case "snare":
        this.hit(n, at, "bandpass", 1800, 0.12);
        this.osc("triangle", 180, at, 0.12, n.vel * 0.3, this.bus!);
        return;
      case "bell":
        return this.bell(n, at);
      case "ghost":
        return this.ghost(n, at, n.len * sixteenth);
    }
  }

  private env(at: number, attack: number, hold: number, release: number, peak: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    return g;
  }

  private osc(type: OscillatorType | "pulse", freq: number, at: number, dur: number, vol: number, to: AudioNode, detune = 0): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    if (type === "pulse" && this.pulse) o.setPeriodicWave(this.pulse);
    else o.type = type === "pulse" ? "square" : type;
    o.frequency.setValueAtTime(freq, at);
    o.detune.value = detune;
    const g = this.env(at, 0.004, 0, dur, vol);
    o.connect(g).connect(to);
    o.start(at);
    o.stop(at + dur + 0.05);
    return o;
  }

  private pad(n: Note, at: number, dur: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(500, at);
    f.frequency.linearRampToValueAtTime(1100, at + dur * 0.5);
    f.frequency.linearRampToValueAtTime(600, at + dur);
    const attack = Math.min(1.2, dur * 0.4);
    const g = this.env(at, attack, Math.max(0, dur - attack), 1.6, n.vel * 0.08);
    f.connect(g);
    g.connect(this.bus!);
    g.connect(this.wet!);
    for (const cents of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = this.theme?.padWave ?? "sawtooth";
      o.frequency.value = hz(n.midi);
      o.detune.value = cents;
      o.connect(f);
      o.start(at);
      o.stop(at + dur + 1.7);
    }
  }

  private arp(n: Note, at: number, wave: Theme["arpWave"]): void {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    this.pan = -this.pan;
    p.pan.value = 0.3 * this.pan;
    p.connect(this.bus!);
    p.connect(this.echo!);
    p.connect(this.wet!);
    this.osc(wave, hz(n.midi), at, 0.16, n.vel * 0.07, p);
  }

  private bass(n: Note, at: number, dur: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, at);
    f.frequency.exponentialRampToValueAtTime(200, at + 0.15);
    f.connect(this.bus!);
    this.osc(this.theme?.bassWave ?? "square", hz(n.midi), at, Math.max(0.12, dur * 0.9), n.vel * 0.09, f);
  }

  /** A struck bell: a sine and its inharmonic partials, long decay. */
  private bell(n: Note, at: number): void {
    const f = hz(n.midi);
    for (const [ratio, vol] of [[1, 1], [2.76, 0.4], [5.4, 0.2]] as const) {
      this.osc("sine", f * ratio, at, 2.2 / ratio, n.vel * 0.5 * vol, this.wet!);
      this.osc("sine", f * ratio, at, 1.6 / ratio, n.vel * 0.3 * vol, this.bus!);
    }
  }

  /** Dead code humming: a thin sine that slowly wavers, mostly reverb. */
  private ghost(n: Note, at: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz(n.midi);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = 18;
    lfo.connect(depth).connect(o.detune);
    const g = this.env(at, Math.min(0.8, dur * 0.4), Math.max(0, dur * 0.4), dur * 0.6, n.vel * 0.07);
    o.connect(g);
    g.connect(this.wet!);
    g.connect(this.bus!);
    for (const x of [o, lfo]) {
      x.start(at);
      x.stop(at + dur * 1.5 + 0.1);
    }
  }

  private lead(n: Note, at: number, dur: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2200;
    f.connect(this.bus!);
    f.connect(this.echo!);
    this.osc("sawtooth", hz(n.midi), at, dur, n.vel * 0.06, f, -5);
    this.osc("sawtooth", hz(n.midi), at, dur, n.vel * 0.06, f, 5);
  }

  private kick(n: Note, at: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    const g = this.env(at, 0.002, 0, 0.25, n.vel * 0.3);
    o.connect(g).connect(this.bus!);
    o.start(at);
    o.stop(at + 0.3);
  }

  private hit(n: Note, at: number, type: BiquadFilterType, freq: number, dur: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.env(at, 0.001, 0, dur, n.vel * 0.18);
    src.connect(f).connect(g).connect(this.bus!);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  private impulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.ceil(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let s = 12345;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        s = (s * 1103515245 + 12345) >>> 0;
        d[i] = (s / 2147483648 - 1) * (1 - i / len) ** 2.5;
      }
    }
    return buf;
  }
}
