import { expect, test } from "@playwright/test";

async function turn(page: import("@playwright/test").Page): Promise<number> {
  const text = (await page.locator("#hud").textContent()) ?? "";
  return Number(text.match(/turn (\d+)/)?.[1] ?? -1);
}

test("a run survives a reload and can be started over", async ({ page }) => {
  await page.goto("./#/play/requests?run=5");
  await expect(page.locator("#hud")).toContainText("turn 0");
  await page.keyboard.press("x");
  await expect.poll(() => turn(page), { timeout: 10_000 }).toBeGreaterThan(5);
  await page.keyboard.press(".");
  await page.keyboard.press(".");
  const before = await turn(page);
  // Save happens on pagehide too, but give the debounce a moment.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator("#log")).toContainText("Picked up where you left off");
  expect(await turn(page)).toBe(before);

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "continue" })).toBeVisible();
  await expect(page.locator(".saves")).toContainText("psf/requests");

  await page.goto("./#/play/requests?run=5");
  await expect(page.locator("#log")).toContainText("Picked up where you left off");
  await page.keyboard.press("Escape");
  await page.keyboard.press("n");
  await expect(page).not.toHaveURL(/run=5$/);
  await expect(page.locator("#hud")).toContainText("turn 0");
});

test("a replay link plays the run back", async ({ page }) => {
  await page.goto("./#/play/itsdangerous?run=2");
  await expect(page.locator("#hud")).toContainText("turn 0");
  for (const key of ["l", "l", ".", "j", ".", "."]) await page.keyboard.press(key);
  await expect.poll(() => turn(page), { timeout: 10_000 }).toBeGreaterThan(3);
  await page.waitForTimeout(600);
  const target = await turn(page);
  // Build the replay link the same way the end screen does, from the saved log.
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem("headcrawl.saves.v1") ?? "[]")[0]);
  const { encodeSpec } = await import("../src/ui/share");
  const link = `./${save.hash}&watch=${encodeSpec(save.log)}`.replace("#/play/itsdangerous&", "#/play/itsdangerous?");
  await page.goto(link);
  await expect(page.locator("#log")).toContainText("Watching a recorded run");
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await expect.poll(() => turn(page), { timeout: 15_000 }).toBe(target);
});
