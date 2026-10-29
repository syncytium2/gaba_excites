/**
 * Current-clamp simulation of one sweep, or a family of them.
 *
 * The recording circuit:
 *
 *      I_cmd ──►  pipette node P ──[ Rs ]──► cell V ──[ membrane: Cm, leak, channels, synapses ]──► ground
 *                     │
 *                    Cp  (pipette capacitance to ground)
 *
 * An ideal current source drives the pipette node. In steady state every pA
 * of I_cmd reaches the cell, so Rs does not change Vm at all — what it
 * changes is the RECORDED voltage, which is taken at P: an offset of
 * I_cmd·Rs (the bridge error) and, through Cp, a low-pass on fast events.
 * Bridge balance subtracts a fraction of I_cmd·Rs from the record, as the
 * amplifier does. With Cp = 0 the pipette node is algebraic and Vm is
 * exactly unaffected by Rs.
 *
 * Integration, in NEURON's order: the linear V/P system by backward Euler
 * with the conductances frozen over the step, then the gates by Rush–Larsen
 * at the new V (exact for fixed V, as NEURON's hh2 mechanism does). This is
 * NEURON's default fixed-step scheme, and src/core/oracle.test.ts holds the
 * port to NEURON's spike times. Backward Euler is unconditionally
 * stable, which matters because Rs·Cp can be far shorter than dt.
 */

import { cellCaSteady, type BuiltCell } from "./cell.ts";
import { eventTimes, kinetics, type SynInput } from "./synapses.ts";
import { DEFAULT_NOISE, OU, Recorder, type NoiseParams } from "./noise.ts";

export interface Electrode {
  /** series (access) resistance, MΩ */
  rs: number;
  /** pipette capacitance to ground, after any neutralization, pF */
  cp: number;
  /** bridge balance, 0..1 of Rs subtracted from the record */
  bridge: number;
}

export const DEFAULT_ELECTRODE: Electrode = { rs: 15, cp: 0, bridge: 1 };

export interface StepProtocol {
  /** sweep length, ms */
  sweepMs: number;
  /** step onset and duration, ms */
  stepStart: number;
  stepDur: number;
  /** step amplitudes in pA, one sweep each */
  amps: number[];
}

export interface SimOptions {
  /** integration step, ms */
  dt: number;
  /** sample interval of the stored trace, ms (a multiple of dt) */
  sampleMs: number;
  /** settling time at Ihold before each run, ms (no synaptic input, no noise); default: the model's */
  settleMs?: number;
  seed: number;
}

// 40 kHz storage: a 0.7 ms spike gets ~28 samples, enough for the phase plot and
// for the 20 V/s threshold walk-back. dt = 0.01 ms because the NEURON comparison
// (oracle.test.ts) shows 0.025 ms drifting by several ms over a second of firing.
export const DEFAULT_SIM: SimOptions = { dt: 0.01, sampleMs: 0.025, seed: 1 };

export interface Inputs {
  ihold: number;
  electrode: Electrode;
  glu: SynInput;
  gaba: SynInput;
  /** optional so that callers written before noise existed still mean "no noise" */
  noise?: NoiseParams;
}

export interface Sweep {
  amp: number;
  /** sample interval, ms */
  sampleMs: number;
  /** recorded voltage at the pipette, after bridge balance — what the amplifier shows */
  vRec: Float32Array;
  /** true membrane potential */
  vm: Float32Array;
  /** command current, pA */
  iCmd: Float32Array;
  /** synaptic conductances, nS */
  gGlu: Float32Array;
  gGaba: Float32Array;
  gluTimes: number[];
  gabaTimes: number[];
}

/** Settle the cell at a constant injected current and return the state (gates, Ca, V, P, the pool's extra state). */
export function settle(cell: BuiltCell, e: Electrode, ihold: number, ms: number, dt: number): Float64Array {
  const s = new Float64Array(cell.nState);
  // Start from the steady state if there is one; the run below then only has
  // to finish the job (and to find the limit cycle, if Ihold makes it fire).
  let v0 = cell.vRest;
  if (!Number.isFinite(v0)) v0 = cell.eLeak;
  const ca0 = cellCaSteady(cell, v0);
  for (let k = 0; k < cell.channels.length; k++) cell.channels[k].init(v0, s, cell.offsets[k], ca0);
  s[cell.iCa] = ca0;
  cell.pool?.initExtra?.(ca0, s, cell.ix);
  s[cell.iv] = v0;
  const st = cell.model.start;
  if (st) {
    s[cell.iv] = st.v;
    s[cell.iCa] = st.ca;
    for (let k = 0; k < cell.channels.length; k++) {
      const g = st.gates?.[cell.channels[k].id];
      if (g) for (let j = 0; j < g.length; j++) s[cell.offsets[k] + j] = g[j];
    }
    st.extra?.forEach((x, j) => (s[cell.ix + j] = x));
  }
  s[cell.ip] = s[cell.iv] + ihold * e.rs * 1e-3;
  const n = Math.round(ms / dt);
  const noSyn = { gGlu: 0, gGaba: 0, eGlu: 0, eGaba: 0 };
  for (let i = 0; i < n; i++) step(cell, e, s, ihold, 0, dt, noSyn);
  return s;
}

export interface SynNow {
  gGlu: number;
  gGaba: number;
  eGlu: number;
  eGaba: number;
}

/**
 * One integration step, in place. `iCmd` enters through the pipette; `iMem`
 * (membrane noise) is injected at the membrane itself, so it never produces
 * a bridge error. Exported so that the oscilloscope's stream (stream.ts)
 * integrates with exactly this code, not a copy of it.
 */
export function step(cell: BuiltCell, e: Electrode, s: Float64Array, iCmd: number, iMem: number, dt: number, syn: SynNow): void {
  const iv = cell.iv;
  const v0 = s[iv];
  const p0 = s[iv + 1];
  const ca = s[cell.iCa];

  let G = cell.gLeak + syn.gGlu + syn.gGaba;
  let GE = cell.gLeak * cell.eLeak + syn.gGlu * syn.eGlu + syn.gGaba * syn.eGaba + iMem;
  let iCa0 = 0; // calcium current at the start of the step, for a pool that reads it there
  for (let k = 0; k < cell.channels.length; k++) {
    const g = cell.gbar[k] * cell.channels[k].open(s, cell.offsets[k], ca);
    const f = cell.erevCa[k];
    const er = f ? f(ca) : cell.erev[k];
    G += g;
    GE += g * er;
    if (cell.carriesCa[k]) iCa0 += g * (v0 - er);
  }

  const cdt = cell.params.cm / dt;
  if (e.cp <= 0 || e.rs <= 0) {
    // Pipette node is algebraic: all of I_cmd enters the cell.
    const cTot = e.rs <= 0 ? cdt + Math.max(e.cp, 0) / dt : cdt;
    const v1 = (cTot * v0 + GE + iCmd) / (cTot + G);
    s[iv] = v1;
    s[iv + 1] = v1 + iCmd * e.rs * 1e-3;
    advanceGates(cell, s, v1, dt, iCa0);
    return;
  }
  // [ cdt + G + ge   −ge       ] [V1]   [ cdt·V0 + GE ]
  // [ −ge            pdt + ge  ] [P1] = [ pdt·P0 + I  ]
  const ge = 1000 / e.rs; // nS
  const pdt = e.cp / dt;
  const a11 = cdt + G + ge;
  const a22 = pdt + ge;
  const b1 = cdt * v0 + GE;
  const b2 = pdt * p0 + iCmd;
  const det = a11 * a22 - ge * ge;
  s[iv] = (b1 * a22 + ge * b2) / det;
  s[iv + 1] = (a11 * b2 + ge * b1) / det;
  advanceGates(cell, s, s[iv], dt, iCa0);
}

/**
 * One voltage-clamp step, in place: the same cell, conductances and gate
 * order as `step`, with the pipette held at `vCmd` instead of driven by a
 * current. The cell sits behind Rs (MΩ):
 *
 *     amplifier holds P at V_cmd ──[ Rs ]──► cell V ──[ membrane ]──► ground
 *
 * so Cm dV/dt = (V_cmd − V)/Rs − I_membrane, by backward Euler with the
 * conductances frozen over the step, as in current clamp. The pipette
 * capacitance is taken as fully compensated (the amplifier's fast
 * capacitance neutralization), so it draws nothing here. With rs = 0 the
 * clamp is ideal: V = V_cmd, and the current includes Cm·ΔV/dt at each
 * command step, a one-step capacitive spike.
 *
 * Returns the current the amplifier passes into the cell, pA, at the end of
 * the step: what a voltage-clamp amplifier records. A net outward membrane
 * current is positive, by the usual convention.
 */
export function stepVC(cell: BuiltCell, s: Float64Array, vCmd: number, rs: number, iMem: number, dt: number, syn: SynNow): number {
  const iv = cell.iv;
  const v0 = s[iv];
  const ca = s[cell.iCa];
  let G = cell.gLeak + syn.gGlu + syn.gGaba;
  let GE = cell.gLeak * cell.eLeak + syn.gGlu * syn.eGlu + syn.gGaba * syn.eGaba + iMem;
  let iCa0 = 0;
  for (let k = 0; k < cell.channels.length; k++) {
    const g = cell.gbar[k] * cell.channels[k].open(s, cell.offsets[k], ca);
    const f = cell.erevCa[k];
    const er = f ? f(ca) : cell.erev[k];
    G += g;
    GE += g * er;
    if (cell.carriesCa[k]) iCa0 += g * (v0 - er);
  }
  const cdt = cell.params.cm / dt;
  let v1: number;
  let iIn: number;
  if (rs <= 0) {
    v1 = vCmd;
    iIn = cdt * (v1 - v0) + G * v1 - GE;
  } else {
    const ge = 1000 / rs; // nS
    v1 = (cdt * v0 + GE + ge * vCmd) / (cdt + G + ge);
    iIn = ge * (vCmd - v1);
  }
  s[iv] = v1;
  s[iv + 1] = vCmd;
  advanceGates(cell, s, v1, dt, iCa0);
  return iIn;
}

/**
 * Gates move after V, at the new V — NEURON's order (fadvance: solve V, then
 * nrn_state). Then calcium, by the model's pool (pools.ts), from the calcium
 * current it reads: the one at the start of the step (`iCa0`, NEURON's
 * order) or the one at the new V and gates.
 */
function advanceGates(cell: BuiltCell, s: Float64Array, v: number, dt: number, iCa0: number): void {
  const ca = s[cell.iCa];
  for (let k = 0; k < cell.channels.length; k++) cell.channels[k].advance(v, dt, s, cell.offsets[k], ca);
  const pool = cell.pool;
  if (!pool) return;
  let iCa = iCa0;
  if (pool.reads === "after") {
    iCa = 0;
    for (let k = 0; k < cell.channels.length; k++) {
      if (!cell.carriesCa[k]) continue;
      const f = cell.erevCa[k];
      iCa += cell.gbar[k] * cell.channels[k].open(s, cell.offsets[k], ca) * (v - (f ? f(ca) : cell.erev[k]));
    }
  }
  s[cell.iCa] = pool.advance(ca, iCa, cell.params.cm, dt, s, cell.ix);
}

/** Run one sweep from a settled state. */
export function runSweep(
  cell: BuiltCell,
  inp: Inputs,
  proto: StepProtocol,
  amp: number,
  settled: Float64Array,
  opt: SimOptions,
  sweepIndex: number,
): Sweep {
  const { dt } = opt;
  const e = inp.electrode;
  const s = Float64Array.from(settled);
  const iv = cell.iv;
  const noise = inp.noise ?? DEFAULT_NOISE;
  // membrane noise: its own seed stream, per sweep, independent of the PSCs'
  const ou = noise.memSigma > 0 ? new OU(noise.memSigma, noise.memTau, dt, opt.seed * 104729 + sweepIndex * 3 + 7) : null;
  const nSteps = Math.round(proto.sweepMs / dt);
  const every = Math.max(1, Math.round(opt.sampleMs / dt));
  const nOut = Math.floor(nSteps / every) + 1;

  const vRec = new Float32Array(nOut);
  const vm = new Float32Array(nOut);
  const iOut = new Float32Array(nOut);
  const gGluOut = new Float32Array(nOut);
  const gGabaOut = new Float32Array(nOut);

  // Seeds differ by input and by sweep, and do not depend on any other
  // parameter, so changing the leak re-runs the SAME synaptic barrage.
  const gluTimes = eventTimes(inp.glu, proto.sweepMs, opt.seed * 7919 + sweepIndex * 2 + 1);
  const gabaTimes = eventTimes(inp.gaba, proto.sweepMs, opt.seed * 7919 + sweepIndex * 2 + 2);
  const kGlu = kinetics(inp.glu, dt);
  const kGaba = kinetics(inp.gaba, dt);
  let aGlu = 0, bGlu = 0, aGaba = 0, bGaba = 0;
  let jGlu = 0, jGaba = 0;

  const tOn = proto.stepStart;
  const tOff = proto.stepStart + proto.stepDur;
  const bridgeRs = e.bridge * e.rs * 1e-3;
  const syn: SynNow = { gGlu: 0, gGaba: 0, eGlu: inp.glu.erev, eGaba: inp.gaba.erev };

  // the amplifier: noise, hum and its filter, fed every integration step (noise.ts, filter.ts)
  const rec = new Recorder(noise, dt, opt.seed * 15485863 + sweepIndex * 5 + 11);
  const record = (j: number, iCmd: number, v: number) => {
    vm[j] = s[iv];
    vRec[j] = v;
    iOut[j] = iCmd;
    gGluOut[j] = syn.gGlu;
    gGabaOut[j] = syn.gGaba;
  };
  // the first sample is the settled cell under the command in force before the sweep (the holding current),
  // so a step that starts at 0 ms does not make sample 0 jump by the whole bridge error
  record(0, inp.ihold + (0 >= tOn && 0 < tOff ? amp : 0), rec.start(s[iv + 1] - bridgeRs * inp.ihold));

  for (let i = 1; i <= nSteps; i++) {
    const t = i * dt;
    // synaptic state at t: decay, then add events that arrived in (t−dt, t]
    aGlu *= kGlu.decayA;
    bGlu *= kGlu.decayB;
    while (jGlu < gluTimes.length && gluTimes[jGlu] <= t) {
      aGlu += kGlu.jump;
      if (!kGlu.single) bGlu += kGlu.jump;
      jGlu++;
    }
    aGaba *= kGaba.decayA;
    bGaba *= kGaba.decayB;
    while (jGaba < gabaTimes.length && gabaTimes[jGaba] <= t) {
      aGaba += kGaba.jump;
      if (!kGaba.single) bGaba += kGaba.jump;
      jGaba++;
    }
    syn.gGlu = aGlu - bGlu;
    syn.gGaba = aGaba - bGaba;

    const iCmd = inp.ihold + (t >= tOn && t < tOff ? amp : 0);
    step(cell, e, s, iCmd, ou ? ou.next() : 0, dt, syn);
    const v = rec.next(s[iv + 1] - bridgeRs * iCmd);
    if (i % every === 0) record(i / every, iCmd, v);
  }

  return { amp, sampleMs: dt * every, vRec, vm, iCmd: iOut, gGlu: gGluOut, gGaba: gGabaOut, gluTimes, gabaTimes };
}

/** Settle once, then run every sweep of the protocol from the same settled state. */
export function runFamily(cell: BuiltCell, inp: Inputs, proto: StepProtocol, opt: SimOptions = DEFAULT_SIM): Sweep[] {
  const settled = settle(cell, inp.electrode, inp.ihold, opt.settleMs ?? cell.model.settleMs, opt.dt);
  return proto.amps.map((amp, k) => runSweep(cell, inp, proto, amp, settled, opt, k));
}
