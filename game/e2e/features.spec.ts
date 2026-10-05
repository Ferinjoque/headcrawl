import { devices, expect, test } from "@playwright/test";

test("a hard run code plays on hard", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("listbox", { name: "Repos" })).toBeVisible();
  await page.keyboard.press("c");
  await page.getByRole("textbox", { name: "Run code or link" }).fill("itsdangerous-12-hard");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/run=12&level=hard/);
  await expect(page.locator("#hud")).toHaveAttribute("data-turn", "0");
  await page.keyboard.press("Escape");
  await expect(page.getByText("itsdangerous-12-hard")).toBeVisible();
});

// A phone viewport with touch, minus the browser choice (that needs its own worker).
const { defaultBrowserType: _browser, ...phone } = devices["Pixel 7"];

test.describe("on a phone", () => {
  test.use(phone);
  test("the pad opens the pause menu", async ({ page }) => {
    await page.goto("./#/play/requests?run=3");
    await expect(page.locator("#touch")).toBeVisible();
    await page.locator('#touch button[aria-label="menu"]').tap();
    await expect(page.getByRole("heading", { name: "paused" })).toBeVisible();
  });
});

test.describe("first visit", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the welcome card shows once and enter closes it", async ({ page }) => {
    await page.goto("./#/play/itsdangerous?run=7");
    await expect(page.locator("#screen")).toContainText("welcome down");
    await page.keyboard.press("Enter");
    await expect(page.locator("#screen")).toBeHidden();
    await page.reload();
    await expect(page.locator("#hud")).toContainText("floor 1/");
    await expect(page.locator("#screen")).toBeHidden();
  });
});

test("a gamepad explores with X and opens help with Back", async ({ page }) => {
  // A fake pad: whatever button window.__pad names is held down.
  await page.addInitScript(() => {
    const w = window as unknown as { __pad: number };
    w.__pad = -1;
    navigator.getGamepads = () =>
      [{ connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === w.__pad, touched: false, value: 0 })) }] as unknown as (Gamepad | null)[];
  });
  const hold = async (button: number) => {
    await page.evaluate((b) => ((window as unknown as { __pad: number }).__pad = b), button);
    await page.waitForTimeout(80);
    await page.evaluate(() => ((window as unknown as { __pad: number }).__pad = -1));
  };
  await page.goto("./#/play/requests?run=3");
  await expect(page.locator("#log")).toContainText("Gamepad found");
  await hold(2);
  await expect(page.locator("#hud")).not.toHaveAttribute("data-turn", "0", { timeout: 5000 });
  await hold(8);
  await expect(page.getByRole("heading", { name: "how it works" })).toBeVisible();
  await hold(1);
  await expect(page.getByRole("heading", { name: "how it works" })).toBeHidden();
});
