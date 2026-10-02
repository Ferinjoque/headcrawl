import { expect, test, type Page } from "@playwright/test";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

test("title lists the gallery and starts a run", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./");
  await expect(page.getByRole("listbox", { name: "Repos" })).toBeVisible();
  await expect(page.getByRole("option").first()).toContainText("itsdangerous");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/play\/itsdangerous/);
  await expect(page.locator("#hud")).toContainText("floor 1/");
  await expect(page.locator("#log")).toContainText("Floor 1 of");
  expect(errors).toEqual([]);
});

test("moving and exploring advance turns", async ({ page }) => {
  await page.goto("./#/play/requests");
  await expect(page.locator("#hud")).toContainText("turn 0");
  await page.keyboard.press("x");
  await expect(page.locator("#hud")).not.toContainText("turn 0 ", { timeout: 5000 });
  await page.keyboard.press("?");
  await expect(page.getByRole("heading", { name: "how it works" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "how it works" })).toBeHidden();
});

test("bad links fall back to the title with a message", async ({ page }) => {
  await page.goto("./#/play/does-not-exist");
  await expect(page.getByRole("alert")).toContainText("No dungeon called");
  await page.goto("./#/x/0/AAAA");
  await expect(page.getByRole("alert")).toContainText("broken");
});

test("a dungeon file can be opened and shared", async ({ page }) => {
  await page.goto("./");
  const res = await page.request.get("./dungeons/itsdangerous.json");
  const body = await res.text();
  await page.locator("#file").setInputFiles({ name: "mine.json", mimeType: "application/json", buffer: Buffer.from(body) });
  await expect(page).toHaveURL(/#\/x\/0\/[A-Za-z0-9_-]+$/);
  await expect(page.locator("#hud")).toContainText("pallets/itsdangerous");
  const link = page.url();
  await page.goto("about:blank");
  await page.goto(link);
  await expect(page.locator("#hud")).toContainText("pallets/itsdangerous");
});
