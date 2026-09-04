import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("pageerror", (e) => console.log("ERROR", e.message));
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  await mkdir("docs/screenshots", { recursive: true });
  for (const track of ["atrium", "chemistry", "courtyard"]) {
    await page.locator(`[data-track="${track}"]`).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `docs/screenshots/${track}-menu.png` });
    await page.getByRole("button", { name: "THE SCHOOL" }).click();
    await page.getByRole("button", { name: "TAKE A FREE DRIVE" }).click();
    await page.keyboard.press("c");
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `docs/screenshots/${track}-overhead.png` });
    console.log(
      track,
      await page.evaluate(() => ({
        calls: window.__OVERDRIVE__.renderCalls,
        triangles: window.__OVERDRIVE__.triangles,
      })),
    );
    await page.keyboard.press("c");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "BACK TO SCHOOL SELECTION" })
      .click();
  }
} finally {
  await browser.close();
}
