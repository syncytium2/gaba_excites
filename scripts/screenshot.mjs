// Render the app headlessly and save screenshots, so a change can be LOOKED
// at, not just type-checked.  node scripts/screenshot.mjs [url] [outdir]
// Also fails loudly on any console error or any request that leaves the origin.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const problems = [];
const origin = new URL(url).origin;
page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("request", (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")) problems.push("third-party request: " + u); });

await page.goto(url);
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
await page.screenshot({ path: `${out}/app.png`, fullPage: true });

for (const preset of ["shunt", "barrage"]) {
  await page.selectOption("select", preset);
  await page.waitForTimeout(300);
  await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
  await page.screenshot({ path: `${out}/${preset}.png`, fullPage: true });
}

await page.setViewportSize({ width: 390, height: 900 });
await page.selectOption("select", "fi");
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/phone.png`, fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) problems.push("horizontal overflow at 390 px");

await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("clean: no console errors, no third-party requests, no phone overflow");
