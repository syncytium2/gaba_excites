/**
 * Does a Kv4 conductance added by dynamic clamp change firing through its gating, or through the leak it adds?
 *
 * Mendonça PRF, Kyle V, Yeo S-H, Colledge WH, Robinson HPC (2018) J Physiol 596:885, doi:10.1113/JP274474, added
 * and subtracted a Kv4-like conductance in arcuate kisspeptin neurons by dynamic clamp and report that adding
 * it makes firing more irregular and the cell less excitable, and subtracting it does the opposite. The owner's
 * objection (2026-11-11): the injected conductance is partly open at rest, so every injection also changes the
 * cell's resting conductance, input resistance and resting potential, and the paper shows none of those with
 * the conductance on. docs/handoffs/2026-11-11-kndy-kv4-leak.md is the brief.
 *
 * Host: the arcuate kisspeptin cell of Qiu et al. 2024 as the authors' code runs it (src/core/kndy.ts), in its
 * OVX state by default. Mendonça recorded males; this host is a model of females. It is also four times leakier
 * than their cells (414 MΩ at rest against their mean 1.34 GΩ), so a given dose is a smaller share of its
 * resting conductance. `passiveMendonca` does the arithmetic for a cell with their mean passive properties.
 *
 * For each dose (Mendonça's unit: peak conductance at 0 mV, per pF), five cells:
 *
 *   control       the host
 *   kv4           the host with Mendonça's Kv4 injected (dynclamp.ts)
 *   chord         the host with a plain K⁺ leak equal to the Kv4's open conductance at the injected cell's rest
 *   linear        the host with the Kv4's LINEARIZATION at that rest: a plain leak with the Kv4's steady current
 *                 and its slope there. It reproduces the injected cell's resting potential and input resistance.
 *   compensated   the host with Kv4 plus the opposite of its linearization at the control's rest: rest and
 *                 input resistance are the control's, and only the gating is added.
 *
 * and for each: rest (resting potential, input resistance four ways), rheobase, an f–I curve, first-spike
 * latency, and the CV of interspike intervals at 10 Hz, with membrane noise off and on. Every firing measure
 * is taken twice: from the cell's own rest, and from the control's rest held by bias current ("matched").
 *
 * The rig keeps its state between sweeps, as a cell on a rig does: a sweep is a step and then a recovery
 * interval, and the next sweep starts from whatever the last one left. `carryOver` measures what that leaves.
 *
 * An experiment, not part of the app. src/experiments.test.ts keeps its pieces working.
 *
 *   node tools/experiments/kv4_leak.ts --all <outdir>        every dose, in parallel; writes <outdir>/dose_*.json
 *   node tools/experiments/kv4_leak.ts --dose 0.2            one dose, JSON to stdout
 *   node tools/experiments/kv4_leak.ts --rest                the rest table only (fast)
 *   node tools/experiments/kv4_leak.ts --traces <outdir>     example traces as CSV, with a manifest
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCell, cellHoldAt, type BuiltCell, type Injected } from "../../src/core/cell.ts";
import { detectSpikes } from "../../src/core/analysis.ts";
import { KV4, kv4Injection, kv4PeakFraction, kv4Window, linearizedAt, opposite } from "../../src/core/dynclamp.ts";
import { KNDY_E2, KNDY_OVX } from "../../src/core/kndy.ts";
import type { ModelDef } from "../../src/core/models.ts";
import { OU } from "../../src/core/noise.ts";
import { settle, step, stepVC, type Electrode, type SynNow } from "../../src/core/simulate.ts";

export const HOSTS: Record<string, ModelDef> = { ovx: KNDY_OVX, e2: KNDY_E2 };
/** Doses, nS of peak conductance at 0 mV per pF. The paper's Fig. 6E runs from about −0.4 to +0.6; its Fig. 6C example is +2.18 nS, about +0.065 on its mean 33.7 pF cell. */
export const DOSES = [-0.4, -0.2, -0.1, -0.05, 0.05, 0.1, 0.2, 0.4, 0.6];
export type Cond = "control" | "kv4" | "chord" | "linear" | "compensated";
export const CONDS: Cond[] = ["kv4", "chord", "linear", "compensated"];

/** The rig's electrode: none. The dynamic clamp here is ideal, so the recording is too. */
const IDEAL: Electrode = { rs: 0, cp: 0, bridge: 0 };
const NO_SYN: SynNow = { gGlu: 0, gGaba: 0, eGlu: 0, eGaba: 0 };
export const DT = 0.01;
/** traces are kept every other step: 0.02 ms */
const EVERY = 2;
/** membrane noise for the "noise on" measures: an Ornstein–Uhlenbeck current, pA and ms. A choice, not a measurement. */
export const NOISE = { sigma: 3, tau: 5 };

const baseParams = (host: ModelDef) => ({ model: host.id, cm: host.defaults.cm, gLeak: host.defaults.gLeak });

export interface Built {
  cond: Cond;
  cell: BuiltCell;
  inject: Injected[];
  /** where the Kv4 was linearized, mV, and whether that was the injected cell's own rest or (when it has none nearby) the control's */
  linAt: number;
  linAtOwnRest: boolean;
}

/** The five cells for a dose (nS/pF of peak conductance at 0 mV). */
export function buildCond(host: ModelDef, dosePerPf: number, cond: Cond): Built {
  const p = baseParams(host);
  const control = buildCell(p, host);
  if (cond === "control") return { cond, cell: control, inject: [], linAt: control.vRest, linAtOwnRest: true };
  const kv4 = kv4Injection(dosePerPf * host.defaults.cm);
  const injected = buildCell({ ...p, inject: [kv4] }, host);
  // a subtraction large enough removes the cell's rest; the steady I–V's first zero is then tens of mV away
  const own = Number.isFinite(injected.vRest) && Math.abs(injected.vRest - control.vRest) < 15;
  const linAt = own ? injected.vRest : control.vRest;
  let inject: Injected[];
  if (cond === "kv4") inject = [kv4];
  else if (cond === "chord") inject = [linearizedAt(kv4, linAt).chord];
  else if (cond === "linear") inject = [linearizedAt(kv4, linAt).slope];
  else inject = [kv4, opposite(linearizedAt(kv4, control.vRest).slope)];
  return { cond, cell: buildCell({ ...p, inject }, host), inject, linAt: cond === "compensated" ? control.vRest : linAt, linAtOwnRest: cond === "compensated" ? true : own };
}

/** The current the dynamic clamp is passing, pA (outward positive), from the state. */
export function clampCurrent(cell: BuiltCell, s: Float64Array): number {
  let i = 0;
  const v = s[cell.iv];
  for (let k = cell.nOwn; k < cell.channels.length; k++) i += cell.gbar[k] * cell.channels[k].open(s, cell.offsets[k], s[cell.iCa]) * (v - cell.erev[k]);
  return i;
}

/** The conductance open at rest, nS: the leak plus every channel's open conductance (the chord, not the slope). */
export function openConductance(cell: BuiltCell, s: Float64Array): number {
  let g = cell.gLeak;
  for (let k = 0; k < cell.channels.length; k++) g += cell.gbar[k] * cell.channels[k].open(s, cell.offsets[k], s[cell.iCa]);
  return g;
}

/** A cell on a rig: its state persists from one sweep to the next. */
export class Rig {
  s: Float64Array;
  readonly cell: BuiltCell;
  readonly hold: number;
  readonly dt: number;
  constructor(cell: BuiltCell, hold = 0, dt = DT, settleMs = 5000) {
    this.cell = cell;
    this.hold = hold;
    this.dt = dt;
    this.s = settle(cell, IDEAL, hold, settleMs, dt);
  }
  get v(): number {
    return this.s[this.cell.iv];
  }
  /** Run `ms` at holding current plus `amp`. Returns Vm every 0.02 ms when `record`, and the clamp's current beside it when `clamp`. */
  run(ms: number, amp: number, opt: { record?: boolean; ou?: OU; clamp?: boolean } = {}): { vm: Float32Array; iClamp: Float32Array } {
    const n = Math.round(ms / this.dt);
    const vm = new Float32Array(opt.record ? Math.floor(n / EVERY) + 1 : 0);
    const iClamp = new Float32Array(opt.record && opt.clamp ? vm.length : 0);
    if (opt.record) {
      vm[0] = this.v;
      if (opt.clamp) iClamp[0] = clampCurrent(this.cell, this.s);
    }
    for (let i = 1; i <= n; i++) {
      step(this.cell, IDEAL, this.s, this.hold + amp, opt.ou ? opt.ou.next() : 0, this.dt, NO_SYN);
      if (opt.record && i % EVERY === 0) {
        vm[i / EVERY] = this.v;
        if (opt.clamp) iClamp[i / EVERY] = clampCurrent(this.cell, this.s);
      }
    }
    return { vm, iClamp };
  }
  /** One sweep: a step of `amp` for `stepMs`, then `restMs` of recovery at the holding current. Spike times in the step, ms. */
  sweep(amp: number, stepMs: number, restMs: number, ou?: OU): number[] {
    const { vm } = this.run(stepMs, amp, { record: true, ou });
    const spikes = detectSpikes(vm, this.dt * EVERY).map((x) => x.t);
    if (restMs > 0) this.run(restMs, 0);
    return spikes;
  }
}

export interface RestMeasures {
  /** resting potential, mV: the steady-state I–V's zero, and where the rig settled */
  vRest: number;
  vSettled: number;
  /** spikes per second at 0 pA over 2 s after settling: nonzero means there is no rest */
  spontaneousHz: number;
  /** input resistance, MΩ: slope of the steady-state I–V at rest */
  rinSlope: number;
  /** from a −2 pA, 3 s step in current clamp, at its end */
  rinCC: number;
  /** from a −20 pA, 3 s step in current clamp, at its end: the size Mendonça used (−20 to −40 pA) */
  rinCC20: number;
  /** from a −2 mV, 3 s step in voltage clamp, at 10 ms (before the slow gates move) and at its end */
  rinVCearly: number;
  rinVC: number;
  /** total open conductance at rest, nS (leak plus every open channel), and what the dynamic clamp contributes to it */
  gOpen: number;
  gOpenClamp: number;
  /** what the model's leak parameter alone would predict, MΩ */
  rinFromLeak: number;
  /** steady current the clamp passes at rest, pA */
  iClampRest: number;
}

export function measureRest(cell: BuiltCell, hold = 0): RestMeasures {
  const rig = new Rig(cell, hold);
  const vSettled = rig.v;
  const s0 = Float64Array.from(rig.s);
  const spont = rig.sweep(0, 2000, 0).length / 2;
  let gClamp = 0;
  for (let k = cell.nOwn; k < cell.channels.length; k++) gClamp += cell.gbar[k] * cell.channels[k].open(s0, cell.offsets[k], s0[cell.iCa]);
  const cc = (amp: number) => {
    rig.s = Float64Array.from(s0);
    rig.run(3000, amp);
    return ((rig.v - vSettled) / amp) * 1000;
  };
  // voltage clamp from the settled state, ideal (no series resistance)
  const s = Float64Array.from(s0);
  const dV = -2;
  let i0 = 0;
  for (let i = 0; i < 100; i++) i0 = stepVC(cell, s, vSettled, 0, hold, DT, NO_SYN);
  let early = NaN, late = NaN;
  const n = Math.round(3000 / DT);
  for (let i = 1; i <= n; i++) {
    const iNow = stepVC(cell, s, vSettled + dV, 0, hold, DT, NO_SYN);
    if (i === Math.round(10 / DT)) early = iNow;
    late = iNow;
  }
  return {
    vRest: cell.vRest,
    vSettled,
    spontaneousHz: spont,
    rinSlope: cell.rinRest,
    rinCC: cc(-2),
    rinCC20: cc(-20),
    rinVCearly: (dV / (early - i0)) * 1000,
    rinVC: (dV / (late - i0)) * 1000,
    gOpen: openConductance(cell, s0),
    gOpenClamp: gClamp,
    rinFromLeak: 1000 / cell.gLeak,
    iClampRest: clampCurrent(cell, s0),
  };
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
/** CV of the interspike intervals of spike times (NaN with fewer than three spikes). */
export function cvIsi(t: number[]): number {
  if (t.length < 3) return NaN;
  const isi = t.slice(1).map((x, k) => x - t[k]);
  const m = mean(isi);
  return Math.sqrt(mean(isi.map((x) => (x - m) ** 2))) / m;
}

export interface FiringMeasures {
  /** the bias current, pA, and the potential the cell starts every sweep from, mV */
  hold: number;
  vStart: number;
  /** least 2 s step that fires, pA, to 0.1 pA (NaN: fires with no step, or not below 200 pA) */
  rheobase: number;
  /** f–I: 5 s steps */
  fi: { amp: number; rate: number; latency: number; cv: number }[];
  /** the step that gives 10 Hz over 5 s, pA, and the rate it gave */
  amp10: number;
  rate10: number;
  /** CV of the ISIs of a 10 s step at amp10, noise off: all intervals, and those after the first second */
  cv10: number;
  cv10late: number;
  /** the same with membrane noise on (NOISE): mean and SD over NOISE_SEEDS runs, and the rate it then fired at */
  cv10noise: number;
  cv10noiseSd: number;
  rate10noise: number;
}

export const FI_AMPS = [5, 10, 15, 20, 30, 40, 60];
export const NOISE_SEEDS = 6;
const RECOVER = 5000;

export function measureFiring(cell: BuiltCell, hold: number): FiringMeasures {
  const rig = new Rig(cell, hold);
  const vStart = rig.v;
  // rheobase, 2 s steps
  let rheobase = NaN;
  if (rig.sweep(0, 2000, RECOVER).length === 0) {
    let lo = 0, hi = 200;
    if (rig.sweep(hi, 2000, RECOVER).length > 0) {
      while (hi - lo > 0.1) {
        const mid = 0.5 * (lo + hi);
        if (rig.sweep(mid, 2000, RECOVER).length > 0) hi = mid;
        else lo = mid;
      }
      rheobase = hi;
    }
  }
  const rateOf = (amp: number) => rig.sweep(amp, 5000, RECOVER).length / 5;
  const fi = FI_AMPS.map((amp) => {
    const t = rig.sweep(amp, 5000, RECOVER);
    return { amp, rate: t.length / 5, latency: t.length ? t[0] : NaN, cv: cvIsi(t) };
  });
  // the step that gives 10 Hz, bracketed by the f–I curve (far above it the cell stops firing: depolarization block)
  const above = fi.findIndex((x) => x.rate >= 10);
  let amp10 = NaN, rate10 = NaN;
  if (above >= 0) {
    let lo = above > 0 ? fi[above - 1].amp : Number.isFinite(rheobase) ? Math.min(rheobase, fi[0].amp) : 0;
    let hi = fi[above].amp;
    amp10 = hi;
    rate10 = fi[above].rate;
    for (let it = 0; it < 14 && Math.abs(rate10 - 10) > 0.2; it++) {
      const mid = 0.5 * (lo + hi);
      const r = rateOf(mid);
      amp10 = mid;
      rate10 = r;
      if (r > 10) hi = mid;
      else lo = mid;
    }
  }
  let cv10 = NaN, cv10late = NaN, cv10noise = NaN, cv10noiseSd = NaN, rate10noise = NaN;
  if (Number.isFinite(amp10)) {
    const t = rig.sweep(amp10, 10000, RECOVER);
    cv10 = cvIsi(t);
    cv10late = cvIsi(t.filter((x) => x >= 1000));
    const cvs: number[] = [], rates: number[] = [];
    for (let seed = 1; seed <= NOISE_SEEDS; seed++) {
      const tn = rig.sweep(amp10, 10000, RECOVER, new OU(NOISE.sigma, NOISE.tau, DT, 7919 * seed + 11));
      cvs.push(cvIsi(tn));
      rates.push(tn.length / 10);
    }
    const ok = cvs.filter(Number.isFinite);
    cv10noise = mean(ok);
    cv10noiseSd = Math.sqrt(mean(ok.map((x) => (x - cv10noise) ** 2)));
    rate10noise = mean(rates);
  }
  return { hold, vStart, rheobase, fi, amp10, rate10, cv10, cv10late, cv10noise, cv10noiseSd, rate10noise };
}

/**
 * What the last sweep leaves behind: spike counts of a 5 s step family, each sweep started from the settled
 * cell ("fresh"), against the same family run in sequence with `intervalMs` of recovery between sweeps.
 */
export function carryOver(cell: BuiltCell, amps: number[], intervalMs: number): { amp: number; fresh: number; inSequence: number }[] {
  const seq = new Rig(cell);
  return amps.map((amp) => ({ amp, fresh: new Rig(cell).sweep(amp, 5000, 0).length, inSequence: seq.sweep(amp, 5000, intervalMs).length }));
}

/**
 * The arithmetic for a passive cell with Mendonça's mean properties (1.34 GΩ, rest −67.4 mV, 33.7 pF): a leak
 * G0 reversing at rest, plus the Kv4 injection. Rest solves G0·(V − E0) + ḡ·w(V)·(V − E_K) = 0, and input
 * resistance is 1/(dI/dV) there. No active currents: this is the least the injection can do to such a cell.
 */
export function passiveMendonca(dosePerPf: number, rinGOhm = 1.34, e0 = -67.4, cmPf = 33.7): { gmax0: number; gbar: number; vRest: number; rin: number; gAdded: number; stable: boolean } {
  const g0 = 1 / rinGOhm;
  const gmax0 = dosePerPf * cmPf;
  const gbar = gmax0 / kv4PeakFraction();
  const i = (v: number) => g0 * (v - e0) + gbar * kv4Window(v) * (v - KV4.eK);
  // nearest zero to e0 with positive slope
  let v = e0;
  for (let it = 0; it < 200; it++) {
    const d = (i(v + 1e-3) - i(v - 1e-3)) / 2e-3;
    const nv = v - i(v) / d;
    if (Math.abs(nv - v) < 1e-10) break;
    v = Math.abs(nv - v) > 5 ? v + 5 * Math.sign(nv - v) : nv;
  }
  const slope = (i(v + 1e-3) - i(v - 1e-3)) / 2e-3;
  return { gmax0, gbar, vRest: v, rin: 1000 / slope, gAdded: slope - g0, stable: slope > 0 && Math.abs(i(v)) < 1e-6 };
}

export interface DoseResult {
  host: string;
  dosePerPf: number;
  gmax0: number;
  gbar: number;
  conds: Record<string, { linAt: number; linAtOwnRest: boolean; inject: { id: string; g: number; erev: number }[]; rest: RestMeasures; own: FiringMeasures | null; matched: FiringMeasures | null }>;
}

/** Every measure for one dose (0 = the control alone). */
export function runDose(hostKey: string, dosePerPf: number, firing = true): DoseResult {
  const host = HOSTS[hostKey];
  const vRef = buildCell(baseParams(host), host).vRest;
  const out: DoseResult = { host: hostKey, dosePerPf, gmax0: dosePerPf * host.defaults.cm, gbar: (dosePerPf * host.defaults.cm) / kv4PeakFraction(), conds: {} };
  for (const cond of dosePerPf === 0 ? (["control"] as Cond[]) : CONDS) {
    const b = buildCond(host, dosePerPf, cond);
    const rest = measureRest(b.cell);
    const hold = cellHoldAt(b.cell, vRef);
    // a cell with no rest of its own is only measured held at the control's
    const hasRest = rest.spontaneousHz === 0 && Math.abs(rest.vSettled - vRef) < 15;
    const same = Math.abs(hold) < 1e-6;
    out.conds[cond] = {
      linAt: b.linAt,
      linAtOwnRest: b.linAtOwnRest,
      inject: b.inject.map((x) => ({ id: x.channel.id, g: x.g, erev: x.erev })),
      rest,
      own: firing && hasRest ? measureFiring(b.cell, 0) : null,
      matched: firing && !same ? measureFiring(b.cell, hold) : null,
    };
  }
  return out;
}

const TRACE_EVERY = 5;
/** Example traces for the take-home: Vm, command current and the clamp's current at 10 kHz, with what made them. */
export function exportTraces(hostKey: string, dosePerPf: number, outDir: string): void {
  const host = HOSTS[hostKey];
  const vRef = buildCell(baseParams(host), host).vRest;
  mkdirSync(outDir, { recursive: true });
  const manifest: unknown[] = [];
  for (const cond of ["control", ...CONDS] as Cond[]) {
    const b = buildCond(host, cond === "control" ? 0 : dosePerPf, cond);
    for (const start of ["own", "matched"] as const) {
      const hold = start === "own" ? 0 : cellHoldAt(b.cell, vRef);
      if (start === "matched" && Math.abs(hold) < 1e-6) continue;
      const f = measureFiring(b.cell, hold);
      if (!Number.isFinite(f.amp10)) continue;
      for (const noise of [false, true]) {
        const rig = new Rig(b.cell, hold);
        const pre = rig.run(500, 0, { record: true, clamp: true });
        const on = rig.run(10000, f.amp10, { record: true, clamp: true, ou: noise ? new OU(NOISE.sigma, NOISE.tau, DT, 7919 + 11) : undefined });
        const post = rig.run(1000, 0, { record: true, clamp: true });
        // written every 5th kept sample: 0.1 ms (10 kHz), decimated without filtering, which keeps the files readable
        const name = `trace_${hostKey}_${cond}_${start}_${noise ? "noise" : "quiet"}.csv`;
        const rows = ["t_ms,vm_mV,i_cmd_pA,i_clamp_pA"];
        let n = 0;
        const push = (seg: { vm: Float32Array; iClamp: Float32Array }, amp: number, first: boolean) => {
          for (let k = first ? 0 : 1; k < seg.vm.length; k++, n++) {
            if (n % TRACE_EVERY === 0) rows.push(`${(n * DT * EVERY).toFixed(2)},${seg.vm[k].toFixed(3)},${(hold + amp).toFixed(3)},${seg.iClamp[k].toFixed(4)}`);
          }
        };
        push(pre, 0, true);
        push(on, f.amp10, false);
        push(post, 0, false);
        writeFileSync(`${outDir}/${name}`, rows.join("\n") + "\n");
        manifest.push({
          file: name, host: host.label, condition: cond, start, dose_nS_per_pF: cond === "control" ? 0 : dosePerPf,
          injected: b.inject.map((x) => ({ id: x.channel.id, g_nS: x.g, erev_mV: x.erev })),
          hold_pA: hold, step_pA: f.amp10, step_on_ms: 500, step_off_ms: 10500,
          sample_interval_ms: DT * EVERY * TRACE_EVERY, integration_dt_ms: DT,
          membrane_noise: noise ? { kind: "Ornstein-Uhlenbeck current at the membrane", sigma_pA: NOISE.sigma, tau_ms: NOISE.tau, seed: 7919 + 11 } : null,
          recording: "true membrane potential: no electrode, no recording noise, no filter",
          columns: { t_ms: "time", vm_mV: "membrane potential", i_cmd_pA: "bias plus step current", i_clamp_pA: "current passed by the dynamic clamp, outward positive" },
        });
      }
    }
  }
  writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k: string) => {
    const i = process.argv.indexOf(k);
    return i < 0 ? undefined : process.argv[i + 1];
  };
  const hostKey = arg("--host") ?? "ovx";
  if (process.argv.includes("--rest")) {
    const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "—");
    console.log(`host ${HOSTS[hostKey].label}; Kv4 peak fraction at 0 mV from ${KV4.vPre} mV: ${kv4PeakFraction().toFixed(4)}`);
    console.log("dose  cond         Vrest   Rin(slope) Rin(CC −2pA) Rin(CC −20pA) Rin(VC 10ms) Rin(VC 3s)  g_open  g_clamp  spont");
    for (const d of [0, ...DOSES]) {
      const r = runDose(hostKey, d, false);
      for (const [c, x] of Object.entries(r.conds)) {
        const m = x.rest;
        console.log(`${String(d).padStart(5)} ${c.padEnd(12)} ${f(m.vSettled, 2).padStart(7)} ${f(m.rinSlope, 0).padStart(9)} ${f(m.rinCC, 0).padStart(11)} ${f(m.rinCC20, 0).padStart(12)} ${f(m.rinVCearly, 0).padStart(12)} ${f(m.rinVC, 0).padStart(10)} ${f(m.gOpen, 2).padStart(8)} ${f(m.gOpenClamp, 3).padStart(8)} ${f(m.spontaneousHz, 1).padStart(6)}`);
      }
    }
    console.log("\na passive cell with Mendonça's mean properties (1.34 GΩ, −67.4 mV, 33.7 pF):");
    for (const d of [0, ...DOSES]) {
      const p = passiveMendonca(d);
      console.log(`${String(d).padStart(5)} nS/pF = ${f(p.gmax0, 2).padStart(6)} nS at 0 mV: rest ${f(p.vRest, 2)} mV, Rin ${p.stable ? f(p.rin, 0) : "no stable rest"} MΩ, slope conductance added ${f(p.gAdded, 3)} nS`);
    }
  } else if (arg("--dose") !== undefined) {
    console.log(JSON.stringify(runDose(hostKey, Number(arg("--dose")))));
  } else if (arg("--traces")) {
    exportTraces(hostKey, Number(arg("--at") ?? 0.2), arg("--traces")!);
  } else if (arg("--all")) {
    const out = arg("--all")!;
    mkdirSync(out, { recursive: true });
    const jobs = [0, ...DOSES];
    let running = 0, next = 0;
    const launch = () => {
      while (running < 8 && next < jobs.length) {
        const d = jobs[next++];
        running++;
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--host", hostKey, "--dose", String(d)]);
        let buf = "";
        child.stdout.on("data", (x) => (buf += x));
        child.stderr.on("data", (x) => process.stderr.write(x));
        child.on("close", (code) => {
          running--;
          if (code === 0) writeFileSync(`${out}/dose_${hostKey}_${d}.json`, buf);
          console.log(`dose ${d}: ${code === 0 ? "done" : `FAILED (${code})`}`);
          launch();
        });
      }
    };
    launch();
  } else {
    console.log("usage: node tools/experiments/kv4_leak.ts [--host ovx|e2] (--rest | --dose x | --all outdir | --traces outdir [--at dose])");
  }
}
