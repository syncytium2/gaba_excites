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
// Both modes are driven from the amplifier front; the left column holds only the tour.
const amp = page.locator(".amp");
const setDial = async (name, v) => {
  const k = amp.getByRole("slider", { name });
  await k.dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(String(v));
  await page.keyboard.press("Enter");
};
// The app opens on the guided tour's first part: the GnRH cell in the scope.
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/opening.png`, fullPage: true });
// Every model on the oscilloscope, where the app opens: a per-model table that left one out blanked the page
// (the LTS cell's rate-meter scale, v0.2.3–v0.2.6). The page must still be there after each.
const modelIds = await page.locator("#model-select option").evaluateAll((os) => os.map((o) => o.value));
for (const id of modelIds) {
  await page.selectOption("#model-select", id);
  await page.waitForTimeout(1500);
  if (!(await page.locator("#model-select").count())) { problems.push(`scope: choosing ${id} broke the page`); await page.goto(url); await page.waitForTimeout(2500); }
}
// The beta cell lives on the oscilloscope: the step button is off, and its patterns are offered.
if (modelIds.includes("betamouse")) {
  await page.selectOption("#model-select", "betamouse");
  await page.waitForTimeout(1500);
  if (!(await page.locator("#mode-steps").isDisabled())) problems.push("beta: the step protocol is not disabled");
  if (!(await page.locator("#pattern-select").count())) problems.push("beta: no pattern selector");
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/beta-scope.png`, fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push("beta: horizontal overflow");
}
await page.selectOption("#model-select", "gnrh");
await page.waitForTimeout(1500);
// It opens in Old school, and Old school dresses the step protocol too, so a mode switch keeps the theme
// (the owner, 2026-10-21). Then untick it: the rest of this script checks the plain look, and the Old school
// section below ticks it again.
if (!(await page.locator(".page.old-school").count())) problems.push("theme: the app does not open in Old school");
await page.click("#mode-steps");
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
if (!(await page.locator(".page.old-school").count())) problems.push("theme: switching to the step protocol left Old school");
if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push("theme: horizontal overflow in the step protocol");
await page.screenshot({ path: `${out}/steps-oldschool.png`, fullPage: true });
await page.uncheck("#old-school");
await page.click("#mode-scope");
await page.waitForTimeout(500);
// The amplifier stays where it is when the mode switches (the owner, 2026-10-19).
const ampTop = () => page.evaluate(() => Math.round(document.querySelector(".amp").getBoundingClientRect().top));
const ampInScope = await ampTop();
// The rest of this script starts where the app used to open: the pyramidal cell, step mode.
await page.click("#mode-steps");
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
if (Math.abs((await ampTop()) - ampInScope) > 2) problems.push(`layout: the amplifier moved on a mode switch (${ampInScope} → ${await ampTop()} px)`);
if (await page.locator(".tools .panel").count() !== 1) problems.push("steps: the left column shows more than the tour");
await page.selectOption("#model-select", "rs");
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
await page.fill(".amp-list", "0, 25600");
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

// the LTS cell opens on its rebound preset, held at 60 pA; then its bursts from rest
await page.selectOption("#model-select", "lts");
await page.waitForTimeout(300);
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
await page.screenshot({ path: `${out}/lts-rebound.png`, fullPage: true });
if (await page.locator(".siren").count()) problems.push("siren: showing on the LTS rebound preset");
await page.selectOption(presetSelect, "lts-burst");
await page.waitForTimeout(300);
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
await page.screenshot({ path: `${out}/lts-burst.png`, fullPage: true });

// Igor-style marquee zoom on the step view: drag, click inside, Expand; then ⌘/Ctrl-A autoscales
{
  const over = await page.locator(".traces .u-over").first().boundingBox();
  await page.mouse.move(over.x + over.width * 0.4, over.y + 10);
  await page.mouse.down();
  await page.mouse.move(over.x + over.width * 0.7, over.y + over.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.mouse.click(over.x + over.width * 0.55, over.y + over.height * 0.3);
  if (!(await page.locator(".zoom-menu").count())) problems.push("zoom: no menu after a click inside the marquee");
  else {
    await page.locator(".zoom-menu button", { hasText: /^Expand$/ }).click();
    await page.waitForTimeout(200);
    if (!(await page.locator(".zoom-reset").count())) problems.push("zoom: Expand did not zoom");
    await page.screenshot({ path: `${out}/zoom.png`, fullPage: false });
    await page.locator(".traces .u-over").first().hover();
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForTimeout(200);
    if (await page.locator(".zoom-reset").count()) problems.push("zoom: ⌘/Ctrl-A did not autoscale");
  }
}

// measure mode: the readout rides in the title row, so the card must not grow
{
  // the stacked plots share time, so they must share their drawing area, or the traces, the synced cursor and the
  // time axis misalign (the owner caught the cursor off on the conductance plot, 2026-10-21)
  const areas = await page.evaluate(() => [...document.querySelectorAll(".traces .u-over")].map((o) => { const r = o.getBoundingClientRect(); return `${Math.round(r.left)}+${Math.round(r.width)}`; }));
  if (new Set(areas).size !== 1) problems.push(`plots: the stacked plots' drawing areas differ (${areas.join(", ")})`);
  const h0 = (await page.locator(".screen-card").first().boundingBox()).height;
  await page.getByRole("radio", { name: "Measure" }).click();
  await page.waitForTimeout(200);
  const over = await page.locator(".traces .u-over").first().boundingBox();
  await page.mouse.move(over.x + over.width * 0.3, over.y + over.height * 0.6);
  await page.waitForTimeout(150);
  const text = await page.locator(".readout").innerText();
  if (!/ms · .* mV · .* pA/.test(text)) problems.push(`measure: no t, V, I readout (got "${text}")`);
  const h1 = (await page.locator(".screen-card").first().boundingBox()).height;
  if (Math.abs(h1 - h0) > 1) problems.push(`measure: the trace card grew from ${h0} to ${h1} px`);
  await page.screenshot({ path: `${out}/measure.png`, fullPage: false });
  await page.getByRole("radio", { name: "Zoom" }).click();
}

// the GnRH model, with membrane noise
await page.selectOption("#model-select", "gnrh");
await page.waitForTimeout(300);
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
await page.screenshot({ path: `${out}/gnrh.png`, fullPage: true });

// the oscilloscope: running live on both cells, with pulses on the pyramidal cell.
// In scope mode every control is on the amplifier front; the side panels are gone.
await page.selectOption("#model-select", "rs");
await page.click("#mode-scope");
if (await page.locator(".tools .panel").count() !== 1) problems.push("scope: the left column shows more than the tour");
await amp.getByRole("switch", { name: "PULSES on" }).check();
await page.waitForTimeout(2500);
const live = await page.evaluate(() => [...document.querySelectorAll(".readline")].map((t) => t.textContent ?? ""));
if (!live.some((t) => /Firing\s*[0-9]/.test(t))) problems.push("scope: no live firing rate after 2.5 s: " + live.join(" | "));
// store a screen, cut the leak, and look at the live trace over the stored one
await page.waitForTimeout(2000);
await page.click("#scope-store");
await setDial("gL (leak)", 15);
await page.waitForTimeout(4500);
const legend = await page.evaluate(() => document.querySelector(".scope-screen")?.parentElement?.textContent ?? "");
if (!/stored 1: pyramidal, gL 28\.95 nS/.test(legend)) problems.push("scope: the stored trace's label is missing");
await page.screenshot({ path: `${out}/scope.png`, fullPage: true });
// the siren in scope mode: silent so far, then a 30 nA pulse
if (await page.locator(".siren").count()) problems.push("siren: showing in ordinary scope use");
await setDial("Amplitude", 30000);
await page.waitForTimeout(2500);
if (!(await page.locator(".siren").count())) problems.push("siren: not showing in scope mode at 30 nA");
await setDial("Amplitude", 700);
await page.selectOption("#model-select", "gnrh");
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/scope-gnrh.png`, fullPage: true });

// Old school: knobs, meters, the phosphor tube, and the audio monitor
await page.check("#old-school");
await page.waitForTimeout(300);
const knobCount = await page.locator(".knob").count();
if (knobCount < 15) problems.push(`old school: only ${knobCount} knobs`);
if (await page.locator(".hmeter").count() !== 2) problems.push("old school: the two meters are missing");
if (await page.locator(".panel.closed .pb:visible").count()) problems.push("old school: a collapsed panel shows its contents");
const glKnob = amp.getByRole("slider", { name: "gL (leak)" });
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

// the lab notebook: record two runs, download the report, load it back
await page.selectOption("#model-select", "rs");
const settled = () => page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
await page.waitForTimeout(300);
await settled();
await page.getByRole("textbox", { name: "Run title" }).fill("Published pyramidal cell");
await page.getByRole("textbox", { name: "Run notes" }).fill("Baseline.");
await page.click("button:has-text('Record this run')");
await setDial("gL (leak)", 15);
await page.waitForTimeout(300);
await settled();
await page.getByRole("textbox", { name: "Run title" }).fill("Half the leak");
await page.click("button:has-text('Record this run')");
if ((await page.locator(".nb-runs li").count()) !== 2) problems.push("notebook: two runs were not recorded");
const nbText = await page.locator(".notebook").textContent();
if (!/Changed from run 1: gL \(nS\): 28\.95 → 15/.test(nbText ?? "")) problems.push("notebook: the change from run 1 is not shown");
await page.getByRole("textbox", { name: "Report title" }).fill("Leak and rheobase");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("button:has-text('Download report')")]);
const reportPath = `${out}/report.html`;
await dl.saveAs(reportPath);
const { readFileSync } = await import("node:fs");
const reportHtml = readFileSync(reportPath, "utf8");
if (!reportHtml.includes("Leak and rheobase") || !reportHtml.includes("Changed from run 1:</b> gL (nS): 28.95 → 15")) problems.push("notebook: the downloaded report is missing its content");
await page.locator(".notebook").screenshot({ path: `${out}/notebook.png` });
page.once("dialog", (d) => d.accept());
await page.click(".nb-report button:has-text('clear')");
await page.setInputFiles(".nb-report input[type=file]", reportPath);
await page.waitForTimeout(300);
if ((await page.locator(".nb-runs li").count()) !== 2) problems.push("notebook: loading the report back did not restore its two runs");
const rp = await browser.newPage({ viewport: { width: 1200, height: 900 } });
rp.on("request", (r) => { if (!r.url().startsWith("file:")) problems.push("report: makes a request: " + r.url()); });
await rp.goto("file://" + (await import("node:path")).resolve(reportPath));
await rp.screenshot({ path: `${out}/report.png`, fullPage: true });
await rp.close();

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

// Voltage clamp: the tour folds away, every preset runs and draws what it measured, blocking a channel re-runs,
// and nothing overflows a phone.
await page.setViewportSize({ width: 1440, height: 1000 });
const vcRan = async (what) => {
  try {
    await page.waitForFunction(() => /sweeps simulated/.test(document.querySelector(".vc-traces .status")?.textContent ?? ""), null, { timeout: 30000 });
  } catch { problems.push(`vc: ${what} never finished`); }
};
await page.click("#mode-vc");
await vcRan("the opening run");
if (!(await page.locator(".layout.vc-wide").count()) || (await page.locator(".tools").isVisible())) problems.push("vc: the tour did not fold away");
for (const id of await page.locator("#vc-preset option").evaluateAll((os) => os.map((o) => o.value).filter((v) => v !== "custom"))) {
  await page.selectOption("#vc-preset", id);
  await page.waitForTimeout(300);
  await vcRan(id);
  if (!(await page.locator(".vc-side .svgplot svg").count())) problems.push(`vc: ${id} drew no measured curve`);
  await page.screenshot({ path: `${out}/vc-${id}.png`, fullPage: true });
}
await page.selectOption("#vc-preset", "vc-act");
await vcRan("activation again");
await page.locator(".vc-block input").first().uncheck();
await page.waitForTimeout(300);
await vcRan("a blocked run");
if (!(await page.locator(".vc-model-note").innerText()).includes("1 blocked")) problems.push("vc: blocking a channel did not take");
await page.locator(".vc-block input").first().check();
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/vc-phone.png`, fullPage: true });
if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push("vc: horizontal overflow at 390 px");

await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("clean: no console errors, no third-party requests, no phone overflow");
