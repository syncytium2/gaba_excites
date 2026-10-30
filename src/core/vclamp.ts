/**
 * Voltage clamp: protocols, sweeps, and the measurements an experimenter
 * makes on them. The cell, channels and integrator are the current-clamp
 * ones; only the circuit differs (simulate.ts, stepVC): the amplifier holds
 * the pipette at the command and the cell sits behind Rs.
 *
 * Nothing here knows any channel's kinetics. Activation and inactivation
 * curves are not drawn from the model: they exist only once a protocol has
 * been run and the experimenter has said where to measure (the owner's
 * choice, 2026-10-29), as on a rig.
 *
 * What is measured is the RECORDED current (filtered, with noise). The true
 * membrane current and the cell's true Vm are kept alongside, so the app can
 * show them behind the record and plot an I–V against true Vm as well as
 * against the command: with Rs in the loop the cell is not at the command,
 * and that difference is the lesson.
 *
 * Units: mV, ms, pA, MΩ.
 */

import type { BuiltCell } from "./cell.ts";
import { stepVC, type SynNow } from "./simulate.ts";
import { DEFAULT_NOISE, OU, Recorder, type NoiseParams } from "./noise.ts";
import { eventTimes, kinetics, type SynInput } from "./synapses.ts";

// ---------------------------------------------------------------- protocols

export interface VCSegment {
  /** duration, ms */
  dur: number;
  /** command potential, mV */
  v: number;
}

/** Which segment changes from sweep to sweep, and how: its potential or its duration. */
export interface VCVary {
  seg: number;
  what: "v" | "dur";
  first: number;
  delta: number;
  count: number;
}

/**
 * A voltage-clamp protocol: the holding potential (where the cell settles, and
 * where each sweep starts and ends), a list of segments, and one segment that
 * varies across the family. A list of segments covers the standard protocols:
 * a test step (I–V, activation), a prepulse then a test (steady-state
 * inactivation), a step then a family of tails (deactivation, reversal), two
 * pulses at varied intervals (recovery from inactivation).
 */
export interface VCProtocol {
  hold: number;
  segments: VCSegment[];
  vary: VCVary;
}

/** The varied value of sweep k. */
export function variedValue(p: VCProtocol, k: number): number {
  // rounded to 1e-6, so 0.2 + 0.4·k reads 0.6, not 0.6000000000000001
  return Math.round((p.vary.first + k * p.vary.delta) * 1e6) / 1e6;
}

/** The segments of sweep k, with the varied one set. */
export function sweepSegments(p: VCProtocol, k: number): VCSegment[] {
  return p.segments.map((s, i) => (i !== p.vary.seg ? s : p.vary.what === "v" ? { ...s, v: variedValue(p, k) } : { ...s, dur: Math.max(0, variedValue(p, k)) }));
}

/** Start time of each segment of sweep k, ms, and the sweep's length. */
export function segmentStarts(p: VCProtocol, k: number): { starts: number[]; total: number } {
  const starts: number[] = [];
  let t = 0;
  for (const s of sweepSegments(p, k)) {
    starts.push(t);
    t += s.dur;
  }
  return { starts, total: t };
}

/** The command at time t (ms) in sweep k: the segment it falls in, or the holding potential after the last. */
export function commandAt(segs: VCSegment[], starts: number[], hold: number, t: number): number {
  for (let i = segs.length - 1; i >= 0; i--) if (t >= starts[i]) return t < starts[i] + segs[i].dur ? segs[i].v : hold;
  return hold;
}

// ---------------------------------------------------------------- running

export interface VCInputs {
  /** series resistance, MΩ; 0 is an ideal clamp */
  rs: number;
  /** recording noise and filter, on the current: recSigma and humAmp in pA */
  noise?: NoiseParams;
  glu: SynInput;
  gaba: SynInput;
}

export interface VCOptions {
  dt: number;
  sampleMs: number;
  /** settle at the holding potential before each run, ms; default the model's */
  settleMs?: number;
  seed: number;
}

/**
 * 0.01 ms, the current-clamp step. Every step is stored (100 kHz; it was
 * every second step until 2026-10-30), so a sample's time is what it says and
 * the fast sodium peaks, 0.1–0.2 ms into a step on the GnRH cell, are not
 * missed between samples. It costs memory, not simulation time.
 */
export const VC_SIM: VCOptions = { dt: 0.01, sampleMs: 0.01, seed: 1 };

export interface VCSweep {
  /** the varied value: mV, or ms when a duration varies */
  value: number;
  sampleMs: number;
  /** recorded current, pA: through the amplifier's filter, with its noise */
  iRec: Float32Array;
  /** the current the amplifier passed, unfiltered and noise-free, pA */
  iTrue: Float32Array;
  /** the cell's true membrane potential, mV */
  vm: Float32Array;
  /** the command, mV */
  vCmd: Float32Array;
  /** segment start times, ms */
  starts: number[];
}

const NO_SYN: SynNow = { gGlu: 0, gGaba: 0, eGlu: 0, eGaba: 0 };

/** Settle the cell clamped at `hold` and return its state. */
export function settleVC(cell: BuiltCell, hold: number, rs: number, ms: number, dt: number): Float64Array {
  const s = new Float64Array(cell.nState);
  const ca0 = cell.pool ? stepCaAt(cell, hold) : 0;
  for (let k = 0; k < cell.channels.length; k++) cell.channels[k].init(hold, s, cell.offsets[k], ca0);
  s[cell.iCa] = ca0;
  cell.pool?.initExtra?.(ca0, s, cell.ix);
  s[cell.iv] = hold;
  s[cell.ip] = hold;
  const n = Math.round(ms / dt);
  for (let i = 0; i < n; i++) stepVC(cell, s, hold, rs, 0, dt, NO_SYN);
  return s;
}

/** Steady calcium at a clamped potential, through the cell's own steady-state solve. */
function stepCaAt(cell: BuiltCell, v: number): number {
  // cell.ts's caSteady works on the cell's active set; a built cell carries the same fields
  const pool = cell.pool!;
  let ca = pool.steady(0, cell.cm);
  for (let it = 0; it < 50; it++) {
    let iCa = 0;
    for (let k = 0; k < cell.channels.length; k++) {
      if (!cell.carriesCa[k]) continue;
      const f = cell.erevCa[k];
      iCa += cell.gbar[k] * cell.channels[k].openInf(v, ca) * (v - (f ? f(ca) : cell.erev[k]));
    }
    const next = pool.steady(iCa, cell.cm);
    if (Math.abs(next - ca) < 1e-12 * (1 + ca)) return next;
    ca = next;
  }
  return ca;
}

/** One sweep of a protocol from a settled state. */
export function runVCSweep(cell: BuiltCell, inp: VCInputs, p: VCProtocol, k: number, settled: Float64Array, opt: VCOptions): VCSweep {
  const { dt } = opt;
  const s = Float64Array.from(settled);
  const segs = sweepSegments(p, k);
  const { starts, total } = segmentStarts(p, k);
  const nSteps = Math.round(total / dt);
  const every = Math.max(1, Math.round(opt.sampleMs / dt));
  const nOut = Math.floor(nSteps / every) + 1;
  const iRec = new Float32Array(nOut);
  const iTrue = new Float32Array(nOut);
  const vm = new Float32Array(nOut);
  const vCmd = new Float32Array(nOut);

  const noise = inp.noise ?? DEFAULT_NOISE;
  const rec = new Recorder(noise, dt, opt.seed * 15485863 + k * 5 + 11);
  const ou = noise.memSigma > 0 ? new OU(noise.memSigma, noise.memTau, dt, opt.seed * 104729 + k * 3 + 7) : null;
  const gluTimes = eventTimes(inp.glu, total, opt.seed * 7919 + k * 2 + 1);
  const gabaTimes = eventTimes(inp.gaba, total, opt.seed * 7919 + k * 2 + 2);
  const kGlu = kinetics(inp.glu, dt);
  const kGaba = kinetics(inp.gaba, dt);
  let aGlu = 0, bGlu = 0, aGaba = 0, bGaba = 0, jGlu = 0, jGaba = 0;
  const syn: SynNow = { gGlu: 0, gGaba: 0, eGlu: inp.glu.erev, eGaba: inp.gaba.erev };

  // sample 0: the settled cell at the holding potential, its holding current
  const i0 = stepCurrentAt(cell, s, p.hold, inp.rs);
  iRec[0] = rec.start(i0);
  iTrue[0] = i0;
  vm[0] = s[cell.iv];
  vCmd[0] = p.hold;
  for (let i = 1; i <= nSteps; i++) {
    const t = i * dt;
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
    // the command over (t − dt, t]: the segment the step ends in
    const v = commandAt(segs, starts, p.hold, t - dt / 2);
    const iIn = stepVC(cell, s, v, inp.rs, ou ? ou.next() : 0, dt, syn);
    const r = rec.next(iIn);
    if (i % every === 0) {
      const j = i / every;
      iRec[j] = r;
      iTrue[j] = iIn;
      vm[j] = s[cell.iv];
      vCmd[j] = v;
    }
  }
  return { value: variedValue(p, k), sampleMs: dt * every, iRec, iTrue, vm, vCmd, starts };
}

/** The steady current at the holding potential, from the settled state, without moving it. */
function stepCurrentAt(cell: BuiltCell, settled: Float64Array, hold: number, rs: number): number {
  const s = Float64Array.from(settled);
  return stepVC(cell, s, hold, rs, 0, 1e-6, NO_SYN);
}

/** Settle once at the holding potential, then run every sweep from that state. */
export function runVCFamily(cell: BuiltCell, inp: VCInputs, p: VCProtocol, opt: VCOptions = VC_SIM): VCSweep[] {
  const settled = settleVC(cell, p.hold, inp.rs, opt.settleMs ?? cell.model.settleMs, opt.dt);
  const out: VCSweep[] = [];
  for (let k = 0; k < p.vary.count; k++) out.push(runVCSweep(cell, inp, p, k, settled, opt));
  return out;
}

// ---------------------------------------------------------------- measuring

/**
 * Where and how to measure, chosen by the experimenter: a window relative to
 * the start of one segment, and what to take in it. Plain operations, named
 * for what they compute, so the student decides what each means: "peakIn" is
 * the minimum (the most negative current), "peakOut" the maximum, "peakAbs"
 * the value largest in magnitude with its sign kept, "mean" the mean over the
 * window, and "cursor" the value at the window's start. (The keys predate the
 * names; presets and saved state use them.)
 */
export interface VCMeasure {
  seg: number;
  /** window, ms from the segment's start */
  from: number;
  to: number;
  kind: "peakIn" | "peakOut" | "peakAbs" | "mean" | "cursor";
}

export interface VCPoint {
  /** the sweep's varied value */
  value: number;
  /** the command in the window, mV */
  vCmd: number;
  /** the measured current, pA */
  i: number;
  /** when it was taken, ms from the sweep's start */
  t: number;
  /** the cell's true Vm at that moment, mV */
  vm: number;
}

/**
 * How long the capacitive transient after a command step lasts in the recording, ms: five Rs·Cm
 * time constants (MΩ·pF = µs), never less than two stored samples, plus the filter's settling,
 * about one period of its corner (0.1 ms at 10 kHz; none when bypassed). With an ideal clamp
 * (Rs 0) the charge Cm·ΔV arrives in one integration step, and the filter spreads it.
 */
export function transientMs(rs: number, cm: number, sampleMs: number, filterKHz = 0): number {
  return Math.max(2 * sampleMs, (5 * rs * cm) / 1000) + (filterKHz > 0 ? 1 / filterKHz : 0);
}

/**
 * Artifact blanking, as an amplifier's sample-and-hold does it: for `ms` after each command step
 * the recorded current holds the value it had just before the step. The true current, Vm and the
 * command are untouched. A blank longer than the transient also hides what the channels do in it.
 */
export function blankSweep(sw: VCSweep, ms: number): VCSweep {
  const iRec = sw.iRec.slice();
  const dt = sw.sampleMs;
  for (const t of sw.starts) {
    if (t <= 0) continue;
    const a = Math.round(t / dt);
    if (a <= 0 || a >= iRec.length) continue;
    const held = iRec[a - 1];
    const b = Math.min(iRec.length - 1, Math.round((t + ms) / dt));
    for (let j = a; j <= b; j++) iRec[j] = held;
  }
  return { ...sw, iRec };
}

/** Measure one sweep on its recorded current. */
export function measureSweep(sw: VCSweep, m: VCMeasure): VCPoint {
  const t0 = (sw.starts[m.seg] ?? 0) + m.from;
  const t1 = (sw.starts[m.seg] ?? 0) + Math.max(m.from, m.to);
  const n = sw.iRec.length;
  const a = Math.min(n - 1, Math.max(0, Math.round(t0 / sw.sampleMs)));
  const b = Math.min(n - 1, Math.max(a, Math.round(t1 / sw.sampleMs)));
  let j = a;
  let i = sw.iRec[a];
  if (m.kind === "peakIn" || m.kind === "peakOut" || m.kind === "peakAbs") {
    for (let x = a; x <= b; x++) {
      const y = sw.iRec[x];
      if (m.kind === "peakIn" ? y < i : m.kind === "peakOut" ? y > i : Math.abs(y) > Math.abs(i)) {
        i = y;
        j = x;
      }
    }
  } else if (m.kind === "mean") {
    let sum = 0;
    let vs = 0;
    for (let x = a; x <= b; x++) {
      sum += sw.iRec[x];
      vs += sw.vm[x];
    }
    const cnt = b - a + 1;
    return { value: sw.value, vCmd: sw.vCmd[a], i: sum / cnt, t: ((a + b) / 2) * sw.sampleMs, vm: vs / cnt };
  }
  return { value: sw.value, vCmd: sw.vCmd[j], i, t: j * sw.sampleMs, vm: sw.vm[j] };
}

/**
 * Where y changes sign along x, by linear interpolation between the two points
 * that straddle zero (the first such pair, in order of x); NaN if it never
 * does. For a tail family this is the reversal potential of what was open.
 */
export function zeroCrossing(x: number[], y: number[]): number {
  const s = x.map((v, i) => [v, y[i]] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < s.length; i++) {
    const [x0, y0] = s[i - 1];
    const [x1, y1] = s[i];
    if (y0 === 0) return x0;
    if (Math.sign(y0) !== Math.sign(y1) && y1 !== y0) return x0 + ((0 - y0) / (y1 - y0)) * (x1 - x0);
  }
  return s.length && s[s.length - 1][1] === 0 ? s[s.length - 1][0] : NaN;
}

/**
 * Least-squares Boltzmann through normalized points: y = 1/(1 + exp((x − V½)/k)).
 * Activation curves have k < 0, inactivation curves k > 0. Grid search over
 * V½ and k, then a finer grid around the best; returns NaN for fewer than
 * three points. The best is always returned, with its rms misfit, however
 * poor: a bad fit is something to see. Where it lies on the edge of the search
 * (|k| at 30 mV, or V½ 40 mV beyond the data) `edge` is set: the points do not
 * settle on a Boltzmann, and V½ and k are where the search stopped, not
 * properties of the data.
 */
export function fitBoltzmann(x: number[], y: number[]): { vHalf: number; k: number; rms: number; edge: boolean } {
  if (x.length < 3) return { vHalf: NaN, k: NaN, rms: NaN, edge: false };
  const sse = (vh: number, k: number) => {
    let e = 0;
    for (let i = 0; i < x.length; i++) {
      const d = y[i] - 1 / (1 + Math.exp((x[i] - vh) / k));
      e += d * d;
    }
    return e;
  };
  const lo = Math.min(...x) - 40;
  const hi = Math.max(...x) + 40;
  let best = { vh: 0, k: 1, e: Infinity };
  const scan = (vh0: number, vh1: number, dvh: number, ks: number[]) => {
    for (let vh = vh0; vh <= vh1; vh += dvh)
      for (const k of ks) {
        if (k === 0) continue;
        const e = sse(vh, k);
        if (e < best.e) best = { vh, k, e };
      }
  };
  const ks: number[] = [];
  for (let k = -30; k <= 30; k += 0.5) ks.push(k);
  scan(lo, hi, 0.5, ks);
  for (let r = 0; r < 3; r++) {
    const step = [0.05, 0.005, 0.0005][r];
    const kk: number[] = [];
    // the finer passes stay inside the search: V½ in [lo, hi], k in [−30, 30]
    for (let k = Math.max(-30, best.k - 20 * step * 10); k <= Math.min(30, best.k + 20 * step * 10); k += step * 10) kk.push(+k.toFixed(6));
    scan(Math.max(lo, best.vh - 20 * step * 10), Math.min(hi, best.vh + 20 * step * 10), step * 10, kk);
  }
  if (!Number.isFinite(best.e)) return { vHalf: NaN, k: NaN, rms: NaN, edge: false };
  const edge = Math.abs(best.k) >= 29.9 || best.vh <= lo + 0.5 || best.vh >= hi - 0.5;
  return { vHalf: best.vh, k: best.k, rms: Math.sqrt(best.e / x.length), edge };
}
