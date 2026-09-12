import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run against a deployed build: Vite's dev server does not apply Vercel headers.
const url = process.env.GAME_URL;
assert.ok(url, "Set GAME_URL to the deployment under test");
const response = await fetch(url);
assert.equal(response.status, 200);
const config = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url)),
);
for (const header of config.headers[0].headers) {
  assert.equal(response.headers.get(header.key), header.value, header.key);
}
for (const path of [
  "/.env.local",
  "/.git/config",
  "/src/main.ts",
  "/package-lock.json",
]) {
  const probe = await fetch(new URL(path, url));
  assert.equal(probe.status, 404, `${path} must not be publicly served`);
}

const browser = await chromium.launch({ headless: true });
const directory = await mkdtemp(join(tmpdir(), "overdrive-security-"));
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      });
    });
    // Browser storage is untrusted, even though it is not an online score source.
    localStorage.setItem("overdrive-v4-best-atrium-0", "Infinity");
    localStorage.setItem("overdrive-crew-v1", '{"index":-100,"enabled":"yes"}');
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__OVERDRIVE__);
  assert.equal(await page.evaluate(() => window.__OVERDRIVE__.riderIndex), 0);
  assert.ok(!(await page.locator("body").innerText()).includes("Infinity"));
  await page.getByRole("button", { name: "THE GARAGE", exact: true }).click();
  await page
    .getByRole("button", { name: "Ride as Night Shift", exact: true })
    .click();
  await page.getByRole("button", { name: "BACK TO THE GRID" }).click();
  await page.locator("#sound").click();
  await page.locator("#sound").click();
  await page.getByRole("button", { name: "THE SCHOOL" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "DOWNLOAD THIS 3D SCHOOL" }).click();
  const download = await downloaded;
  const destination = join(directory, "school.glb");
  await download.saveAs(destination);
  const bytes = await readFile(destination);
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    await page.evaluate(() => window.__cspViolations),
    [],
    "Normal rendering, fonts, audio and GLB export must obey CSP",
  );

  // Harmless probes: an injected inline script and an off-origin request must fail.
  await page.evaluate(async () => {
    const script = document.createElement("script");
    script.textContent = "window.__injectedScriptRan = true";
    document.body.append(script);
    try {
      await fetch("https://example.invalid/overdrive-csp-probe");
    } catch {}
  });
  await page.waitForFunction(() => window.__cspViolations.length >= 2);
  assert.equal(
    await page.evaluate(() => window.__injectedScriptRan),
    undefined,
  );
  const violations = await page.evaluate(() => window.__cspViolations);
  assert.ok(violations.some((entry) => entry.directive === "script-src-elem"));
  assert.ok(violations.some((entry) => entry.directive === "connect-src"));
  console.log(
    "PASS: deployed headers, private-file 404s, invalid storage, crew, audio, GLB export; CSP blocks injected script and off-origin connection.",
  );
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
