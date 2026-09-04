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
  await page.locator('[data-track="courtyard"]').click();
  await page.getByRole("button", { name: "THE SCHOOL" }).click();
  await page.getByRole("button", { name: "TAKE A FREE DRIVE" }).click();
  // Real keyboard inputs only. Keep input timing in animation frames so slow
  // screenshot transport cannot accidentally extend a drift into a collision.
  await page.evaluate(() => {
    const held = new Set();
    function key(code, down) {
      if (held.has(code) === down) return;
      down ? held.add(code) : held.delete(code);
      window.dispatchEvent(
        new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }),
      );
    }
    let phase = "accelerate";
    key("KeyW", true);
    key("ShiftLeft", true);
    function drive() {
      const game = window.__OVERDRIVE__;
      if (phase === "accelerate" && game.player.speed >= 17) {
        key("ShiftLeft", false);
        key("KeyD", true);
        key("Space", true);
        phase = "drift";
      }
      if (phase === "drift" && game.player.driftCharge >= 0.5) {
        key("Space", false);
        key("KeyD", false);
        phase = "release";
      }
      if (game.driftReleases > 0) return;
      requestAnimationFrame(drive);
    }
    requestAnimationFrame(drive);
  });
  await page.waitForFunction(
    () =>
      window.__OVERDRIVE__.driftReleases > 0 &&
      document
        .querySelector("#drift-label")
        .textContent.includes("CASTER KICK"),
    {},
    { timeout: 30000 },
  );
  const result = await page.evaluate(() => ({
    game: window.__OVERDRIVE__,
    label: document.querySelector("#drift-label").textContent,
  }));
  assert.equal(result.game.driftReleases, 1);
  assert.ok(result.game.player.driftTurbo > 0);
  assert.equal(result.game.player.driftCharge, 0);
  assert.ok(result.label.includes("CASTER KICK"));
  await page.screenshot({ path: "/tmp/overdrive-drift-kick.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: keyboard-driven drift charge, release, mini-turbo and CASTER KICK HUD.",
    result,
  );
} finally {
  await browser.close();
}
