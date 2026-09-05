// Requires a real saved school record (created by online-live-smoke.mjs).
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = process.env.GAME_URL || "http://localhost:5173";
  const response = await page.request.get(
    base + "/api/online?action=records&track=atrium&setup=1&period=week",
  );
  const record = (await response.json()).records[0];
  assert.ok(record?.ghostId, "seed one real record first");
  await page.goto(base);
  await page.goto(base + "/#ghost=" + record.ghostId);
  await page
    .locator("#online-ghost-note")
    .filter({ hasText: "Challenge from " + record.name })
    .waitFor();
  await page.reload();
  await page
    .locator("#online-ghost-note")
    .filter({ hasText: "Challenge from " + record.name })
    .waitFor();
  await page.screenshot({ path: "/tmp/overdrive-live-ghost-invite.png" });
  await page.getByRole("button", { name: "RACE THIS GHOST" }).click();
  await page.waitForFunction(
    () =>
      window.__OVERDRIVE__.online === "trial" &&
      window.__OVERDRIVE__.mode === "race",
  );
  await page.keyboard.down("w");
  await page.waitForFunction(() => window.__OVERDRIVE__.player.speed > 3);
  await page.keyboard.up("w");
  await page.screenshot({ path: "/tmp/overdrive-live-ghost-race.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "BACK TO SCHOOL SELECTION" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "THE CLUB", exact: true }).click();
  await page.screenshot({ path: "/tmp/overdrive-live-club-mobile.png" });
  await page.goto(base + "/#room=0123456789abcdef01234567");
  await page.locator("#online-code").waitFor();
  assert.equal(
    await page.locator("#online-code").inputValue(),
    "0123456789abcdef01234567",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real stored ghost invitation on same-page hash navigation and full reload, ghost race launches/moves, mobile club, private room invite prefill; no browser errors.",
  );
} finally {
  await browser.close();
}
