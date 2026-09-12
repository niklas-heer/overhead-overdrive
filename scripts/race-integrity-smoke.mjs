import { webkit } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await webkit.launch();
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await page.waitForFunction(() => window.__OVERDRIVE__);
  // Advance browser time and real animation callbacks; never edit simulation state.
  await page.clock.install();
  for (const track of ["atrium", "chemistry", "courtyard"]) {
    await page.locator(`[data-track="${track}"]`).click();
    await page.locator("#start").click();
    await page.evaluate(() => {
      window.raceAudit = {
        distances: [0, 0, 0],
        violations: [],
        previous: null,
      };
      function audit() {
        const g = window.__OVERDRIVE__,
          log = window.raceAudit;
        if (g.mode === "menu") return;
        if (log.previous && g.mode === "race")
          g.rivals.forEach((r, i) => {
            const old = log.previous.rivals[i];
            if (
              r.gatesPassed < old.gatesPassed ||
              r.gatesPassed - old.gatesPassed > 1
            )
              log.violations.push("skipped gate");
            if (r.laps !== Math.floor(r.gatesPassed / g.gateCount))
              log.violations.push("unearned lap");
            if (r.finished && r.gatesPassed !== g.gateCount * 3)
              log.violations.push("unearned finish");
            if (r.recoveries === old.recoveries)
              log.distances[i] += Math.hypot(
                r.state.x - old.state.x,
                r.state.z - old.state.z,
              );
            else if (r.gatesPassed !== old.gatesPassed)
              log.violations.push("recovery granted progress");
            if (
              old.finished &&
              (old.gatesPassed !== r.gatesPassed ||
                old.finishTime !== r.finishTime)
            )
              log.violations.push("finish changed");
          });
        log.previous = g;
        requestAnimationFrame(audit);
      }
      requestAnimationFrame(audit);
    });
    for (let batch = 0; batch < 36; batch++) {
      await page.clock.runFor(5000);
      const g = await page.evaluate(() => window.__OVERDRIVE__);
      if (g.rivals.every((r) => r.finished)) break;
    }
    const { game, audit } = await page.evaluate(() => ({
      game: window.__OVERDRIVE__,
      audit: window.raceAudit,
    }));
    assert.equal(game.laps, 0, "Idle player cannot earn laps");
    assert.deepEqual(audit.violations, []);
    for (const [i, r] of game.rivals.entries()) {
      assert.equal(r.laps, 3, `${track}: ${r.name} completes all laps`);
      assert.equal(r.gatesPassed, game.gateCount * 3);
      assert.equal(r.lapTimes.length, 3);
      assert.ok(
        Math.abs(r.lapTimes.reduce((a, b) => a + b, 0) - r.finishTime) < 0.001,
      );
      assert.ok(
        audit.distances[i] > game.trackLength * 2.7,
        `${track}: real travelled distance`,
      );
      assert.equal(
        r.visible,
        false,
        "Finished rivals leave the racing surface",
      );
    }
    assert.equal(
      await page
        .locator("#standings")
        .getByText("FINISHED · 3/3 LAPS", { exact: true })
        .count(),
      3,
    );
    console.log(
      "PASS full browser race",
      track,
      game.rivals.map((r, i) => ({
        name: r.name,
        lapTimes: r.lapTimes.map((n) => +n.toFixed(2)),
        recoveries: r.recoveries,
        metres: +audit.distances[i].toFixed(1),
      })),
    );
    await page.locator("#pause").click();
    await page.locator("#quit").click();
  }
  await page.locator('[data-track="atrium"]').click();
  await page.locator("#start").click();
  await page.clock.runFor(5000);
  await page.keyboard.down("w");
  await page.clock.runFor(700);
  await page.keyboard.press("r");
  const stopped = await page.evaluate(() => window.__OVERDRIVE__);
  await page.clock.runFor(1000);
  const held = await page.evaluate(() => window.__OVERDRIVE__);
  assert.equal(held.recoveries, 1);
  assert.equal(held.player.boost, 0);
  assert.equal(held.player.speed, 0);
  assert.equal(held.gatesPassed, stopped.gatesPassed);
  assert.equal(held.player.x, stopped.player.x);
  assert.equal(held.player.z, stopped.player.z);
  await page.clock.runFor(1300);
  assert.ok((await page.evaluate(() => window.__OVERDRIVE__)).player.speed > 0);
  await page.keyboard.up("w");
  assert.deepEqual(errors, []);
  console.log(
    "PASS recovery: two seconds stopped, empty boost, no lap credit.",
  );
} finally {
  await browser.close();
}
