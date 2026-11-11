/**
 * The Kv4 dynamic clamp's effect on excitability, with the starting potential allowed to vary and with it fixed.
 *
 * The owner, 2026-11-11: "re-do the runs with holding current adjusted to keep Vrest the same across all
 * manipulations. choose the models native resting potential and keep it constant for each model. prepare a
 * results table with Vm allowed to vary and a second set with Vm fixed."
 *
 * Five cells: the Qiu 2024 KNDy cell in its two states, the GnRH cell, and the cortical pyramidal cell and
 * fast-spiking interneuron. For each
 * dose (nS of peak conductance at 0 mV per pF, as Mendonça state it) four conditions: the control, Kv4 injected,
 * a plain leak matched to the Kv4, and the Kv4 with a matched leak subtracted (gating only).
 *
 *   Vm free    no holding current: every test starts from that cell's own resting potential, which is reported.
 *              The matched leak is the Kv4's linearization at the Kv4 cell's own rest, so the two share a rest
 *              and an input resistance there.
 *   Vm fixed   every cell is held by steady bias current at V0, the model's native resting potential (the
 *              control's rest at zero current), and the steps ride on the bias. The matched leak is the Kv4's
 *              linearization AT V0, so the Kv4 cell and its leak need the same bias and have the same slope
 *              at V0.
 *
 * Gating only is the Kv4 minus its linearization at V0 in both sets: it rests at V0 with the control's input
 * resistance and needs no bias, so it is the same cell in both tables.
 *
 * Rheobase: the least 2 s step that fires, bisected to the model's tolerance, on top of any bias, with 5 s of
 * recovery between probes on the same cell (kv4_leak.ts Rig). Input resistance is the slope of the steady-state
 * I–V at the starting potential. No electrode, no noise.
 *
 *   node tools/experiments/kv4_vm.ts --all <outdir>     every cell and dose in parallel, then <outdir>/tables.html
 *   node tools/experiments/kv4_vm.ts --host gnrh --dose 0.4
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCell, cellHoldAt, cellRinAt, publishedParams, type BuiltCell, type CellParams, type Injected } from "../../src/core/cell.ts";
import { kv4Injection, kv4PeakFraction, linearizedAt, opposite } from "../../src/core/dynclamp.ts";
import { KNDY_E2, KNDY_OVX } from "../../src/core/kndy.ts";
import { MODELS, type ModelDef } from "../../src/core/models.ts";
import { DOSES, Rig } from "./kv4_leak.ts";

export const CELLS: Record<string, { model: ModelDef; params: CellParams; name: string }> = {
  kndy: { model: KNDY_OVX, params: { model: KNDY_OVX.id, cm: KNDY_OVX.defaults.cm, gLeak: KNDY_OVX.defaults.gLeak }, name: "KNDy, OVX (Qiu 2024)" },
  kndye2: { model: KNDY_E2, params: { model: KNDY_E2.id, cm: KNDY_E2.defaults.cm, gLeak: KNDY_E2.defaults.gLeak }, name: "KNDy, OVX+E2 (Qiu 2024)" },
  gnrh: { model: MODELS.gnrh, params: publishedParams("gnrh"), name: "GnRH (Adams 2018)" },
  rs: { model: MODELS.rs, params: publishedParams("rs"), name: "Cortical pyramidal (Pospischil 2008)" },
  fs: { model: MODELS.fs, params: publishedParams("fs"), name: "Cortical fast-spiking interneuron (Pospischil 2008)" },
};
export type VmCond = "control" | "kv4" | "leak" | "gating";

export interface VmRow {
  /** the cell's own rest at zero current, mV (NaN, or far from V0, when it has none of its own) */
  vOwn: number;
  /** steady bias current, pA, and the potential the cell actually sat at before each step */
  hold: number;
  vStart: number;
  /** input resistance at the starting potential, MΩ: slope of the steady-state I–V there */
  rin: number;
  /** least 2 s step that fires, pA, on top of the bias; NaN with `note` saying why */
  rheobase: number;
  note: string;
}
export interface VmResult {
  host: string;
  dosePerPf: number;
  gmax0: number;
  /** the model's native resting potential, mV */
  v0: number;
  free: Partial<Record<VmCond, VmRow>>;
  fixed: Partial<Record<VmCond, VmRow>>;
}

/** Rheobase of a cell from a holding current, with what it started from. */
export function rheobaseFrom(cell: BuiltCell, model: ModelDef, hold: number, vWant: number): VmRow {
  const row: VmRow = { vOwn: cell.vRest, hold, vStart: NaN, rin: cellRinAt(cell, hold), rheobase: NaN, note: "" };
  const rig = new Rig(cell, hold, 0.01, Math.max(5000, model.settleMs));
  row.vStart = rig.v;
  if (Math.abs(rig.v - vWant) > 0.5) {
    row.note = `does not sit at ${vWant.toFixed(1)} mV (settled at ${rig.v.toFixed(1)})`;
    return row;
  }
  if (rig.sweep(0, 2000, 5000).length > 0) {
    row.note = "fires with no step";
    return row;
  }
  let lo = 0, hi = Math.max(1, 2 * model.rheobase);
  while (rig.sweep(hi, 2000, 5000).length === 0) {
    lo = hi;
    hi *= 2;
    if (hi > 1e5) {
      row.note = "no spike up to 100 nA";
      return row;
    }
  }
  while (hi - lo > model.rheobaseTol) {
    const mid = 0.5 * (lo + hi);
    if (rig.sweep(mid, 2000, 5000).length > 0) hi = mid;
    else lo = mid;
  }
  row.rheobase = hi;
  return row;
}

export function runVm(hostKey: string, dosePerPf: number): VmResult {
  const { model, params } = CELLS[hostKey];
  const build = (inject: Injected[]) => buildCell({ ...params, inject }, model);
  const control = build([]);
  const v0 = control.vRest;
  const out: VmResult = { host: hostKey, dosePerPf, gmax0: dosePerPf * params.cm, v0, free: {}, fixed: {} };
  if (dosePerPf === 0) {
    out.free.control = rheobaseFrom(control, model, 0, v0);
    out.fixed.control = out.free.control;
    return out;
  }
  const kv4 = kv4Injection(dosePerPf * params.cm);
  const cKv4 = build([kv4]);
  const gating = build([kv4, opposite(linearizedAt(kv4, v0).slope)]);
  const own = Number.isFinite(cKv4.vRest) && Math.abs(cKv4.vRest - v0) < 15;
  // Vm free: each from its own rest
  if (own) {
    out.free.kv4 = rheobaseFrom(cKv4, model, 0, cKv4.vRest);
    const leak = build([linearizedAt(kv4, cKv4.vRest).slope]);
    out.free.leak = rheobaseFrom(leak, model, 0, leak.vRest);
  } else {
    const none: VmRow = { vOwn: cKv4.vRest, hold: 0, vStart: NaN, rin: NaN, rheobase: NaN, note: "no rest of its own near the control's" };
    out.free.kv4 = none;
    out.free.leak = none;
  }
  out.free.gating = rheobaseFrom(gating, model, 0, gating.vRest);
  // Vm fixed: each held at V0; the leak is the Kv4's linearization at V0
  out.fixed.kv4 = rheobaseFrom(cKv4, model, cellHoldAt(cKv4, v0), v0);
  const leak0 = build([linearizedAt(kv4, v0).slope]);
  out.fixed.leak = rheobaseFrom(leak0, model, cellHoldAt(leak0, v0), v0);
  out.fixed.gating = out.free.gating;
  return out;
}

// ---------------------------------------------------------------- tables

const f = (x: number | undefined, d = 1) => (x !== undefined && Number.isFinite(x) ? x.toFixed(d).replace(/^-/, "−") : "—");
const digits = (hostKey: string) => (hostKey === "rs" || hostKey === "fs" ? 0 : 1);

export function tables(results: VmResult[]): string {
  let html = "";
  for (const hostKey of Object.keys(CELLS)) {
    const rs = results.filter((r) => r.host === hostKey).sort((a, b) => a.dosePerPf - b.dosePerPf);
    const c = rs.find((r) => r.dosePerPf === 0)?.free.control;
    if (!c) continue;
    const d = digits(hostKey);
    const share = (set: VmResult["free"]) => {
      const k = set.kv4?.rheobase, l = set.leak?.rheobase;
      return k !== undefined && l !== undefined && Number.isFinite(k) && Number.isFinite(l) && Math.abs(k - c.rheobase) >= 5 * CELLS[hostKey].model.rheobaseTol ? `${f((100 * (l - c.rheobase)) / (k - c.rheobase), 0)}%` : "—";
    };
    const cell = (r: VmRow | undefined) => (r ? (Number.isFinite(r.rheobase) ? f(r.rheobase, d) : `<span class="flag">${r.note}</span>`) : "—");
    html += `<h2>${CELLS[hostKey].name}</h2>
<p>Native resting potential V0 = ${f(c.vOwn, 2)} mV; input resistance there ${f(c.rin, d ? 0 : 1)} MΩ; Cm ${f(CELLS[hostKey].params.cm, 1)} pF; control rheobase ${f(c.rheobase, d)} pA (2 s step from V0, no bias).</p>
<h3>Vm allowed to vary: each test from the cell's own resting potential, no holding current</h3>
<table><tr><th rowspan="2">dose, nS/pF</th><th rowspan="2">nS at 0 mV</th><th colspan="3">Kv4</th><th colspan="3">matched leak (at the Kv4 cell's rest)</th><th colspan="3">gating only</th><th rowspan="2">leak's share</th></tr>
<tr><th>started from, mV</th><th>Rin, MΩ</th><th>rheobase, pA</th><th>started from, mV</th><th>Rin, MΩ</th><th>rheobase, pA</th><th>started from, mV</th><th>Rin, MΩ</th><th>rheobase, pA</th></tr>
<tr><td>0 (control)</td><td>0</td><td>${f(c.vStart, 2)}</td><td>${f(c.rin, d ? 0 : 1)}</td><td>${f(c.rheobase, d)}</td><td colspan="7"></td></tr>
${rs.filter((r) => r.dosePerPf !== 0).map((r) => `<tr><td>${r.dosePerPf > 0 ? "+" : "−"}${Math.abs(r.dosePerPf)}</td><td>${f(r.gmax0, 2)}</td>${(["kv4", "leak", "gating"] as VmCond[]).map((k) => `<td>${f(r.free[k]?.vStart, 2)}</td><td>${f(r.free[k]?.rin, d ? 0 : 1)}</td><td>${cell(r.free[k])}</td>`).join("")}<td>${share(r.free)}</td></tr>`).join("\n")}
</table>
<h3>Vm fixed: every cell held at V0 = ${f(c.vOwn, 2)} mV by bias current, steps on top of the bias</h3>
<table><tr><th rowspan="2">dose, nS/pF</th><th rowspan="2">nS at 0 mV</th><th colspan="4">Kv4</th><th colspan="4">matched leak (at V0)</th><th colspan="3">gating only (no bias needed)</th><th rowspan="2">leak's share</th></tr>
<tr><th>bias, pA</th><th>held at, mV</th><th>Rin, MΩ</th><th>rheobase, pA</th><th>bias, pA</th><th>held at, mV</th><th>Rin, MΩ</th><th>rheobase, pA</th><th>at, mV</th><th>Rin, MΩ</th><th>rheobase, pA</th></tr>
<tr><td>0 (control)</td><td>0</td><td>0</td><td>${f(c.vStart, 2)}</td><td>${f(c.rin, d ? 0 : 1)}</td><td>${f(c.rheobase, d)}</td><td colspan="8"></td></tr>
${rs.filter((r) => r.dosePerPf !== 0).map((r) => `<tr><td>${r.dosePerPf > 0 ? "+" : "−"}${Math.abs(r.dosePerPf)}</td><td>${f(r.gmax0, 2)}</td>${(["kv4", "leak"] as VmCond[]).map((k) => `<td>${f(r.fixed[k]?.hold, d + 1)}</td><td>${f(r.fixed[k]?.vStart, 2)}</td><td>${f(r.fixed[k]?.rin, d ? 0 : 1)}</td><td>${cell(r.fixed[k])}</td>`).join("")}<td>${f(r.fixed.gating?.vStart, 2)}</td><td>${f(r.fixed.gating?.rin, d ? 0 : 1)}</td><td>${cell(r.fixed.gating)}</td><td>${share(r.fixed)}</td></tr>`).join("\n")}
</table>`;
  }
  return html;
}

/** The whole page: what was done, a summary across cells, then both tables for each cell. */
export function page(results: VmResult[], extra = ""): string {
  const adding = [0.05, 0.1, 0.2, 0.4, 0.6];
  const sum = Object.keys(CELLS).map((h) => {
    const get = (d: number) => results.find((r) => r.host === h && r.dosePerPf === d)!;
    const c = get(0).free.control!;
    const sh = (set: "free" | "fixed") => adding.map((d) => { const r = get(d)[set]; return (100 * (r.leak!.rheobase - c.rheobase)) / (r.kv4!.rheobase - c.rheobase); });
    const rng = (a: number[]) => `${f(Math.min(...a), 0)} to ${f(Math.max(...a), 0)}%`;
    const top = get(0.6);
    const dFree = top.free.kv4!.rheobase - c.rheobase, dFixed = top.fixed.kv4!.rheobase - c.rheobase;
    const dg = digits(h);
    return `<tr><td>${CELLS[h].name}</td><td>${f(c.vOwn, 2)}</td><td>${f(c.rheobase, dg)}</td><td>${f(top.free.kv4!.vStart, 2)}</td><td>${f(top.free.kv4!.rheobase, dg)}</td><td>${f(top.fixed.kv4!.hold, dg + 1)}</td><td>${f(top.fixed.kv4!.rheobase, dg)}</td><td>${f(100 * (1 - dFixed / dFree), 0)}%</td><td>${rng(sh("free"))}</td><td>${rng(sh("fixed"))}</td></tr>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Kv4 dynamic clamp: Vm free and Vm fixed</title>
<style>
body{font:15px/1.5 system-ui,-apple-system,sans-serif;max-width:1100px;margin:2rem auto;padding:0 16px;color:#0b0b0b;background:#fcfcfb}
h1{font-size:1.5rem;margin-bottom:.2rem} h2{margin-top:2.4rem;font-size:1.2rem} h3{font-size:1rem;margin-top:1.4rem}
table{border-collapse:collapse;font-size:.82rem;margin:.6rem 0;display:block;overflow-x:auto} td,th{border:1px solid #c3c2b7;padding:3px 7px;text-align:right} th{background:#efeee8;font-weight:600}
td:first-child,th:first-child{text-align:left} .note{font-size:.88rem;color:#3a3936} .sub{color:#52514e;margin-top:0} .flag{color:#a33;font-size:.78rem}
</style>
<h1>Kv4 by dynamic clamp: rheobase with Vm allowed to vary, and with Vm fixed</h1>
<p class="sub">gaba_excites, tools/experiments/kv4_vm.ts, 2026-11-11. Model measurements, not recordings.</p>
<h2>What was done</h2>
<ul>
<li><b>Vm allowed to vary:</b> no holding current. Each test starts from that cell's own resting potential, which each row states.</li>
<li><b>Vm fixed:</b> every cell is held by a steady bias current at V0, the model's native resting potential (the control's rest at zero current), and the steps ride on the bias. Each row states the bias and the potential the cell actually sat at.</li>
<li><b>Four conditions per dose:</b> the control; Kv4 injected (Mendonça's kinetics, reversing at −90 mV; the dose is the peak conductance at 0 mV); a plain leak matched to the Kv4; and gating only, the Kv4 with a matched leak subtracted.</li>
<li><b>The matched leak</b> has the Kv4's steady current and slope at the potential the Kv4 cell starts from: its own rest when Vm varies, V0 when Vm is fixed. So within either table the Kv4 cell and its leak start from the same potential with the same input resistance, and with Vm fixed they need the same bias.</li>
<li><b>Gating only</b> rests at V0 with the control's input resistance and needs no bias, so it is the same cell in both tables.</li>
<li><b>Rheobase</b> is the least 2 s step that fires, on top of any bias, with 5 s between probes. Input resistance is the slope of the steady-state I–V at the starting potential. No electrode, no noise.</li>
<li><b>Leak's share</b> is (matched leak − control) / (Kv4 − control), left blank where the Kv4 moved rheobase by less than five times the search's resolution.</li>
</ul>
<h2>Across the cells</h2>
<table><tr><th rowspan="2">cell</th><th rowspan="2">V0, mV</th><th rowspan="2">control rheobase, pA</th><th colspan="2">Kv4 at +0.6 nS/pF, Vm free</th><th colspan="2">Kv4 at +0.6 nS/pF, Vm fixed at V0</th><th rowspan="2">of the Kv4's change in rheobase, removed by fixing Vm</th><th colspan="2">leak's share, +0.05 to +0.6 nS/pF</th></tr>
<tr><th>started from, mV</th><th>rheobase, pA</th><th>bias, pA</th><th>rheobase, pA</th><th>Vm free</th><th>Vm fixed</th></tr>
${sum}</table>
<p class="note">Fixing Vm removes the part of the Kv4's effect that is owed to the shift in resting potential. What remains is owed to the conductance itself: its leak (lower input resistance) and its gating. The leak's share of what remains is the last column.</p>
${tables(results)}
${extra}
</html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k: string) => {
    const i = process.argv.indexOf(k);
    return i < 0 ? undefined : process.argv[i + 1];
  };
  if (arg("--dose") !== undefined) console.log(JSON.stringify(runVm(arg("--host") ?? "kndy", Number(arg("--dose")))));
  else if (arg("--all")) {
    const out = arg("--all")!;
    mkdirSync(out, { recursive: true });
    const jobs = Object.keys(CELLS).flatMap((h) => [0, ...DOSES].map((d) => [h, d] as const));
    let running = 0, next = 0, done = 0;
    const finish = () => {
      const results = readdirSync(out).filter((x) => x.startsWith("vm_") && x.endsWith(".json")).map((x) => JSON.parse(readFileSync(`${out}/${x}`, "utf8")) as VmResult);
      writeFileSync(`${out}/tables.html`, page(results));
      console.log(`wrote ${out}/tables.html from ${results.length} results`);
    };
    const launch = () => {
      while (running < 10 && next < jobs.length) {
        const [h, d] = jobs[next++];
        running++;
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--host", h, "--dose", String(d)]);
        let buf = "";
        child.stdout.on("data", (x) => (buf += x));
        child.stderr.on("data", (x) => process.stderr.write(x));
        child.on("close", (code) => {
          running--;
          if (code === 0) writeFileSync(`${out}/vm_${h}_${d}.json`, buf);
          else console.log(`${h} ${d}: FAILED (${code})`);
          if (++done === jobs.length) finish();
          launch();
        });
      }
    };
    launch();
  } else if (arg("--tables")) {
    const out = arg("--tables")!;
    const results = readdirSync(out).filter((x) => x.startsWith("vm_") && x.endsWith(".json")).map((x) => JSON.parse(readFileSync(`${out}/${x}`, "utf8")) as VmResult);
    writeFileSync(`${out}/tables.html`, page(results));
  } else console.log(`usage: node tools/experiments/kv4_vm.ts (--all outdir | --tables outdir | --host ${Object.keys(CELLS).join("|")} --dose x); peak fraction ${kv4PeakFraction().toFixed(3)}`);
}
