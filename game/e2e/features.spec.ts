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
