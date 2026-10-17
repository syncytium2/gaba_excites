// Render the app headlessly and save screenshots, so a change can be LOOKED
// at, not just type-checked.  node scripts/screenshot.mjs [url] [outdir]
// Also fails loudly on any console error or any request that leaves the origin.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });

// CHROMIUM_ARGS lets a check reach a host this machine's DNS cache does not yet
// know, e.g. CHROMIUM_ARGS="--host-resolver-rules=MAP gaba.tonydefazio.com 104.21.29.154"
const browser = await chromium.launch({ args: process.env.CHROMIUM_ARGS ? [process.env.CHROMIUM_ARGS] : [] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const problems = [];
const origin = new URL(url).origin;
page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("request", (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")) problems.push("third-party request: " + u); });

await page.goto(url);
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
await page.screenshot({ path: `${out}/app.png`, fullPage: true });

const presetSelect = "#preset-select";
for (const preset of ["shunt", "barrage"]) {
  await page.selectOption(presetSelect, preset);
  await page.waitForTimeout(300);
  await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
  await page.screenshot({ path: `${out}/${preset}.png`, fullPage: true });
}

// the siren: silent on every ordinary page so far, then driven past a real cell
if (await page.locator(".siren").count()) problems.push("siren: showing on an ordinary preset");
await page.click(".seg button:has-text('List')");
await page.fill(".listfield textarea", "0, 25600");
await page.locator(".listfield textarea").blur();
await page.waitForTimeout(400);
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
if (!(await page.locator(".siren").count())) problems.push("siren: not showing at 25.6 nA");
await page.locator(".siren").focus();
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/siren.png`, fullPage: false });
await page.selectOption(presetSelect, "fi");

// the fast-spiking interneuron, on its own F–I preset
await page.selectOption("#model-select", "fs");
await page.waitForTimeout(300);
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
await page.screenshot({ path: `${out}/fs.png`, fullPage: true });

// the GnRH model, with membrane noise
await page.selectOption("#model-select", "gnrh");
await page.waitForTimeout(300);
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
await page.screenshot({ path: `${out}/gnrh.png`, fullPage: true });

// the oscilloscope: running live on both cells, with pulses on the pyramidal cell
await page.selectOption("#model-select", "rs");
await page.click("#mode-scope");
await page.click("#pulse-on");
await page.waitForTimeout(2500);
const live = await page.evaluate(() => [...document.querySelectorAll(".tile")].map((t) => t.textContent ?? ""));
if (!live.some((t) => /Firing rate\s*[0-9]/.test(t))) problems.push("scope: no live firing rate after 2.5 s: " + live.join(" | "));
// store a screen, cut the leak, and look at the live trace over the stored one
await page.waitForTimeout(2000);
await page.click("#scope-store");
await page.getByRole("textbox", { name: "gL (leak)" }).fill("15");
await page.keyboard.press("Enter");
await page.waitForTimeout(4500);
const legend = await page.evaluate(() => document.querySelector(".scope-screen")?.parentElement?.textContent ?? "");
if (!/stored 1: pyramidal, gL 28\.95 nS/.test(legend)) problems.push("scope: the stored trace's label is missing");
await page.screenshot({ path: `${out}/scope.png`, fullPage: true });
// the siren in scope mode: silent so far, then a 30 nA pulse
if (await page.locator(".siren").count()) problems.push("siren: showing in ordinary scope use");
await page.getByRole("textbox", { name: "Amplitude" }).fill("30000");
await page.keyboard.press("Enter");
await page.waitForTimeout(2500);
if (!(await page.locator(".siren").count())) problems.push("siren: not showing in scope mode at 30 nA");
await page.getByRole("textbox", { name: "Amplitude" }).fill("700");
await page.keyboard.press("Enter");
await page.selectOption("#model-select", "gnrh");
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/scope-gnrh.png`, fullPage: true });

// Old school: knobs, meters, the phosphor tube, and the audio monitor
await page.check("#old-school");
await page.waitForTimeout(300);
const knobCount = await page.locator(".knob").count();
if (knobCount < 15) problems.push(`old school: only ${knobCount} knobs`);
if (await page.locator(".meter").count() !== 2) problems.push("old school: the two meters are missing");
if (await page.locator(".panel.closed .pb:visible").count()) problems.push("old school: a collapsed panel shows its contents");
const glKnob = page.getByRole("slider", { name: "gL (leak)" });
await glKnob.focus();
await page.keyboard.press("End");
if ((await glKnob.getAttribute("aria-valuenow")) !== "5") problems.push("old school: End did not take the GnRH leak knob to its maximum (5 nS)");
await glKnob.dblclick();
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type("1");
await page.keyboard.press("Enter");
if ((await glKnob.getAttribute("aria-valuenow")) !== "1") problems.push("old school: typing an exact value into a knob failed");
await page.click("#sound-pop");
await page.waitForTimeout(1200);
await page.click("#sound-tone");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/oldschool.png`, fullPage: true });
await page.click("#sound-off");
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(500);
if (await page.locator(".knob").count()) problems.push("old school: knobs shown at phone width");
if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push("old school: horizontal overflow at 390 px");
await page.screenshot({ path: `${out}/oldschool-phone.png`, fullPage: true });
await page.setViewportSize({ width: 1440, height: 1000 });
await page.uncheck("#old-school");
await page.click("#mode-steps");
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });

await page.setViewportSize({ width: 390, height: 900 });
await page.selectOption("#model-select", "rs");
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/phone.png`, fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) problems.push("horizontal overflow at 390 px");
await page.click("#mode-scope");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/scope-phone.png`, fullPage: true });
if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push("scope: horizontal overflow at 390 px");

await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("clean: no console errors, no third-party requests, no phone overflow");
