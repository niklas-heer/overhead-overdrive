import { chromium, webkit, devices } from "@playwright/test";
import assert from "node:assert/strict";
const url = process.env.GAME_URL || "http://localhost:5173";

const profiles = [
  {
    name: "iphone",
    device: "iPhone 13",
    sizes: [
      { width: 844, height: 390 },
      { width: 667, height: 375 },
      { width: 375, height: 667 },
    ],
  },
  {
    name: "ipad",
    device: "iPad Pro 11",
    sizes: [
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1180, height: 820 },
      { width: 507, height: 768 },
    ],
  },
].filter(
  (profile) =>
    !process.env.MOBILE_DEVICE || profile.name === process.env.MOBILE_DEVICE,
);
for (const profile of profiles) {
  for (const engine of [webkit, chromium].filter(
    (engine) =>
      !process.env.MOBILE_ENGINE || engine.name() === process.env.MOBILE_ENGINE,
  )) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({
        ...devices[profile.device],
        deviceScaleFactor: 1,
      });
      // Simulate the permission API and sensor data; this does not test physical hardware.
      await context.addInitScript(() => {
        window.motionPermission = "granted";
        window.motionRequests = 0;
        if (!window.DeviceOrientationEvent)
          window.DeviceOrientationEvent = class extends Event {};
        DeviceOrientationEvent.requestPermission = async () => {
          window.motionRequests++;
          return window.motionPermission;
        };
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.__OVERDRIVE__);
      page.setDefaultTimeout(60000);
      const state = () => page.evaluate(() => window.__OVERDRIVE__);
      await page.locator('[data-tab="garage"]').tap();
      await page.locator("#garage-done").tap();
      await page.locator("#start").tap();
      await page.waitForFunction(() => window.__OVERDRIVE__.mode === "race");

      async function checkLayout(label) {
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `${label}: no horizontal overflow`,
        );
        assert.equal(
          await page.locator("#viewport canvas").evaluate((el) => {
            const canvas = el.getBoundingClientRect();
            const viewport = document
              .querySelector("#viewport")
              .getBoundingClientRect();
            return (
              Math.abs(canvas.width - viewport.width) < 1 &&
              Math.abs(canvas.height - viewport.height) < 1
            );
          }),
          true,
          `${label}: rendered canvas fills viewport`,
        );
        const map = await page.locator(".map-block").boundingBox();
        const item = await page.locator("#item-slot").boundingBox();
        if (map)
          assert.ok(
            item.x >= map.x + map.width ||
              map.x >= item.x + item.width ||
              item.y >= map.y + map.height ||
              map.y >= item.y + item.height,
            `${label}: supply and minimap do not overlap`,
          );
        const selectors = [
          "#pause",
          "#touch-recover",
          "#touch-camera",
          "#touch-tilt",
          "#race-sound",
          "#item-slot",
          ...[
            "ArrowLeft",
            "ArrowRight",
            "ArrowDown",
            "Space",
            "ShiftLeft",
            "ArrowUp",
          ].map((k) => `[data-key="${k}"]`),
        ];
        const boxes = [];
        for (const selector of selectors) {
          const element = page.locator(selector);
          const box = await element.boundingBox();
          assert.ok(
            box && box.width >= 44 && box.height >= 44,
            `${label}: ${selector} large enough`,
          );
          const reachable = await element.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
            return (
              r.x >= 0 &&
              r.y >= 0 &&
              r.right <= innerWidth + 1 &&
              r.bottom <= innerHeight + 1 &&
              el.contains(hit)
            );
          });
          assert.ok(reachable, `${label}: ${selector} reachable`);
          for (const [other, b] of boxes) {
            assert.ok(
              box.x >= b.x + b.width - 1 ||
                b.x >= box.x + box.width - 1 ||
                box.y >= b.y + b.height - 1 ||
                b.y >= box.y + box.height - 1,
              `${label}: ${selector} overlaps ${other}`,
            );
          }
          boxes.push([selector, box]);
        }
      }
      await checkLayout("portrait");
      await page.screenshot({
        path: `/tmp/overdrive-${profile.name}-${engine.name()}-portrait.png`,
      });
      const go = page.locator('[data-key="ArrowUp"]');
      const box = await go.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForFunction(() => window.__OVERDRIVE__.player.speed > 4);
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      assert.equal((await state()).mode, "paused");
      assert.equal((await state()).input.throttle, false);
      await page.mouse.up();
      await page.locator("#resume").tap();
      await page.locator("#touch-recover").tap();
      assert.ok(Math.abs((await state()).player.speed) < 1);
      const camera = (await state()).cameraMode;
      await page.locator("#touch-camera").tap();
      assert.notEqual((await state()).cameraMode, camera);

      await page.evaluate(() => (window.motionPermission = "denied"));
      await page.locator("#touch-tilt").tap();
      assert.equal((await state()).tiltEnabled, false);
      assert.match(await page.locator("#tilt-status").innerText(), /declined/);
      await page.evaluate(() => (window.motionPermission = "granted"));
      await page.locator("#touch-tilt").tap();
      assert.equal((await state()).tiltEnabled, true);
      async function tilt(gamma) {
        await page.evaluate((g) => {
          const event = new Event("deviceorientation");
          Object.assign(event, { beta: 0, gamma: g });
          window.dispatchEvent(event);
        }, gamma);
      }
      await tilt(0);
      await page.waitForTimeout(100);
      await tilt(25);
      assert.ok((await state()).steering > 0.2);
      await page.waitForTimeout(550);
      assert.equal(
        (await state()).steering,
        0,
        "stale motion releases steering",
      );
      await page.locator("#touch-tilt").tap();
      assert.equal((await state()).steering, 0);
      await page.locator("#race-sound").tap();
      assert.match(await page.locator("#race-sound").innerText(), /ON/);

      for (const size of profile.sizes) {
        await page.setViewportSize(size);
        await page.waitForTimeout(200);
        if ((await state()).mode === "paused")
          await page.locator("#resume").tap();
        await checkLayout(`${size.width}x${size.height}`);
        if (size.width > size.height) {
          await page.evaluate(() => {
            for (const [side, value] of [
              ["left", "44px"],
              ["right", "44px"],
              ["bottom", "21px"],
            ])
              document.documentElement.style.setProperty(
                `--safe-${side}`,
                value,
              );
          });
          await checkLayout(
            `${size.width}x${size.height} with simulated safe areas`,
          );
          await page.evaluate(() => {
            for (const side of ["left", "right", "bottom"])
              document.documentElement.style.removeProperty(`--safe-${side}`);
          });
        }
        await page.screenshot({
          path: `/tmp/overdrive-${profile.name}-${engine.name()}-${size.width}.png`,
        });
      }

      if (engine === chromium) {
        const cdp = await context.newCDPSession(page);
        const points = [];
        for (const [index, key] of [
          "ArrowUp",
          "ArrowLeft",
          "Space",
          "ShiftLeft",
        ].entries()) {
          const b = await page.locator(`[data-key="${key}"]`).boundingBox();
          points.push({
            id: index + 1,
            x: b.x + b.width / 2,
            y: b.y + b.height / 2,
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [...points],
          });
        }
        const input = (await state()).input;
        assert.ok(
          input.throttle && input.steerLeft && input.drift && input.boost,
          "simultaneous fingers",
        );
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: points.slice(0, 1),
        });
        await page.waitForFunction(() => !window.__OVERDRIVE__.input.throttle);
        assert.equal((await state()).input.steerLeft, true);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchCancel",
          touchPoints: [],
        });
        assert.equal(await page.locator("#touch-controls .held").count(), 0);
        assert.equal((await state()).input.steerLeft, false);
      }
      await page.locator("#pause").tap();
      await page.locator("#quit").tap();
      await page.setViewportSize({ width: 844, height: 390 });
      await page.locator('[data-tab="school"]').tap();
      await page.locator("#tour").tap();
      assert.equal(
        (await state()).mode,
        "tour",
        "landscape menus are scrollable",
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${profile.name} ${engine.name()}: touch layouts, controls, recovery, camera, interruption, sound and simulated tilt permission/input.`,
      );
    } finally {
      await browser.close();
    }
  }
}
