// Exercises the actual API through two independent browser sessions.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const base = process.env.GAME_URL || "http://localhost:5173";
try {
  const host = await browser.newPage({
      viewport: { width: 1000, height: 800 },
    }),
    guest = await browser.newPage({ viewport: { width: 1000, height: 800 } }),
    errors = [];
  for (const page of [host, guest]) {
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole("button", { name: "THE CLUB", exact: true }).click();
  }
  await host.locator("#online-name").fill("QA Host");
  await guest.locator("#online-name").fill("QA Guest");
  await host.getByRole("button", { name: "OPEN THE CLUB" }).click();
  await host.locator("#online-room:not(.hidden)").waitFor();
  const code = await host.evaluate(() => window.__OVERDRIVE__.roomCode);
  assert.match(code, /^[a-f0-9]{24}$/);
  await guest.locator("#online-code").fill(code);
  await guest.getByRole("button", { name: "JOIN", exact: true }).click();
  await guest
    .locator("#online-players")
    .filter({ hasText: "QA Host" })
    .waitFor();
  await host
    .locator("#online-players")
    .filter({ hasText: "QA Guest" })
    .waitFor();
  await host.screenshot({ path: "/tmp/overdrive-live-club.png" });
  await host.getByRole("button", { name: "RING THE START BELL" }).click();
  for (const page of [host, guest])
    await page.waitForFunction(
      () =>
        window.__OVERDRIVE__.online === "room" &&
        window.__OVERDRIVE__.mode === "race",
      null,
      { timeout: 30000 },
    );
  await host.keyboard.down("w");
  await guest.keyboard.down("w");
  await host.waitForFunction(() => window.__OVERDRIVE__.player.speed > 4);
  await guest.waitForFunction(() => window.__OVERDRIVE__.player.speed > 4);
  await host.keyboard.up("w");
  await guest.keyboard.up("w");
  await host.keyboard.press("r");
  await host.waitForTimeout(400);
  await host.waitForFunction(
    () => window.__OVERDRIVE__.onlinePenaltyTicks === 240,
  );
  assert.equal(
    (await host.evaluate(() => window.__OVERDRIVE__)).onlinePenaltyTicks,
    240,
    "server handles recovery penalty",
  );
  await host.keyboard.press("Escape");
  const before = await host.evaluate(() => window.__OVERDRIVE__.time);
  await host.waitForFunction(
    (before) => window.__OVERDRIVE__.time > before + 0.2,
    before,
    { timeout: 15000 },
  );
  assert.ok(
    (await host.evaluate(() => window.__OVERDRIVE__)).time > before,
    "private race continues while host pauses",
  );
  await host.getByRole("button", { name: "BACK TO SCHOOL SELECTION" }).click();
  await guest.keyboard.press("Escape");
  await guest.getByRole("button", { name: "BACK TO SCHOOL SELECTION" }).click();
  await guest.close();
  if (process.env.ROOM_ONLY) {
    assert.deepEqual(errors, []);
    console.log(
      "PASS: actual API room flow including short-keypress recovery latch and server penalty.",
    );
    await browser.close();
    process.exit(0);
  }
  await host.getByRole("button", { name: "THE CLUB", exact: true }).click();
  await host.locator("#online-setup").selectOption("1");
  let lostReceipt = null;
  await host.route("**/api/online", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "submit" &&
      !lostReceipt
    ) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      lostReceipt = await response.json();
      await route.abort("failed");
    } else await route.continue();
  });
  await host.getByRole("button", { name: "SET A SCHOOL RECORD" }).click();
  await host.waitForFunction(
    () =>
      window.__OVERDRIVE__.online === "trial" &&
      window.__OVERDRIVE__.mode === "race",
  );
  await host.evaluate(() => {
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
        for (const key of held) control(key, false);
        return;
      }
      if (g.mode === "race") {
        const s = g.player,
          t = g.target,
          d = Math.atan2(t[0] - s.x, t[2] - s.z),
          e = Math.atan2(Math.sin(d - s.yaw), Math.cos(d - s.yaw)),
          v = Math.max(5.5, 11 / (1 + Math.abs(e) * 1.4));
        control("KeyD", e < -0.07);
        control("KeyA", e > 0.07);
        control("KeyW", s.speed < v);
        control("KeyS", s.speed > v + 1);
      }
      requestAnimationFrame(pilot);
    }
    requestAnimationFrame(pilot);
  });
  await host.waitForFunction(
    () => window.__OVERDRIVE__.mode === "finish",
    null,
    { timeout: 240000 },
  );
  await host.getByRole("button", { name: "RETRY SAVE" }).click();
  assert.ok(
    lostReceipt?.ghostId,
    "first submission reached real server before response was dropped",
  );
  await host
    .locator("#overlay-copy")
    .filter({ hasText: "Verified and saved" })
    .waitFor({ timeout: 30000 });
  assert.equal(
    await host.evaluate(() =>
      localStorage.getItem("overdrive-v3-best-atrium-1"),
    ),
    null,
  );
  await host.screenshot({ path: "/tmp/overdrive-live-online-finish.png" });
  await host.getByRole("button", { name: "BACK TO SCHOOL SELECTION" }).click();
  await host.getByRole("button", { name: "THE CLUB", exact: true }).click();
  await host
    .locator("#online-records")
    .filter({ hasText: "QA Host" })
    .waitFor();
  const response = await host.request.get(
    base + "/api/online?action=records&track=atrium&setup=1&period=week",
  );
  const board = await response.json();
  const ghostId = board.records.find((r) => r.name === "QA Host").ghostId;
  await host.goto(base + "/#ghost=" + ghostId);
  await host
    .locator("#online-ghost-note")
    .filter({ hasText: "Challenge from QA Host" })
    .waitFor();
  await host.getByRole("button", { name: "RACE THIS GHOST" }).click();
  await host.waitForFunction(() => window.__OVERDRIVE__.online === "trial");
  await host.keyboard.press("Escape");
  await host.getByRole("button", { name: "BACK TO SCHOOL SELECTION" }).click();
  await host.setViewportSize({ width: 390, height: 844 });
  await host.getByRole("button", { name: "THE CLUB", exact: true }).click();
  await host.screenshot({ path: "/tmp/overdrive-live-club-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real API two-browser lobby/create/join/start, authoritative movement/recovery/pause/leave; keyboard-driven3laps verified and persisted, ghost launch, offline record isolation, mobile club.",
  );
} finally {
  await browser.close();
}
