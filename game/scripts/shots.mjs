// Takes screenshots of the main screens for eyeballing changes.
// Usage: node scripts/shots.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5179/";
const out = process.argv[3] ?? "shots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(base);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/1-title.png` });

await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/2-start.png` });

await page.keyboard.press("x");
await page.waitForTimeout(2500);
for (let i = 0; i < 12; i++) {
  await page.keyboard.press("x");
  await page.waitForTimeout(400);
  for (let j = 0; j < 4; j++) await page.keyboard.press(["l", "j", "h", "k"][(i + j) % 4]);
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/3-explore.png` });

await page.keyboard.press("?");
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/4-help.png` });
await page.keyboard.press("Escape");

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/5-phone.png` });

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
