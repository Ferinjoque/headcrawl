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
  await expect(page.locator("#banner")).toContainText("floor 1 of");
  expect(errors).toEqual([]);
});

test("moving and exploring advance turns", async ({ page }) => {
  await page.goto("./#/play/requests");
  await expect(page.locator("#hud")).toHaveAttribute("data-turn", "0");
  await page.keyboard.press("x");
  await expect(page.locator("#hud")).not.toHaveAttribute("data-turn", "0", { timeout: 5000 });
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
  await expect(page).toHaveTitle(/pallets\/itsdangerous/);
  const link = page.url();
  await page.goto("about:blank");
  await page.goto(link);
  await expect(page).toHaveTitle(/pallets\/itsdangerous/);
});

test("a link from someone else's copy works in the code box", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./");
  await expect(page.getByRole("listbox", { name: "Repos" })).toBeVisible();
  await page.keyboard.press("c");
  const box = page.getByRole("textbox", { name: "Run code or link" });
  await box.fill("http://192.168.1.20:5173/#/play/itsdangerous?run=77");
  await box.press("Enter");
  await expect(page).toHaveURL(/#\/play\/itsdangerous\?run=77$/);
  await expect(page.locator("#hud")).toContainText("floor 1/");
  expect(errors).toEqual([]);
});

test("the character sheet opens from c and from the HUD", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./#/play/requests");
  await expect(page.locator("#hud")).toHaveAttribute("data-turn", "0");
  await page.keyboard.press("c");
  await expect(page.getByRole("heading", { name: "@ level 1" })).toBeVisible();
  await expect(page.getByText("bare hands")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "@ level 1" })).toBeHidden();
  await page.locator(".hud-stats").click();
  await expect(page.getByRole("heading", { name: "@ level 1" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the lab opens with its tools and spawns what you ask for", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./#/lab");
  await expect(page.locator("#hud")).toContainText("lab");
  await expect(page.getByRole("button", { name: "tangle" })).toBeVisible();
  await page.getByRole("button", { name: "tangle" }).click();
  await expect(page.locator("#panel")).toContainText("route_request");
  await page.keyboard.press("`");
  await expect(page.getByRole("button", { name: "tangle" })).toBeHidden();
  expect(errors).toEqual([]);
});
