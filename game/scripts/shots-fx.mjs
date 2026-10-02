// Screenshot of a boss winding up its area attack, and a kill burst.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5179/";
const out = process.argv[3] ?? "shots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}#/play/jq`);
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const app = window.headcrawl;
  const g = app.game;
  const boss = g.floor.monsters.find((m) => m.boss);
  const grid = g.floor.map.grid;
  // Stand two cells from the boss on open floor.
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [-2, 1]]) {
    if (grid.get(boss.x + dx, boss.y + dy) === 2) {
      g.player.x = boss.x + dx;
      g.player.y = boss.y + dy;
      break;
    }
  }
  g.player.maxHp = 500;
  g.player.hp = 500;
  boss.awake = true;
  boss.speed = 100;
  boss.turns = 3;
  app.step({ type: "wait" });
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/10-telegraph.png` });

await page.evaluate(() => {
  const app = window.headcrawl;
  const g = app.game;
  const m = g.floor.monsters.find((x) => !x.boss && g.isVisible(x.x, x.y)) ?? g.floor.monsters.find((x) => !x.boss);
  m.hp = 1;
  m.x = g.player.x + 1;
  m.y = g.player.y;
  g.player.atk = 50;
  app.step({ type: "move", dx: 1, dy: 0 });
});
await page.waitForTimeout(180);
await page.screenshot({ path: `${out}/11-burst.png` });

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
