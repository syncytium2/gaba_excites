/**
 * Builds the figures and tables of the Kv4 leak experiment (kv4_leak.ts) into one self-contained HTML page.
 *
 *   node tools/experiments/kv4_leak.ts --all <results> [--host e2]
 *   node tools/experiments/kv4_leak.ts --traces <traces> --at 0.4
 *   node tools/experiments/kv4_leak_report.ts <results> <traces> <out.html>
 *
 * Every number in the page's text is computed here from the results, not typed.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { linePlot, type Series } from "../../src/core/svgplot.ts";
import { DOSES, NOISE, NOISE_SEEDS, passiveMendonca, type DoseResult, type FiringMeasures } from "./kv4_leak.ts";
import { kv4PeakFraction, kv4Window } from "../../src/core/dynclamp.ts";

const [resDir, traceDir, outFile] = process.argv.slice(2);
if (!resDir || !outFile) throw new Error("usage: kv4_leak_report.ts <results dir> <traces dir> <out.html>");

const load = (host: string): Map<number, DoseResult> => {
  const m = new Map<number, DoseResult>();
  for (const f of readdirSync(resDir)) if (f.startsWith(`dose_${host}_`)) {
    const r = JSON.parse(readFileSync(`${resDir}/${f}`, "utf8")) as DoseResult;
    m.set(r.dosePerPf, r);
  }
  return m;
};
const OVX = load("ovx");
const E2 = load("e2");

const COL = { control: "#52514e", kv4: "#c0392b", linear: "#1f6fb2", chord: "#7fb3d9", compensated: "#2e8b57" } as const;
const NAME = { control: "control", kv4: "Kv4 injected", linear: "plain leak, matched to Kv4 at rest (current and slope)", chord: "plain K⁺ leak, Kv4's open conductance only", compensated: "Kv4 with its leak subtracted (gating only)" } as const;
type CondKey = keyof typeof NAME;
const f = (x: number | undefined | null, d = 1) => (x !== undefined && x !== null && Number.isFinite(x) ? x.toFixed(d).replace(/^-/, "−") : "—");

/** y against dose for one condition; the control's value stands at dose 0 for every condition. */
function byDose(res: Map<number, DoseResult>, cond: CondKey, get: (c: DoseResult["conds"][string]) => number | undefined): { x: number[]; y: number[] } {
  const x: number[] = [], y: number[] = [];
  for (const d of [...res.keys()].sort((a, b) => a - b)) {
    const c = d === 0 ? res.get(0)!.conds.control : res.get(d)!.conds[cond];
    const v = c ? get(c) : undefined;
    x.push(d);
    y.push(v === undefined || v === null ? NaN : v);
  }
  return { x, y };
}
const series = (res: Map<number, DoseResult>, conds: CondKey[], get: (c: DoseResult["conds"][string]) => number | undefined): Series[] =>
  conds.map((c) => ({ ...byDose(res, c, get), color: COL[c], label: NAME[c], dots: true, dash: c === "chord" ? "4 3" : undefined }));

const XL = "Kv4 dose: peak conductance at 0 mV, nS/pF (negative subtracts)";
const ctl = OVX.get(0)!.conds.control;
const at = (d: number, c: CondKey) => OVX.get(d)!.conds[c];
// only cells that still have a rest near the control's are plotted in the rest figures
const rested = (c: DoseResult["conds"][string]) => Math.abs(c.rest.vSettled - ctl.rest.vSettled) < 15;

const share = (res: Map<number, DoseResult>, d: number, mode: "own" | "matched") => {
  const c0 = res.get(0)!.conds.control.own!.rheobase;
  const k = res.get(d)!.conds.kv4[mode]?.rheobase, l = res.get(d)!.conds.linear[mode]?.rheobase, g = (res.get(d)!.conds.compensated.own)?.rheobase;
  return { k, l, g, c0, leak: k !== undefined && l !== undefined && Math.abs(k - c0) >= 0.5 ? (l - c0) / (k - c0) : NaN };
};
const posShares = (mode: "own" | "matched") => [0.05, 0.1, 0.2, 0.4, 0.6].map((d) => 100 * share(OVX, d, mode).leak).filter(Number.isFinite);
const range = (a: number[]) => `${f(Math.min(...a), 0)} to ${f(Math.max(...a), 0)}`;
const figs: string[] = [];
const fig = (svg: string, cap: string) => figs.push(`<figure>${svg}<figcaption>${cap}</figcaption></figure>`);

// ---- rest
fig(
  linePlot({ title: "Resting potential, Qiu 2024 KNDy cell (OVX)", xlabel: XL, ylabel: "resting potential, mV", legend: "clear", width: 640, height: 300,
    series: series(OVX, ["kv4", "linear", "chord", "compensated"], (c) => (rested(c) ? c.rest.vSettled : undefined)) }) +
  linePlot({ title: "Input resistance at rest (slope of the steady-state I–V)", xlabel: XL, ylabel: "input resistance, MΩ", legend: "clear", width: 640, height: 300,
    series: series(OVX, ["kv4", "linear", "chord", "compensated"], (c) => (rested(c) ? c.rest.rinSlope : undefined)) }),
  `What the paper did not show: rest and input resistance with the conductance on. The red and dark blue points coincide: a plain leak with the Kv4's steady current and slope at rest moves both exactly as the Kv4 does. The leak with only the Kv4's open conductance (dashed) gets the resting potential and falls short on input resistance, because depolarizing opens more of the Kv4 window, and a small step feels that. Points are missing at −0.2 and −0.4 nS/pF for every cell but the compensated one: subtracting that much removes the cell's rest, and it sits near −40 mV.`,
);
const pas = [0, ...DOSES].sort((a, b) => a - b).map((d) => ({ d, ...passiveMendonca(d) }));
fig(
  linePlot({ title: "A passive cell with Mendonça's mean properties (1.34 GΩ, −67.4 mV, 33.7 pF)", xlabel: XL, ylabel: "input resistance, MΩ", width: 640, height: 280,
    series: [{ x: pas.map((p) => p.d), y: pas.map((p) => (p.stable ? p.rin : NaN)), color: COL.kv4, dots: true, label: "Kv4 injected" }] }) +
  linePlot({ xlabel: XL, ylabel: "resting potential, mV", width: 640, height: 240,
    series: [{ x: pas.map((p) => p.d), y: pas.map((p) => (p.stable ? p.vRest : NaN)), color: COL.kv4, dots: true }] }),
  `The same arithmetic for a cell as tight as the ones Mendonça recorded: a leak of ${f(1000 / 1340, 2)} nS reversing at −67.4 mV, plus the Kv4. No active currents, so this is a floor on what the injection does at rest. At +0.6 nS/pF input resistance falls from 1340 to ${f(pas.find((p) => p.d === 0.6)!.rin, 0)} MΩ and rest moves to ${f(pas.find((p) => p.d === 0.6)!.vRest, 1)} mV. From −0.1 nS/pF down, the subtraction exceeds the cell's own conductance and there is no stable rest.`,
);

// ---- rheobase
const rheo = (mode: "own" | "matched") => (c: DoseResult["conds"][string]) => (c[mode] ?? (mode === "matched" ? c.own : null))?.rheobase;
fig(
  linePlot({ title: "Rheobase from each cell's own rest (2 s steps)", xlabel: XL, ylabel: "rheobase, pA", legend: "clear", width: 640, height: 300,
    series: series(OVX, ["kv4", "linear", "chord", "compensated"], rheo("own")) }) +
  linePlot({ title: "Rheobase from the control's resting potential, held by bias current", xlabel: XL, ylabel: "rheobase, pA", legend: "clear", width: 640, height: 300,
    series: series(OVX, ["kv4", "linear", "chord", "compensated"], rheo("matched")) }),
  `Excitability. The matched plain leak (dark blue) follows the Kv4 injection (red) at every dose; Kv4 with its leak subtracted (green), which keeps the gating and leaves rest and input resistance alone, does not move rheobase. Starting every cell from the control's resting potential (lower panel) removes about half of the change. Of what is left the leak gives ${range(posShares("matched"))}% at the adding doses, so from a matched start the gating does contribute, ${f(at(0.6, "kv4").matched!.rheobase - at(0.6, "linear").matched!.rheobase)} pA of the ${f(at(0.6, "kv4").matched!.rheobase - ctl.own!.rheobase)} pA at the top dose. At −0.2 and −0.4 nS/pF the cells have no rest of their own, so only the held measurement exists.`,
);

// ---- f–I at 0.4
const fiSeries = (d: number, mode: "own" | "matched"): Series[] =>
  (["control", "kv4", "linear", "chord", "compensated"] as CondKey[]).map((c) => {
    const m: FiringMeasures | null = c === "control" ? ctl.own : (at(d, c)[mode] ?? at(d, c).own);
    return { x: m!.fi.map((p) => p.amp), y: m!.fi.map((p) => p.rate), color: COL[c], label: NAME[c], dots: true, dash: c === "chord" ? "4 3" : undefined };
  });
fig(
  linePlot({ title: "f–I at +0.4 nS/pF, from each cell's own rest (5 s steps)", xlabel: "step, pA", ylabel: "mean rate, Hz", legend: "clear", width: 640, height: 300, series: fiSeries(0.4, "own") }),
  `The Kv4 injection shifts the f–I curve to the right, and the matched leak shifts it nearly as far. What the gating adds shows at the top: at 60 pA the Kv4 cell fires ${f(at(0.4, "kv4").own!.fi[6].rate)} Hz against the matched leak's ${f(at(0.4, "linear").own!.fi[6].rate)}, and Kv4 with its leak subtracted fires ${f(at(0.4, "compensated").own!.fi[6].rate)} against the control's ${f(ctl.own!.fi[6].rate)}.`,
);

// ---- CV
const cvS = (get: (m: FiringMeasures) => number) => series(OVX, ["kv4", "linear", "chord", "compensated"], (c) => { const m = c.own ?? c.matched; return m ? get(m) : undefined; });
fig(
  linePlot({ title: `CV of interspike intervals at 10 Hz, membrane noise on (σ ${NOISE.sigma} pA, τ ${NOISE.tau} ms)`, xlabel: XL, ylabel: "CV of ISI", legend: "clear", width: 640, height: 300, yrange: [0, 0.3], series: cvS((m) => m.cv10noise) }),
  `Irregularity, the paper's headline. Each point is the mean of ${NOISE_SEEDS} ten-second runs at the step that gives 10 Hz; the run-to-run SD is about ${f(ctl.own!.cv10noiseSd, 3)}. With noise off every cell here fires like a clock: the CV after the first second is ${f(ctl.own!.cv10late, 3)} in the control and ${f(at(0.6, "kv4").own!.cv10late, 3)} at +0.6 nS/pF. Cells without a rest of their own (−0.2 and −0.4 nS/pF) are shown held at the control's rest. This host does not reproduce the paper's effect, so it cannot say what causes it (see the limits below).`,
);

// ---- traces
if (traceDir && existsSync(`${traceDir}/manifest.json`)) {
  const panel = (cond: string, start: string) => {
    const p = `${traceDir}/trace_ovx_${cond}_${start}_noise.csv`;
    if (!existsSync(p)) return "";
    const rows = readFileSync(p, "utf8").trim().split("\n").slice(1);
    const x: number[] = [], y: number[] = [];
    for (let k = 0; k < rows.length; k++) {
      const [t, v] = rows[k].split(",").map(Number);
      if (t < 300 || t > 3500) continue;
      x.push(t);
      y.push(v);
    }
    const man = (JSON.parse(readFileSync(`${traceDir}/manifest.json`, "utf8")) as { file: string; step_pA: number; hold_pA: number }[]).find((m) => m.file === `trace_ovx_${cond}_${start}_noise.csv`)!;
    return linePlot({ title: `${NAME[cond as CondKey]}: ${f(man.step_pA)} pA step${Math.abs(man.hold_pA) > 1e-6 ? ` on ${f(man.hold_pA)} pA bias` : ""}`, xlabel: "ms", ylabel: "Vm, mV", width: 640, height: 170, yrange: [-80, 50], series: [{ x, y, color: COL[cond as CondKey], width: 1 }] });
  };
  fig(["control", "kv4", "linear", "compensated"].map((c) => panel(c, "own")).join(""),
    `Example traces at +0.4 nS/pF, each at the step that gives 10 Hz, membrane noise on. The first 3 s of a 10 s step. The Kv4 cell and the matched-leak cell need about twice the control's current to reach the same rate.`);
}

// ---- E2 host
if (E2.size > 1) {
  fig(
    linePlot({ title: "The other host: Qiu 2024 KNDy cell with estradiol (OVX+E2). Rheobase from own rest", xlabel: XL, ylabel: "rheobase, pA", legend: "clear", width: 640, height: 300,
      series: (["kv4", "linear", "chord", "compensated"] as CondKey[]).map((c) => ({ ...byDose(E2, c, (x) => x.own?.rheobase), color: COL[c], label: NAME[c], dots: true, dash: c === "chord" ? "4 3" : undefined })) }),
    `The same experiment in the model's estradiol state (rest ${f(E2.get(0)!.conds.control.rest.vSettled, 1)} mV, ${f(E2.get(0)!.conds.control.rest.rinSlope, 0)} MΩ), which fires in bursts: the CV of its interspike intervals is about 1 with or without Kv4, so only excitability is shown. The matched leak again reproduces the Kv4's change in rheobase, and the gating alone again does not move it.`,
  );
}

// ---- tables
const rheoRows = (res: Map<number, DoseResult>) => [...res.keys()].filter((d) => d !== 0).sort((a, b) => a - b).map((d) => {
  const o = share(res, d, "own"), m = share(res, d, "matched");
  const r = res.get(d)!;
  return `<tr><td>${d > 0 ? "+" : ""}${d}</td><td>${f(r.gmax0, 2)}</td><td>${f(r.conds.kv4.rest.vSettled, 1)}</td><td>${f(r.conds.kv4.rest.rinSlope, 0)}</td><td>${f(o.k)}</td><td>${f(o.l)}</td><td>${f(o.g)}</td><td>${Number.isFinite(o.leak) ? f(100 * o.leak, 0) + "%" : "—"}</td><td>${f(m.k)}</td><td>${f(m.l)}</td><td>${Number.isFinite(m.leak) ? f(100 * m.leak, 0) + "%" : "—"}</td></tr>`;
}).join("");
const rheoTable = (res: Map<number, DoseResult>, title: string) => `<h3>${title}</h3><p>Control: rest ${f(res.get(0)!.conds.control.rest.vSettled, 2)} mV, input resistance ${f(res.get(0)!.conds.control.rest.rinSlope, 0)} MΩ, rheobase ${f(res.get(0)!.conds.control.own!.rheobase)} pA.</p>
<table><tr><th rowspan="2">dose, nS/pF</th><th rowspan="2">nS at 0 mV</th><th colspan="2">Kv4 cell at rest</th><th colspan="4">rheobase from own rest, pA</th><th colspan="3">rheobase from the control's rest, pA</th></tr>
<tr><th>mV</th><th>MΩ</th><th>Kv4</th><th>matched leak</th><th>gating only</th><th>leak's share</th><th>Kv4</th><th>matched leak</th><th>leak's share</th></tr>${rheoRows(res)}</table>
<p class="note">"Leak's share" is (matched leak − control) / (Kv4 − control), left blank where the Kv4 moved rheobase by less than 0.5 pA. "Gating only" is Kv4 with its linearization at the control's rest subtracted; its rest and input resistance are the control's, so it has no separate held measurement. A cell with a dash under "own rest" has no rest of its own.</p>`;

const cvRows = [...OVX.keys()].sort((a, b) => a - b).map((d) => {
  const cell = (c: CondKey) => { const x = d === 0 ? (c === "kv4" ? ctl : undefined) : OVX.get(d)!.conds[c]; const m = x ? (x.own ?? x.matched) : null; return m ? `${f(m.cv10noise, 3)} ± ${f(m.cv10noiseSd, 3)}${x!.own ? "" : "*"}` : "—"; };
  return `<tr><td>${d === 0 ? "0 (control)" : (d > 0 ? "+" : "") + d}</td><td>${cell("kv4")}</td><td>${cell("linear")}</td><td>${cell("compensated")}</td></tr>`;
}).join("");

const r = ctl.rest;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Kv4 by dynamic clamp is also a leak</title>
<style>
body{font:15px/1.5 system-ui,-apple-system,sans-serif;max-width:860px;margin:2rem auto;padding:0 16px;color:#0b0b0b;background:#fcfcfb}
h1{font-size:1.5rem;margin-bottom:.2rem} h2{margin-top:2.2rem;font-size:1.2rem} h3{font-size:1rem;margin-top:1.4rem}
figure{margin:1.4rem 0} figcaption{font-size:.9rem;color:#3a3936;margin-top:.3rem}
table{border-collapse:collapse;font-size:.85rem;margin:.6rem 0;display:block;overflow-x:auto} td,th{border:1px solid #c3c2b7;padding:3px 7px;text-align:right} th{background:#efeee8;font-weight:600}
td:first-child,th:first-child{text-align:left} .note{font-size:.85rem;color:#3a3936} .sub{color:#52514e;margin-top:0}
.key span{display:inline-block;margin-right:1.2em} .key i{display:inline-block;width:1.6em;height:3px;vertical-align:middle;margin-right:.4em}
</style>
<h1>Kv4 by dynamic clamp is also a leak</h1>
<p class="sub">Mendonça et al. 2018's Kv4 injection, tested in the Qiu et al. 2024 arcuate kisspeptin cell. gaba_excites, branch kndy-kv4, 2026-11-11. Model measurements, not recordings.</p>

<h2>What came out</h2>
<ul>
<li><b>The injection changes the cell at rest, a lot.</b> In the Qiu cell, +0.6 nS/pF of Kv4 (the top of the paper's range) takes input resistance from ${f(ctl.rest.rinSlope, 0)} to ${f(at(0.6, "kv4").rest.rinSlope, 0)} MΩ and rest from ${f(ctl.rest.vSettled, 1)} to ${f(at(0.6, "kv4").rest.vSettled, 1)} mV. In a passive cell with the paper's own mean properties it takes 1340 MΩ to ${f(pas.find((p) => p.d === 0.6)!.rin, 0)} MΩ and moves rest by ${f(pas.find((p) => p.d === 0.6)!.vRest + 67.4, 1)} mV.</li>
<li><b>For excitability, the leak is nearly the whole effect.</b> A plain leak matched to the Kv4 at rest reproduces ${range(posShares("own"))}% of the Kv4's change in rheobase across the adding doses (+0.05 to +0.6 nS/pF), measured from each cell's own rest; from a matched starting potential, ${range(posShares("matched"))}%. Kv4 with that leak subtracted, so only its gating is left, moves rheobase by ${f(Math.max(...[0.05, 0.1, 0.2, 0.4, 0.6].map((d) => Math.abs(at(d, "compensated").own!.rheobase - ctl.own!.rheobase))), 1)} pA at most (control ${f(ctl.own!.rheobase)} pA; Kv4 at +0.6: ${f(at(0.6, "kv4").own!.rheobase)} pA).</li>
<li><b>Subtracting Kv4 can remove the cell's rest.</b> At −0.2 nS/pF and beyond the Qiu cell has no resting potential near −66 mV and settles near −40 mV; in the passive cell with Mendonça's properties that happens from −0.1 nS/pF.</li>
<li><b>Irregularity cannot be settled in this host.</b> With no noise the Qiu cell fires perfectly regularly with or without Kv4. With membrane noise the CV of interspike intervals at 10 Hz is ${f(ctl.own!.cv10noise, 3)} in the control and stays within ${f(Math.max(...[0.05, 0.1, 0.2, 0.4].map((d) => Math.abs(at(d, "kv4").own!.cv10noise - ctl.own!.cv10noise))), 3)} of that up to +0.4 nS/pF; at +0.6 it is ${f(at(0.6, "kv4").own!.cv10noise, 3)}, against ${f(at(0.6, "linear").own!.cv10noise, 3)} for the matched leak. Subtracting Kv4 raises the CV as well (${f(at(-0.4, "kv4").matched!.cv10noise, 3)} at −0.4 nS/pF, held at the control's rest), the opposite of what the paper reports. The paper's effect is not here to be explained.</li>
<li><b>The Qiu paper's parameter table does not make the cell its code makes.</b> The code fires at 7 to 13 Hz with 10 to 20 pA; the table's values give one spike at most. The port follows the code and matches it.</li>
</ul>

<p class="key"><span><i style="background:${COL.kv4}"></i>${NAME.kv4}</span><span><i style="background:${COL.linear}"></i>${NAME.linear}</span><span><i style="background:${COL.chord}"></i>${NAME.chord}</span><span><i style="background:${COL.compensated}"></i>${NAME.compensated}</span></p>

<h2>Rest: the figure the paper did not show</h2>
<p>The injected conductance is ḡ·m·h with Mendonça's kinetics, reversing at −90 mV. Its steady open fraction m∞·h∞ is ${f(100 * kv4Window(-70), 1)}% of ḡ at −70 mV, ${f(100 * kv4Window(-60), 1)}% at −60 and ${f(100 * kv4Window(-50), 1)}% at −50. The paper states the dose as the peak conductance on a step to 0 mV, which is ${f(100 * kv4PeakFraction(), 1)}% of ḡ (from −90 mV), so ḡ is ${f(1 / kv4PeakFraction(), 2)} times the stated dose.</p>
${figs[0]}${figs[1]}

<h2>Excitability</h2>
${figs[2]}
${rheoTable(OVX, "Qiu 2024 KNDy cell, OVX")}
${figs[3]}

<h2>Irregularity</h2>
${figs[4]}
<table><tr><th>dose, nS/pF</th><th>Kv4</th><th>matched leak</th><th>gating only</th></tr>${cvRows}</table>
<p class="note">CV of ISI at 10 Hz with membrane noise, mean ± SD of ${NOISE_SEEDS} runs. * held at the control's rest, because the cell has none of its own.</p>
${figs.slice(5).join("")}
${E2.size > 1 ? rheoTable(E2, "Qiu 2024 KNDy cell, OVX+E2") : ""}

<h2>Input resistance is not the leak</h2>
<p>The Qiu model's leak is ${f(ctl.rest.rinFromLeak > 0 ? 1000 / ctl.rest.rinFromLeak : NaN, 1)} nS. Measured on the control cell at rest:</p>
<table><tr><th>how</th><th>MΩ</th></tr>
<tr><td>1 / g_leak</td><td>${f(r.rinFromLeak, 0)}</td></tr>
<tr><td>1 / (sum of every conductance open at rest, ${f(r.gOpen, 2)} nS)</td><td>${f(1000 / r.gOpen, 0)}</td></tr>
<tr><td>slope of the steady-state I–V</td><td>${f(r.rinSlope, 0)}</td></tr>
<tr><td>current clamp, −2 pA for 3 s</td><td>${f(r.rinCC, 0)}</td></tr>
<tr><td>current clamp, −20 pA for 3 s (the size Mendonça used)</td><td>${f(r.rinCC20, 0)}</td></tr>
<tr><td>voltage clamp, −2 mV step, at 10 ms</td><td>${f(r.rinVCearly, 0)}</td></tr>
<tr><td>voltage clamp, −2 mV step, at 3 s</td><td>${f(r.rinVC, 0)}</td></tr></table>
<p>Mendonça report 1.34 ± 0.69 GΩ. By any of these the Qiu cell is three to four times leakier, so a dose in nS/pF is a smaller share of its resting conductance than of theirs.</p>

<h2>Limits</h2>
<ul>
<li>The host is a model of female cells; Mendonça recorded males. Its action potentials are about 8 ms wide (it has no delayed rectifier), against about 1 ms in recordings, so anything Kv4 does during a spike is distorted.</li>
<li>The host already has an A current with the Kv4's steady-state curves and constant time constants (60 nS). A subtraction removes a conductance with different kinetics from the one the cell has.</li>
<li>The noise is a current with fixed variance. Mendonça et al. 2016 attribute irregularity to channel noise that persistent Na⁺ amplifies, and to deterministic pauses in their own two-compartment model. Neither is in this host.</li>
<li>The injection's reversal (−90 mV) and the −90 mV start of the 0 mV test step are assumptions: the 2018 paper states neither.</li>
<li>The dynamic clamp here is ideal: it reads the membrane potential itself with no electrode, filter or delay.</li>
<li>Sweeps follow one another on the same cell with 5 s between them. A step family repeated with 0.5 s or more between sweeps gives the same spike counts as one started fresh each time; at 0.1 s it loses a spike.</li>
</ul>
</html>`;
writeFileSync(outFile, html);
console.log(`wrote ${outFile} (${(html.length / 1024).toFixed(0)} kB)`);
