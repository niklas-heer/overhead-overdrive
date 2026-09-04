import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
await mkdir("models", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto(process.env.GAME_URL || "http://localhost:5173");
  for (const id of ["atrium", "chemistry", "courtyard"]) {
    await page.locator(`[data-track="${id}"]`).click();
    await page.getByRole("button", { name: "THE SCHOOL" }).click();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "DOWNLOAD THIS 3D SCHOOL" }).click();
    const download = await downloaded;
    const destination = `models/${download.suggestedFilename()}`;
    await download.saveAs(destination);
    const bytes = await readFile(destination);
    assert.equal(bytes.toString("ascii", 0, 4), "glTF");
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const jsonLength = bytes.readUInt32LE(12);
    const model = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength));
    assert.ok(model.meshes.length > 20);
    assert.ok(model.images.length > 0);
    console.log(
      `Verified ${destination}: ${bytes.length} bytes, ${model.meshes.length} meshes, ${model.images.length} embedded textures`,
    );
    await page.getByRole("button", { name: "THE RACE", exact: true }).click();
  }
} finally {
  await browser.close();
}
