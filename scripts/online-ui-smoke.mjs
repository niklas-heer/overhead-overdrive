// Adversarial UI fixtures complement the real API integration test.
// These fixtures do not claim any public score was submitted or stored.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const hostileName = "<img src=x>";
  await page.route("**/api/online*", async (route) => {
    const req = route.request(),
      data =
        req.method() === "GET"
          ? Object.fromEntries(new URL(req.url()).searchParams)
          : req.postDataJSON();
    let body = {};
    if (data.action === "records")
      body = {
        records: [
          {
            id: "fake-record",
            name: hostileName,
            time: 50,
            track: "atrium",
            setup: 0,
            createdAt: Date.now(),
            ghostId: "fake-ghost",
          },
        ],
        version: "school-records-v1",
      };
    else if (data.action === "session")
      body = {
        player: { id: "fixture-player", name: data.name },
        csrf: "fixture-csrf",
      };
    else if (data.action === "create")
      body = {
        room: {
          code: "fixture-room",
          hostId: "fixture-player",
          track: "atrium",
          setup: 0,
          status: "lobby",
          players: [
            {
              id: "fixture-player",
              name: hostileName,
              color: "#ff663f",
              rider: 0,
            },
          ],
          race: null,
          startAt: 0,
          serverNow: Date.now(),
          sequence: 0,
        },
      };
    else if (data.action === "leave") body = { room: null };
    else {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "The school office is resting. Offline racing is still ready.",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.getByRole("button", { name: "THE CLUB", exact: true }).click();
  await page
    .locator("#online-records")
    .filter({ hasText: hostileName })
    .waitFor();
  assert.equal(
    await page.locator("#online-records img").count(),
    0,
    "record nickname rendered as text",
  );
  await page.locator("#online-name").fill(hostileName);
  await page.getByRole("button", { name: "OPEN THE CLUB" }).click();
  await page
    .locator("#online-players")
    .filter({ hasText: hostileName })
    .waitFor();
  assert.equal(
    await page.locator("#online-players img").count(),
    0,
    "room nickname rendered as text",
  );
  assert.ok(
    await page.locator("#online-create").isDisabled(),
    "cannot accidentally create multiple rooms",
  );
  await page.getByRole("button", { name: "LEAVE CLUB" }).click();
  await page.getByRole("button", { name: "SET A SCHOOL RECORD" }).click();
  await page
    .locator("#online-status")
    .filter({ hasText: "office is resting" })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "BACK TO THE PLAYGROUND" }).click();
  await page.getByRole("button", { name: "LET’S ROLL" }).click();
  await page.waitForFunction(() => window.__OVERDRIVE__.mode === "race", null, {
    timeout: 30000,
  });
  assert.equal((await page.evaluate(() => window.__OVERDRIVE__)).online, null);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: adversarial leaderboard/lobby nicknames remain inert text, duplicate-room controls disabled, online outage gracefully preserves mobile offline play.",
  );
} finally {
  await browser.close();
}
