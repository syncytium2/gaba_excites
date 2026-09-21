/**
 * The cell: one isopotential compartment, a model's channels, and a leak.
 *
 * The user sets whole-cell quantities — Cm in pF, Rin in MΩ — the way they are
 * read off a rig, not the per-area densities a model file carries. The mapping:
 *
 *   gbar_i = gbar_i(published) × Cm / Cm(published)   Cm fixes the size of the
 *                                                     cell; channel densities
 *                                                     stay what the model says
 *   gL     = chosen so the input resistance           Rin is what you would
 *            measured at rest equals Rin              measure: the slope of the
 *                                                     steady-state I–V at rest,
 *                                                     active currents included
 *
 * Units throughout: mV, ms, nS, pA, pF, MΩ, µM.  (pA/pF = mV/ms; nS·mV = pA.)
 */

import type { Channel } from "./channels.ts";
import { MODELS, RS, type CaPool, type ModelDef, type ModelId } from "./models.ts";

export interface CellParams {
  model: ModelId;
  /** whole-cell capacitance, pF */
  cm: number;
  /** input resistance at rest (Ihold = 0), MΩ */
  rin: number;
}

/** The published regular-spiking cell (the app's opening model). */
export const PUBLISHED_RS: CellParams = { model: "rs", cm: RS.defaults.cm, rin: RS.defaults.rin };

export function publishedParams(id: ModelId): CellParams {
  const m = MODELS[id];
  return { model: id, cm: m.defaults.cm, rin: m.defaults.rin };
}

export interface BuiltCell {
  params: CellParams;
  model: ModelDef;
  channels: Channel[];
  /** absolute maximal conductances at this Cm, nS, aligned with `channels` */
  gbar: number[];
  erev: number[];
  carriesCa: boolean[];
  pool: CaPool | null;
  eLeak: number;
  /** gate offset of each channel in the state vector */
  offsets: number[];
  nGates: number;
  /** state layout: [gates (nGates) | Ca | V | P] */
  iCa: number;
  iv: number;
  ip: number;
  /** leak conductance, nS, solved from Rin */
  gLeak: number;
  /** membrane area at 1 µF/cm², µm² */
  areaUm2: number;
  /** resting potential with no injected current, mV */
  vRest: number;
  /** true when no leak can give the requested Rin (the active channels alone are too leaky) */
  rinClamped: boolean;
}

interface ActiveSet {
  channels: Channel[];
  gbar: number[];
  erev: number[];
  carriesCa: boolean[];
  pool: CaPool | null;
  eLeak: number;
}

function activeSet(p: CellParams): ActiveSet {
  const m = MODELS[p.model];
  const scale = p.cm / m.cmRef;
  const chs = m.channels();
  return {
    channels: chs.map((c) => c.channel),
    gbar: chs.map((c) => c.gbar * scale),
    erev: chs.map((c) => c.erev),
    carriesCa: chs.map((c) => !!c.carriesCa),
    pool: m.pool ?? null,
    eLeak: m.eLeak,
  };
}

/**
 * Steady-state calcium at V: the pump balances the steady-state influx.
 * kp·Ca²/(Kp² + Ca²) = −α·I_Ca  →  Ca = Kp·√(x/(1−x)),  x = −α·I_Ca / kp.
 * When the influx exceeds what the pump can clear (x ≥ 1) there is no steady
 * state; it is capped, which only matters far into the depolarized range.
 */
export function caSteady(a: ActiveSet, v: number): number {
  if (!a.pool) return 0;
  let iCa = 0;
  for (let k = 0; k < a.channels.length; k++)
    if (a.carriesCa[k]) iCa += a.gbar[k] * a.channels[k].openInf(v, 0) * (v - a.erev[k]);
  const x = (-a.pool.alpha * iCa) / a.pool.kp;
  if (x <= 0) return 0;
  if (x >= 0.9999) return 100;
  return a.pool.Kp * Math.sqrt(x / (1 - x));
}

/** Steady-state membrane current (pA, outward positive) at v, every gate and the calcium at steady state. */
export function iSteady(a: ActiveSet, gLeak: number, v: number): number {
  const ca = caSteady(a, v);
  let i = gLeak * (v - a.eLeak);
  for (let k = 0; k < a.channels.length; k++) i += a.gbar[k] * a.channels[k].openInf(v, ca) * (v - a.erev[k]);
  return i;
}

/**
 * The most hyperpolarized zero of the steady-state I–V at the given injected
 * current. That is the resting (or holding) potential an experimenter sees;
 * depolarized zeros beyond it belong to the spiking regime.
 */
export function steadyV(a: ActiveSet, gLeak: number, iInj = 0): number {
  const f = (v: number) => iSteady(a, gLeak, v) - iInj;
  let lo = -150;
  let flo = f(lo);
  for (let v = -150 + 0.5; v <= 20; v += 0.5) {
    const fv = f(v);
    if (flo < 0 && fv >= 0) {
      let a0 = lo;
      let b0 = v;
      for (let it = 0; it < 60; it++) {
        const mid = 0.5 * (a0 + b0);
        if (f(mid) < 0) a0 = mid;
        else b0 = mid;
      }
      return 0.5 * (a0 + b0);
    }
    lo = v;
    flo = fv;
  }
  return NaN;
}

/** Input resistance (MΩ) at the steady state for injected current iInj: 1 / slope of the steady-state I–V. */
export function rinAt(a: ActiveSet, gLeak: number, iInj = 0): number {
  const v = steadyV(a, gLeak, iInj);
  const h = 0.01;
  const slope = (iSteady(a, gLeak, v + h) - iSteady(a, gLeak, v - h)) / (2 * h); // nS
  return 1000 / slope;
}

/** The leak each model publishes, at its published Cm. */
export function publishedLeak(id: ModelId): number {
  // RS: g_pas = 1e-4 S/cm² over π·96² µm².  GnRH: g_L = 1 nS (Adams 2018 Table 1).
  return id === "rs" ? 1e-4 * Math.PI * 96 * 96 * 1e-8 * 1e9 : 1;
}

/** Rin at rest of a model exactly as published (its own leak, its own Cm). */
export function publishedRin(id: ModelId): number {
  const m = MODELS[id];
  return rinAt(activeSet({ model: id, cm: m.cmRef, rin: 0 }), publishedLeak(id));
}

/** Instantiate the cell, solving for the leak that yields the requested Rin. */
export function buildCell(p: CellParams): BuiltCell {
  const a = activeSet(p);
  const target = p.rin;

  // Rin falls monotonically as the leak grows. Bisect on log(gL).
  const rinOf = (gL: number) => rinAt(a, gL);
  let lo = 1e-4;
  let hi = 1e5;
  let rinClamped = false;
  let gLeak: number;
  if (!(rinOf(lo) > target)) {
    // Even with (almost) no leak, the channels open at rest set a lower Rin.
    gLeak = lo;
    rinClamped = true;
  } else {
    for (let it = 0; it < 90; it++) {
      const mid = Math.sqrt(lo * hi);
      if (rinOf(mid) > target) lo = mid;
      else hi = mid;
    }
    gLeak = Math.sqrt(lo * hi);
  }

  const offsets: number[] = [];
  let n = 0;
  for (const c of a.channels) {
    offsets.push(n);
    n += c.nGates;
  }
  return {
    params: p,
    model: MODELS[p.model],
    channels: a.channels,
    gbar: a.gbar,
    erev: a.erev,
    carriesCa: a.carriesCa,
    pool: a.pool,
    eLeak: a.eLeak,
    offsets,
    nGates: n,
    iCa: n,
    iv: n + 1,
    ip: n + 2,
    gLeak,
    areaUm2: p.cm * 100, // 1 pF per 100 µm² at 1 µF/cm²
    vRest: steadyV(a, gLeak),
    rinClamped,
  };
}

function asActive(c: BuiltCell): ActiveSet {
  return { channels: c.channels, gbar: c.gbar, erev: c.erev, carriesCa: c.carriesCa, pool: c.pool, eLeak: c.eLeak };
}

/** Rin actually achieved by a built cell at a given holding current. */
export function cellRinAt(c: BuiltCell, iInj = 0): number {
  return rinAt(asActive(c), c.gLeak, iInj);
}

export function cellSteadyV(c: BuiltCell, iInj = 0): number {
  return steadyV(asActive(c), c.gLeak, iInj);
}

export function cellCaSteady(c: BuiltCell, v: number): number {
  return caSteady(asActive(c), v);
}
