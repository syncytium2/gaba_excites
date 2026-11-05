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
// The fastest time base in Old school must not lock the page: stroking each phosphor column with its own glow
// once cost more than a second per second at 10 ms/div, and the page fell further behind until it froze.
await page.selectOption("#model-select", "gnrh");
await page.selectOption("#timebase-select", "10");
await page.waitForTimeout(4000);
{
  const t0 = Date.now();
  await page.evaluate(() => 1);
  if (Date.now() - t0 > 1000) problems.push(`scope: 10 ms/div in Old school left the page ${Date.now() - t0} ms behind`);
}
await page.selectOption("#timebase-select", "200");
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
// The human beta cell (Riz et al. 2014): its GABA pattern on the scope, its step preset with no siren, and the
// voltage-clamp note on how far its currents rest on voltage-clamp data (2026-11-02).
if (modelIds.includes("betahuman")) {
  await page.selectOption("#model-select", "betahuman");
  await page.waitForTimeout(1500);
  if (!(await page.locator("#pattern-select").count())) problems.push("human: no pattern selector");
  await page.selectOption("#pattern-select", "human-gaba-silent");
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/human-scope.png`, fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push("human: horizontal overflow");
  await page.click("#mode-steps");
  // the pattern moved K_ATP off the step preset's value, so the preset no longer holds and the menu says Custom
  if ((await page.locator("#preset-select").inputValue()) !== "custom") problems.push("human: a step preset still shows after its knobs moved");
  // ...but the preset's note stays in the menu's tooltip, saying which knob moved (the owner, 2026-11-04)
  const movedTip = (await page.locator(".tip", { has: page.locator("#preset-select") }).locator(".tip-body").textContent()) ?? "";
  if (!/you have moved .*→/.test(movedTip) || !movedTip.includes("Picoamps steer")) problems.push(`human: the moved preset's tooltip lost its note: "${movedTip.slice(0, 120)}"`);
  await page.selectOption("#preset-select", "human-steps");
  await page.waitForTimeout(300);
  await page.waitForFunction(() => /6 sweeps simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 60000 });
  if ((await page.locator("#preset-select").inputValue()) !== "human-steps") problems.push("human: choosing the step preset did not hold");
  if (await page.locator(".siren").count()) problems.push("human: the siren shows on its own preset");
  // no GABA synapses onto beta cells are described: the PSC panel stays, and switching it on lights the siren with why (the owner, 2026-11-04)
  await page.getByRole("switch", { name: "GABA PSC on" }).check();
  await page.waitForTimeout(300);
  const pscSiren = (await page.locator(".siren .tip-body").textContent().catch(() => "")) ?? "";
  if (!/No GABA synapses/.test(pscSiren)) problems.push(`human: GABA PSCs on did not light the siren with the islet note: "${pscSiren.slice(0, 100)}"`);
  await page.getByRole("switch", { name: "GABA PSC on" }).uncheck();
  await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 60000 });
  if (await page.locator(".siren").count()) problems.push("human: the siren stayed on after GABA PSCs went off");
  // it fires on its own, so its rheobase is measured held at −70 mV, and says so (the owner, 2026-11-04)
  const rheoLine = await page.locator(".readline > span").filter({ hasText: /^Rheobase/ }).innerText();
  if (!/Rheobase\s+3\.[5-7]\s+pA\s+from [−-]70\.0 mV/.test(rheoLine)) problems.push(`human: rheobase should read about 3.6 pA from −70 mV: "${rheoLine}"`);
  // the conductance knobs read in pS/pF or, switched, in the papers' nS/pF; the cell is the same (the owner, 2026-11-04)
  await page.getByRole("radio", { name: "nS/pF" }).click();
  const gK = () => page.getByRole("slider", { name: "gK(ATP)" }).first().getAttribute("aria-valuetext");
  const gNs = await gK();
  await page.getByRole("radio", { name: "pS/pF" }).click();
  const gPs = await gK();
  if (gNs !== "0.010 nS/pF" || gPs !== "10 pS/pF") problems.push(`human: the knob units switch reads gK(ATP) as "${gNs}" and "${gPs}", not "0.010 nS/pF" and "10 pS/pF"`);
  // each cell measures threshold at its own dV/dt criterion, and the phase plot's switch changes it
  // (docs/adr: "spike threshold's criterion belongs to the model")
  const critSwitch = page.getByLabel("Threshold criterion, V/s");
  // the bold value after the "Threshold" label (the label's tooltip text sits between them)
  const readout = async () => (await page.locator(".readline > span").filter({ hasText: /^Threshold/ }).locator("b").textContent()) ?? "";
  if ((await critSwitch.inputValue()) !== "0.5") problems.push("human: the threshold switch does not open on the cell's own 0.5 V/s");
  if (!/^[−-]4\d\.\d$/.test(await readout())) problems.push(`human: at 0.5 V/s the threshold readout is not in the −40s (${await readout()})`);
  await critSwitch.selectOption("20");
  if ((await readout()) !== "—") problems.push(`human: at 20 V/s its ~7 V/s spikes should have no threshold (${await readout()})`);
  await critSwitch.selectOption("0.5");
  await page.screenshot({ path: `${out}/human-steps.png`, fullPage: true });
  await page.click("#mode-vc");
  await page.waitForFunction(() => /sweeps simulated/.test(document.querySelector(".vc-traces .status")?.textContent ?? ""), null, { timeout: 60000 }).catch(() => problems.push("human: voltage clamp never finished"));
  if (!(await page.locator("#vc-model-note").isVisible())) problems.push("human: the voltage-clamp note is missing");
  await page.screenshot({ path: `${out}/human-vc.png`, fullPage: true });
  await page.click("#mode-scope");
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

// Step: one sweep at a time, moved by hand, for teaching from the front. The buttons and the clicker's keys step and
// stop at the ends; nothing advances on its own; a knob keeps the keys it uses, and turning one keeps the place.
{
  const st = () => page.locator(".play-status").textContent();
  const at = async (k, what) => { const s = await st(); if (!new RegExp(`^Sweep ${k} of \\d+`).test(s ?? "")) problems.push(`step: ${what}: "${s}"`); };
  await page.click("#step-sweeps");
  await at(1, "Step does not open on the first sweep");
  if (!(await page.locator("#step-back").isDisabled())) problems.push("step: back is enabled on the first sweep");
  await page.locator("h1").click();
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await at(3, "Page Down (a clicker) does not step");
  await page.keyboard.press("ArrowLeft");
  await at(2, "the left arrow does not step back");
  await page.click("#step-next");
  await page.waitForTimeout(1200);
  await at(3, "the next button does not step, or the sweeps advance on their own");
  const knob = page.locator("[role=slider]").first();
  const before = await knob.getAttribute("aria-valuenow");
  await knob.focus();
  await knob.press("ArrowRight");
  if ((await knob.getAttribute("aria-valuenow")) === before) problems.push("step: a focused knob lost the arrow keys");
  await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
  await page.waitForTimeout(300);
  await at(3, "turning a knob lost the place");
  await knob.press("ArrowLeft");
  await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
  await page.locator("h1").click();
  for (let i = 0; i < 30; i++) await page.keyboard.press("PageDown");
  const last = await st();
  const m = /^Sweep (\d+) of (\d+)/.exec(last ?? "");
  if (!m || m[1] !== m[2]) problems.push(`step: does not stop at the last sweep: "${last}"`);
  if (!(await page.locator("#step-next").isDisabled())) problems.push("step: next is enabled on the last sweep");
  await page.screenshot({ path: `${out}/step.png`, fullPage: false });
  await page.click("#step-done");
  if (await page.locator("#step-next").count()) problems.push("step: Show all leaves the step buttons");
}

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
// The current plot and the command strip share one time axis: a drag-zoom on either moves both, and the
// double-click reset does too (the owner: "command does not follow", 2026-10-30).
{
  const xOf = (sel) => page.locator(`${sel} .uplot`).getAttribute("data-x");
  const full = await xOf(".vc-i");
  const over = await page.locator(".vc-i .u-over").boundingBox();
  await page.mouse.move(over.x + over.width * 0.1, over.y + over.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(over.x + over.width * 0.3, over.y + over.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const [zi, zv] = [await xOf(".vc-i"), await xOf(".vc-v")];
  if (zi === full) problems.push("vc zoom: a drag on the current plot did not zoom it");
  if (zi !== zv) problems.push(`vc zoom: the command strip did not follow the current plot (${zi} vs ${zv})`);
  await page.screenshot({ path: `${out}/vc-zoom.png`, fullPage: false });
  await page.locator(".vc-v .u-over").dblclick();
  await page.waitForTimeout(200);
  const [ri, rv] = [await xOf(".vc-i"), await xOf(".vc-v")];
  if (ri !== full || rv !== full) problems.push(`vc zoom: a double-click on the strip did not reset both (${ri}, ${rv}; full ${full})`);
  // Zoomed to 2 ms or less, the view re-simulates at 1 µs steps, with a progress bar, then a badge (the owner,
  // 2026-10-30). Zoom twice: the second zoom cancels the first refinement, and only the last may land.
  const dragFrac = async (f0, f1) => {
    const o = await page.locator(".vc-i .u-over").boundingBox();
    await page.mouse.move(o.x + o.width * f0, o.y + o.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(o.x + o.width * f1, o.y + o.height * 0.5, { steps: 6 });
    await page.mouse.up();
  };
  const [x0, x1] = full.split(",").map(Number);
  await dragFrac((9.5 - x0) / (x1 - x0), (11.5 - x0) / (x1 - x0)); // 2 ms around the step
  await page.waitForTimeout(500);
  await dragFrac(0.25, 0.5); // about 0.5 ms
  const span = (await xOf(".vc-i")).split(",").map(Number);
  if (!(span[1] - span[0] < 1)) problems.push(`vc refine: the second zoom is ${span[1] - span[0]} ms wide`);
  try {
    await page.waitForSelector(".vc-i-wrap .refine-badge", { timeout: 30000 });
    if (await page.locator(".refine-bar").count()) problems.push("vc refine: the progress bar is still up beside the badge");
    if ((await xOf(".vc-i")) !== span.join(",")) problems.push("vc refine: the refinement moved the zoom");
    await page.screenshot({ path: `${out}/vc-refined.png`, fullPage: false });
  } catch {
    problems.push("vc refine: no 1 µs badge within 30 s of zooming to 0.5 ms");
  }
  await page.locator(".vc-v .u-over").dblclick();
  await page.waitForTimeout(300);
  if (await page.locator(".refine-badge, .refine-bar").count()) problems.push("vc refine: the badge or bar outlived the reset");
}
// Step in voltage clamp: one sweep at a time, by hand, as in the step protocol. The plots beside fill in on the
// family's axes, and the clicker's keys step.
{
  const st = () => page.locator(".vc-traces .play-status").textContent();
  const dots = () => page.evaluate(() => document.querySelector(".vc-side svg")?.querySelectorAll("circle").length ?? 0);
  const ticks = () => page.evaluate(() => [...(document.querySelector(".vc-side svg")?.querySelectorAll("text") ?? [])].map((t) => t.textContent).join("|"));
  const allDots = await dots();
  const allTicks = await ticks();
  await page.click("#vc-step");
  if (!/^Sweep 1 of \d+/.test((await st()) ?? "")) problems.push(`vc step: does not open on the first sweep: "${await st()}"`);
  await page.locator("h1").click();
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  if (!/^Sweep 3 of \d+/.test((await st()) ?? "")) problems.push(`vc step: Page Down does not step: "${await st()}"`);
  const some = await dots();
  if (!(some > 0 && some < allDots)) problems.push(`vc step: the measured plot shows ${some} of ${allDots} points on the third sweep`);
  if ((await ticks()) !== allTicks) problems.push("vc step: the measured plot's axes moved while stepping");
  await page.screenshot({ path: `${out}/vc-step.png`, fullPage: false });
  await page.click("#vc-step-done");
  if ((await dots()) !== allDots) problems.push("vc step: Show all does not bring every point back");
}
await page.locator(".vc-block input").first().uncheck();
await page.waitForTimeout(300);
await vcRan("a blocked run");
if (!(await page.locator(".vc-block").first().innerText()).includes("blocked")) problems.push("vc: blocking a channel did not take");
await page.locator(".vc-block input").first().check();
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/vc-phone.png`, fullPage: true });
if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push("vc: horizontal overflow at 390 px");

// The beta cell's currents were not fitted to voltage-clamp data, and its voltage-clamp view says so; a cell
// checked against NEURON shows no such note (2026-11-02).
if (modelIds.includes("betamouse")) {
  if (await page.locator("#vc-model-note").count()) problems.push("vc: the beta cell's note shows on the pyramidal cell");
  await page.selectOption("#model-select", "betamouse");
  await page.waitForTimeout(500);
  await page.click("#mode-vc");
  await vcRan("the beta cell");
  if (!(await page.locator("#vc-model-note").isVisible())) problems.push("vc: the beta cell's note is missing");
  await page.screenshot({ path: `${out}/vc-betamouse.png`, fullPage: true });
  await page.selectOption("#model-select", "rs");
  await page.waitForTimeout(500);
  await page.click("#mode-vc");
  await vcRan("back to the pyramidal cell");
}

// The current units switch: pA/pF in all three modes, on the squid axon, whose presets quote µA/cm² (= pA/pF).
await page.setViewportSize({ width: 1440, height: 1000 });
if (modelIds.includes("hh")) {
  await page.selectOption("#model-select", "hh");
  await page.waitForTimeout(500);
  await page.click("#units-density");
  await vcRan("hh in pA/pF");
  if (!(await page.locator(".vc-table").innerText()).includes("pA/pF")) problems.push("units: the voltage-clamp table is not in pA/pF");
  await page.screenshot({ path: `${out}/units-vc.png`, fullPage: true });
  // The squid axon's own voltage-clamp presets (Hodgkin & Huxley Figs. 3 and 6) are offered on it, and run.
  for (const id of ["hh-vc-gk", "hh-vc-gna"]) {
    if (!(await page.locator(`#vc-preset option[value="${id}"]`).count())) { problems.push(`vc: ${id} not offered on the squid axon`); continue; }
    await page.selectOption("#vc-preset", id);
    await page.waitForTimeout(300);
    await vcRan(id);
    if (!(await page.locator(".vc-side .svgplot svg").count())) problems.push(`vc: ${id} drew no measured curve`);
    await page.screenshot({ path: `${out}/vc-${id}.png`, fullPage: true });
  }
  await page.click("#mode-steps");
  await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const head = await page.locator("table th").first().innerText();
  if (!head.includes("pA/pF")) problems.push(`units: the sweep table's first column reads "${head}"`);
  const readline = await page.locator(".readline").innerText();
  if (!/Rheobase\s+[\d.]+\s+pA\/pF\s+from [−-]\d+\.\d mV/.test(readline)) problems.push(`units: rheobase does not read in pA/pF: "${readline.slice(0, 80)}"`);
  await page.screenshot({ path: `${out}/units-steps.png`, fullPage: true });
  // the temperature preset sets the model's own control
  await page.selectOption("#preset-select", "hh-temp");
  await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  if (!(await page.locator("#rig-sim").innerText()).includes("18.5")) problems.push("hh: the temperature preset did not set 18.5 °C");
  await page.screenshot({ path: `${out}/hh-temp.png`, fullPage: true });
  await page.click("#mode-scope");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/units-scope.png`, fullPage: true });
  await page.click("#units-pa");
  await page.waitForTimeout(300);
}

// Focus, for a lecture screen: at a projector's 1280×720 the screen fills the window in every mode, the amplifier
// waits just below it, the tour and the header's text step aside, and nothing scrolls sideways.
await page.setViewportSize({ width: 1280, height: 720 });
await page.selectOption("#model-select", "rs");
await page.waitForTimeout(500);
await page.check("#focus");
for (const mode of ["steps", "scope", "vc"]) {
  await page.click(`#mode-${mode}`);
  await page.waitForTimeout(mode === "scope" ? 1500 : 3000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => {
    const card = document.querySelector(".screen-card").getBoundingClientRect();
    const amp = document.querySelector(".amp").getBoundingClientRect();
    return { top: card.top, bottom: card.bottom, amp: amp.top, h: window.innerHeight, tour: !!document.querySelector(".tools")?.offsetParent, tagline: !!document.querySelector(".tagline")?.offsetParent, wide: document.documentElement.scrollWidth > window.innerWidth };
  });
  if (m.top < 0 || m.bottom < m.h - 40 || m.amp < m.h - 40) problems.push(`focus ${mode}: the screen does not fill the window (${Math.round(m.top)}–${Math.round(m.bottom)} px, amplifier at ${Math.round(m.amp)}, window ${m.h})`);
  if (m.tour || m.tagline) problems.push(`focus ${mode}: the tour or the tagline still shows`);
  if (m.wide) problems.push(`focus ${mode}: horizontal overflow at 1280 px`);
  await page.screenshot({ path: `${out}/focus-${mode}.png`, fullPage: false });
}
await page.uncheck("#focus");
await page.click("#mode-steps"); // voltage clamp has no tour column of its own
await page.waitForTimeout(300);
if (!(await page.locator(".tools").isVisible())) problems.push("focus: unticking it does not bring the tour back");

// Phones: every button, list and field on the screen card and the amplifier is big enough for a thumb (checkboxes
// are tapped by their labels), and text fields are 16 px, below which iOS zooms the page on a tap.
await page.setViewportSize({ width: 390, height: 844 });
await page.click("#mode-steps");
await page.waitForFunction(() => /sweeps? simulated/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
{
  const small = await page.evaluate(() => [...document.querySelectorAll(".amp button, .amp select, .amp input:not([type=checkbox]), .screen-card button, .screen-card select")]
    .filter((e) => e.offsetParent)
    .map((e) => ({ name: (e.id || e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 24), h: e.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(e).fontSize), text: e.tagName === "INPUT" || e.tagName === "SELECT" }))
    .filter((x) => x.h < 32 || (x.text && x.fs < 16)));
  if (small.length) problems.push(`phone: ${small.length} controls too small for a thumb or zoomed on a tap: ${small.slice(0, 6).map((x) => `${x.name} (${Math.round(x.h)} px, ${x.fs} px text)`).join(", ")}`);
}
await page.setViewportSize({ width: 1440, height: 1000 });

await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("clean: no console errors, no third-party requests, no phone overflow");
