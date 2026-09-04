import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.getByRole("button", { name: "THE SCHOOL" }).click();
  await page.getByRole("button", { name: "TAKE A FREE DRIVE" }).click();
  await page.keyboard.down("w");
  await page.waitForFunction(
    () => window.__OVERDRIVE__.item === "laser",
    {},
    { timeout: 30000 },
  );
  await page.keyboard.up("w");
  assert.equal((await page.evaluate(() => window.__OVERDRIVE__)).charges, 3);
  await page.keyboard.down("e");
  await page.waitForFunction(
    () => window.__OVERDRIVE__.charges < 3,
    {},
    { timeout: 10000 },
  );
  await page.keyboard.up("e");
  await page.screenshot({ path: "/tmp/overdrive-items.png" });
  assert.ok((await page.locator("#item-name").innerText()).includes("LASER"));
  await page.getByRole("button", { name: "Toggle race sound" }).click();
  assert.equal(await page.locator("#race-sound").innerText(), "SOUND ON");
  await page.getByRole("button", { name: "Toggle race sound" }).click();
  await page.keyboard.press("Escape");
  const before = await page.evaluate(() => window.__OVERDRIVE__);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__OVERDRIVE__);
  assert.equal(before.time, after.time);
  assert.deepEqual(before.pickups, after.pickups);
  await page.getByRole("button", { name: "RESTART FREE DRIVE" }).click();
  assert.equal((await page.evaluate(() => window.__OVERDRIVE__)).item, null);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: physical pickup, three-shot laser, E firing, item HUD, race sound toggle, paused item clocks, clean restart.",
  );
} finally {
  await browser.close();
}
