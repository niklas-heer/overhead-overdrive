import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.getByRole("button", { name: "THE GARAGE", exact: true }).click();
  await page.locator('[data-setup="1"]').click();
  await page.getByRole("button", { name: "BACK TO THE GRID" }).click();
  await page.getByRole("button", { name: "LET’S ROLL" }).click();
  // Drive the public keyboard controls using read-only telemetry. No game-state mutation.
  await page.evaluate(() => {
    const held = new Set();
    function control(code, down) {
      if (down === held.has(code)) return;
      down ? held.add(code) : held.delete(code);
      window.dispatchEvent(
        new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }),
      );
    }
    function pilot() {
      const g = window.__OVERDRIVE__;
      if (g.mode === "finish") {
        for (const key of [...held]) control(key, false);
        return;
      }
      if (g.mode === "race") {
        control("KeyE", !!g.item);
        const s = g.player,
          target = g.target;
        const desired = Math.atan2(target[0] - s.x, target[2] - s.z);
        const error =
          ((((desired - s.yaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
            (Math.PI * 2)) -
          Math.PI;
        const targetSpeed = Math.max(5.5, 11 / (1 + Math.abs(error) * 1.4));
        control("KeyD", error < -0.07);
        control("KeyA", error > 0.07);
        control("KeyW", s.speed < targetSpeed);
        control("KeyS", s.speed > targetSpeed + 1);
      }
      requestAnimationFrame(pilot);
    }
    requestAnimationFrame(pilot);
  });
  await page.waitForFunction(
    () => window.__OVERDRIVE__.mode === "finish",
    {},
    { timeout: 240000 },
  );
  const result = await page.evaluate(() => ({
    game: window.__OVERDRIVE__,
    best: localStorage.getItem("overdrive-v2-best-atrium-1"),
  }));
  assert.equal(result.game.laps, 3);
  assert.ok(Number(result.best) > 0);
  assert.ok(await page.locator("#results").innerText());
  await page.screenshot({ path: "/tmp/overdrive-finish.png" });
  await page.getByRole("button", { name: "ONE MORE RACE" }).click();
  assert.equal((await page.evaluate(() => window.__OVERDRIVE__)).laps, 0);
  assert.equal((await page.evaluate(() => window.__OVERDRIVE__)).time, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual keyboard-driven three-lap race, finish screen, personal record, restart.",
    result,
  );
} finally {
  await browser.close();
}
