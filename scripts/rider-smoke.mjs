import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  const state = () => page.evaluate(() => window.__OVERDRIVE__);
  assert.equal((await state()).ridersEnabled, true);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/rider-menu.png" });
  await page.getByRole("button", { name: "THE GARAGE", exact: true }).click();
  const names = ["The Doodler", "Lab Partner", "Lunch Break", "Night Shift"];
  for (let index = 0; index < names.length; index++) {
    const card = page.getByRole("button", {
      name: `Ride as ${names[index]}`,
      exact: true,
    });
    await card.click();
    assert.equal(await card.getAttribute("aria-pressed"), "true");
    const game = await state();
    assert.equal(game.riderIndex, index);
    assert.equal(game.riderName, names[index]);
    assert.equal(game.ridersEnabled, true);
  }
  await page.screenshot({ path: "/tmp/rider-garage.png" });
  await page.getByRole("button", { name: "CLASSIC", exact: true }).click();
  assert.equal((await state()).ridersEnabled, false);
  assert.equal((await state()).riderIndex, 3);
  assert.equal(
    await page.locator("#classic-mode").getAttribute("aria-pressed"),
    "true",
  );
  await page.reload();
  assert.equal((await state()).ridersEnabled, false);
  assert.equal((await state()).riderIndex, 3);
  await page.getByRole("button", { name: "THE GARAGE", exact: true }).click();
  await page.getByRole("button", { name: "RIDE ALONG", exact: true }).click();
  assert.equal((await state()).ridersEnabled, true);
  assert.equal((await state()).riderName, "Night Shift");
  await page.locator('[data-color="#5b9c94"]').click();
  assert.equal(
    await page.locator('[data-color="#5b9c94"]').getAttribute("class"),
    "paint chosen",
  );
  assert.equal((await state()).riderIndex, 3);
  await page.getByRole("button", { name: "BACK TO THE GRID" }).click();
  await page.getByRole("button", { name: "THE SCHOOL" }).click();
  await page.getByRole("button", { name: "TAKE A FREE DRIVE" }).click();
  await page.keyboard.down("w");
  await page.waitForFunction(
    () => window.__OVERDRIVE__.item === "laser",
    {},
    { timeout: 30000 },
  );
  await page.keyboard.up("w");
  assert.equal((await state()).charges, 3);
  assert.equal((await state()).riderIndex, 3);
  await page.screenshot({ path: "/tmp/rider-race.png" });
  await page.keyboard.press("e");
  await page.waitForFunction(() => window.__OVERDRIVE__.charges < 3);
  await page.screenshot({ path: "/tmp/rider-laser.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "RESTART FREE DRIVE" }).click();
  const restarted = await state();
  assert.equal(restarted.riderIndex, 3);
  assert.equal(restarted.item, null);
  assert.ok(
    restarted.time < 1,
    "Free drive clock restarts and immediately resumes",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "BACK TO SCHOOL SELECTION" }).click();
  await page.locator('[data-track="courtyard"]').click();
  assert.equal((await state()).riderIndex, 3);
  assert.equal((await state()).ridersEnabled, true);
  await page.reload();
  assert.equal((await state()).riderIndex, 3);
  assert.equal((await state()).ridersEnabled, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "THE GARAGE", exact: true }).click();
  await page.locator(".crew-picker").scrollIntoViewIfNeeded();
  const cards = await page.locator(".rider-card").evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  assert.equal(cards.length, 4);
  assert.ok(
    Math.abs(cards[0].y - cards[1].y) < 2,
    "First two cards form a row",
  );
  assert.ok(
    cards[2].y > cards[0].y + cards[0].height,
    "Second row has breathing room",
  );
  for (const card of cards) {
    assert.ok(card.width >= 150);
    assert.ok(card.x >= 0 && card.x + card.width <= 390);
  }
  await page.screenshot({ path: "/tmp/rider-garage-mobile.png" });
  await page
    .getByRole("button", { name: "Ride as Lunch Break", exact: true })
    .click();
  assert.equal((await state()).riderIndex, 2);
  await page.getByRole("button", { name: "BACK TO THE GRID" }).click();
  assert.ok(await page.getByRole("button", { name: "LET’S ROLL" }).isVisible());
  assert.deepEqual(errors, []);
  console.log(
    "PASS: four riders, classic/ride selection, persistence across reload/track/restart, paint then physical laser pickup/fire, desktop chase, 2×2 mobile cards and reachable garage exit.",
  );
} finally {
  await browser.close();
}
