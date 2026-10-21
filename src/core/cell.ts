/**
 * The cell: one isopotential compartment, a model's channels, and a leak.
 *
 * The user sets whole-cell quantities, the way they are read off a rig or
 * dialed into a model — Cm in pF and a linear leak gL in nS — not the per-area
 * densities a model file carries:
 *
 *   gbar_i = gbar_i(published) × Cm / Cm(published)   Cm fixes the size of the
 *                                                     cell; channel densities
 *                                                     stay what the model says
 *   gL     = what the user set, in nS                 an input, and nothing
 *                                                     else ever moves it: not
 *                                                     Cm, not a channel edit
 *
 * Input resistance is not an input. It is MEASURED from the cell those make —
 * the slope of the steady-state I–V at rest, active currents included — so
 * that changing a channel shows up in Rin the way it would on a rig.
 *
 * Units throughout: mV, ms, nS, pA, pF, MΩ, µM.  (pA/pF = mV/ms; nS·mV = pA.)
 */

import type { Channel } from "./channels.ts";
import { MODELS, RS, type ModelDef, type ModelId } from "./models.ts";
import type { CaPool } from "./pools.ts";

export interface CellParams {
  model: ModelId;
  /** whole-cell capacitance, pF */
  cm: number;
  /** linear leak conductance, nS (whole cell, not scaled by Cm) */
  gLeak: number;
}

/** The published regular-spiking cell (the app's opening model). */
export const PUBLISHED_RS: CellParams = { model: "rs", cm: RS.defaults.cm, gLeak: RS.defaults.gLeak };

export function publishedParams(id: ModelId): CellParams {
  const m = MODELS[id];
  return { model: id, cm: m.defaults.cm, gLeak: m.defaults.gLeak };
}

export interface BuiltCell {
  params: CellParams;
  model: ModelDef;
  channels: Channel[];
  /** absolute maximal conductances at this Cm, nS, aligned with `channels` */
  gbar: number[];
  erev: number[];
  /** a reversal that follows calcium, where the channel has one (aligned with `channels`) */
  erevCa: (((ca: number) => number) | undefined)[];
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
  /** leak conductance, nS, as set */
  gLeak: number;
  /** capacitance, pF (= params.cm) */
  cm: number;
  /** membrane area at 1 µF/cm², µm² */
  areaUm2: number;
  /** resting potential with no injected current, mV (NaN when there is no stable rest) */
  vRest: number;
  /** input resistance measured at rest, MΩ (NaN when there is no stable rest) */
  rinRest: number;
}

interface ActiveSet {
  channels: Channel[];
  gbar: number[];
  erev: number[];
  erevCa: (((ca: number) => number) | undefined)[];
  carriesCa: boolean[];
  cm: number;
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
    erevCa: chs.map((c) => c.erevCa),
    carriesCa: chs.map((c) => !!c.carriesCa),
    cm: p.cm,
    pool: m.pool ?? null,
    eLeak: m.eLeak,
  };
}

/** Reversal of channel k at calcium ca. */
function erevAt(a: ActiveSet, k: number, ca: number): number {
  const f = a.erevCa[k];
  return f ? f(ca) : a.erev[k];
}

/**
 * Steady-state calcium at V: the pool's steady state for the steady-state
 * calcium current. Where a reversal follows calcium, the current depends on
 * the calcium it makes, so iterate to the fixed point (a pool without such a
 * reversal is done in one pass).
 */
export function caSteady(a: ActiveSet, v: number): number {
  if (!a.pool) return 0;
  let ca = a.pool.steady(0, a.cm);
  for (let it = 0; it < 50; it++) {
    let iCa = 0;
    for (let k = 0; k < a.channels.length; k++)
      if (a.carriesCa[k]) iCa += a.gbar[k] * a.channels[k].openInf(v, ca) * (v - erevAt(a, k, ca));
    const next = a.pool.steady(iCa, a.cm);
    if (Math.abs(next - ca) < 1e-12 * (1 + ca)) return next;
    ca = next;
  }
  return ca;
}

/** Steady-state membrane current (pA, outward positive) at v, every gate and the calcium at steady state. */
export function iSteady(a: ActiveSet, gLeak: number, v: number): number {
  const ca = caSteady(a, v);
  let i = gLeak * (v - a.eLeak);
  for (let k = 0; k < a.channels.length; k++) i += a.gbar[k] * a.channels[k].openInf(v, ca) * (v - erevAt(a, k, ca));
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

/** The leak each model publishes, at its published Cm, nS. */
export function publishedLeak(id: ModelId): number {
  return MODELS[id].defaults.gLeak;
}

/** Rin at rest of a model exactly as published (its own leak, its own Cm). */
export function publishedRin(id: ModelId): number {
  const m = MODELS[id];
  return rinAt(activeSet({ model: id, cm: m.cmRef, gLeak: 0 }), publishedLeak(id));
}

/** Instantiate the cell. The leak is taken as given; rest and Rin follow from it. */
export function buildCell(p: CellParams): BuiltCell {
  const a = activeSet(p);
  const gLeak = p.gLeak;

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
    erevCa: a.erevCa,
    carriesCa: a.carriesCa,
    pool: a.pool,
    eLeak: a.eLeak,
    offsets,
    nGates: n,
    iCa: n,
    iv: n + 1,
    ip: n + 2,
    gLeak,
    cm: p.cm,
    areaUm2: p.cm * 100, // 1 pF per 100 µm² at 1 µF/cm²
    vRest: steadyV(a, gLeak),
    rinRest: rinAt(a, gLeak),
  };
}

function asActive(c: BuiltCell): ActiveSet {
  return { channels: c.channels, gbar: c.gbar, erev: c.erev, erevCa: c.erevCa, carriesCa: c.carriesCa, cm: c.cm, pool: c.pool, eLeak: c.eLeak };
}

/** Rin of a built cell at a given holding current, MΩ. */
export function cellRinAt(c: BuiltCell, iInj = 0): number {
  return rinAt(asActive(c), c.gLeak, iInj);
}

export function cellSteadyV(c: BuiltCell, iInj = 0): number {
  return steadyV(asActive(c), c.gLeak, iInj);
}

export function cellCaSteady(c: BuiltCell, v: number): number {
  return caSteady(asActive(c), v);
}
