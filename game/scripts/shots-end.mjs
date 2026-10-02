// Screenshots of the death and victory screens, and the title on a phone.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5179/";
const out = process.argv[3] ?? "shots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}#/play/express`);
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const app = window.headcrawl;
  const g = app.game;
  g.player.hp = 1;
  const m = g.floor.monsters.find((x) => !x.boss);
  m.x = g.player.x + 1;
  m.y = g.player.y;
  m.awake = true;
  m.damage = 99;
  for (let i = 0; i < 20 && g.outcome === "playing"; i++) app.step({ type: "wait" });
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/6-death.png` });

await page.goto(`${base}#/play/itsdangerous?run=5`);
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const app = window.headcrawl;
  const g = app.game;
  // Skip to the end: pretend the last boss just fell.
  g.player.kills = 41;
  g.player.bosses = g.spec.floors.length;
  g.player.level = 6;
  g.player.turns = 812;
  g.outcome = "won";
  app.step({ type: "wait" });
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/7-victory.png` });

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await phone.goto(base);
await phone.waitForTimeout(1200);
await phone.screenshot({ path: `${out}/8-phone-title.png` });
await phone.goto(`${base}#/play/requests`);
await phone.waitForTimeout(1500);
await phone.screenshot({ path: `${out}/9-phone-game.png` });

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
