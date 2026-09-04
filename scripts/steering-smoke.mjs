import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.getByRole("button", { name: "THE SCHOOL" }).click();
  await page.getByRole("button", { name: "TAKE A FREE DRIVE" }).click();
  for (const [key, side] of [
    ["d", 1],
    ["a", -1],
    ["ArrowRight", 1],
    ["ArrowLeft", -1],
  ]) {
    await page.keyboard.press("r");
    await page.keyboard.down("w");
    await page.waitForFunction(
      () => window.__OVERDRIVE__.player.speed > 4,
      {},
      { timeout: 20000 },
    );
    const before = await page.evaluate(() => window.__OVERDRIVE__.player);
    await page.keyboard.down(key);
    await page.waitForFunction(
      ({ yaw }) => Math.abs(window.__OVERDRIVE__.player.yaw - yaw) > 0.15,
      { yaw: before.yaw },
      { timeout: 20000 },
    );
    await page.keyboard.up(key);
    await page.keyboard.up("w");
    const after = await page.evaluate(() => window.__OVERDRIVE__.player);
    const rightDisplacement =
      (after.x - before.x) * -Math.cos(before.yaw) +
      (after.z - before.z) * Math.sin(before.yaw);
    assert.ok(
      rightDisplacement * side > 0,
      `${key} must move toward the driver's ${side === 1 ? "right" : "left"}`,
    );
    console.log(`PASS ${key}: correct driver-relative steering`);
  }
} finally {
  await browser.close();
}
