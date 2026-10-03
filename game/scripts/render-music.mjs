// Renders each music mood to a WAV file so it can be listened to without
// playing. Needs the dev server running.
// Usage: node scripts/render-music.mjs [baseUrl] [outDir] [repoHead]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5179/";
const out = process.argv[3] ?? "music";
const head = process.argv[4] ?? "d73fa1c0ffee";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base);

for (const mood of ["title", "explore", "combat", "boss", "rage", "won", "lost"]) {
  const res = await page.evaluate(
    async ({ mood, head }) => {
      const { Music } = await import("/src/audio/music.ts");
      const { theme } = await import("/src/audio/score.ts");
      const secs = mood === "won" || mood === "lost" ? 8 : 20;
      const ctx = new OfflineAudioContext(2, 44100 * secs, 44100);
      const m = new Music();
      m.attach(ctx);
      const depth = mood === "explore" ? 0 : mood === "combat" ? 0.5 : 1;
      m.nextTheme = mood === "title" ? theme("HEADCRAWL", 0, "python", "HEADCRAWL") : theme(head, depth, "python", "parse_args");
      m.nextMood = mood;
      m.barTime = 0.05;
      while (m.barTime < secs - 0.5) m.scheduleBar();
      const buf = await ctx.startRendering();
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      let peak = 0;
      let sum = 0;
      const pcm = new Int16Array(L.length * 2);
      for (let i = 0; i < L.length; i++) {
        peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
        sum += L[i] * L[i];
        pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767;
        pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
      }
      return { peak, rms: Math.sqrt(sum / L.length), pcm: Array.from(new Uint8Array(pcm.buffer)) };
    },
    { mood, head },
  );
  const data = Buffer.from(res.pcm);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(44100 * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(`${out}/${mood}.wav`, Buffer.concat([header, data]));
  const db = (v) => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
  console.log(`${mood.padEnd(8)} peak ${db(res.peak)} dB  rms ${db(res.rms)} dB`);
}
await browser.close();
