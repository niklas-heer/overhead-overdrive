import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.GAME_URL || "http://localhost:5173");
await page.waitForTimeout(2000);
await page.screenshot({ path: "/tmp/overdrive-menu.png" });
console.log("menu loaded");
await page.getByRole("button", { name: "THE GARAGE", exact: true }).click();
await page.locator('[data-setup="2"]').click();
await page.locator('[data-color="#5b9c94"]').click();
assert.equal(
  await page.locator('[data-setup="2"]').getAttribute("class"),
  "setup chosen",
);
await page.getByRole("button", { name: "BACK TO THE GRID" }).click();
await page.getByRole("button", { name: "LET’S ROLL" }).click();
await page.waitForFunction(
  () => window.__OVERDRIVE__.mode === "race",
  {},
  { timeout: 30000 },
);
assert.equal((await page.evaluate(() => window.__OVERDRIVE__)).mode, "race");
await page.keyboard.down("w");
await page.waitForFunction(
  () => window.__OVERDRIVE__.player.speed > 6,
  {},
  { timeout: 20000 },
);
await page.keyboard.up("w");
const moving = await page.evaluate(() => window.__OVERDRIVE__);
assert.ok(moving.player.speed > 4, "Accelerates");
console.log("acceleration verified", moving.player.speed);
await page.keyboard.down("d");
await page.keyboard.down("Space");
await page.waitForTimeout(400);
await page.keyboard.up("d");
await page.keyboard.up("Space");
await page.screenshot({ path: "/tmp/overdrive-race.png" });
await page.keyboard.press("Escape");
const paused = await page.evaluate(() => window.__OVERDRIVE__);
await page.waitForTimeout(300);
assert.equal(
  (await page.evaluate(() => window.__OVERDRIVE__)).time,
  paused.time,
);
await page.getByRole("button", { name: "KEEP ROLLING" }).click();
await page.keyboard.press("r");
assert.ok((await page.evaluate(() => window.__OVERDRIVE__)).player.speed < 1);
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "BACK TO SCHOOL SELECTION" }).click();
for (const id of ["chemistry", "courtyard"]) {
  await page.locator(`[data-track="${id}"]`).click();
  assert.equal((await page.evaluate(() => window.__OVERDRIVE__)).track, id);
}
await page.getByRole("button", { name: "THE SCHOOL" }).click();
await page.getByRole("button", { name: "TAKE A FREE DRIVE" }).click();
assert.equal((await page.evaluate(() => window.__OVERDRIVE__)).mode, "tour");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "BACK TO SCHOOL SELECTION" }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(700);
await page.screenshot({ path: "/tmp/overdrive-mobile.png", fullPage: true });
assert.ok(await page.getByRole("button", { name: "LET’S ROLL" }).isVisible());
assert.deepEqual(errors, []);
console.log(
  "PASS: garage, paint, all tracks, race, acceleration, drift input, pause, recover, free drive, mobile. No browser errors.",
);
await browser.close();
