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
import { kv4Injection, leakInjection, linearizedAt, opposite, type DynClamp } from "./dynclamp.ts";

export interface CellParams {
  model: ModelId;
  /** whole-cell capacitance, pF */
  cm: number;
  /** linear leak conductance, nS (whole cell, not scaled by Cm) */
  gLeak: number;
  /** the model's own settings (ModelDef.knobs) by id; any left out take the published value */
  knobs?: Record<string, number>;
  /**
   * channels blocked, by id: their conductance is zero, as with a saturating
   * dose of a selective blocker (TTX for Na⁺, TEA for K⁺). Works in either clamp.
   */
  block?: string[];
  /** conductances added by dynamic clamp (dynclamp.ts): not the cell's own, and not scaled by Cm */
  inject?: Injected[];
  /**
   * The amplifier's dynamic clamp, as a setting (dynclamp.ts DynClamp): plain data, so it can cross to a worker,
   * which channel objects cannot. Resolved into injected conductances when the cell is built.
   */
  clamp?: DynClamp;
}

/**
 * A conductance a dynamic clamp adds to the cell: any `Channel`, at a conductance that may be negative (the clamp
 * then subtracts what the cell has), with its own reversal. It joins the cell's channels after the model's own,
 * so rest, input resistance and both clamps see it the way they see any channel, and the solver still learns
 * about no particular one. The clamp is ideal: it reads Vm itself, every step, with no electrode and no delay.
 */
export interface Injected {
  channel: Channel;
  /** maximal conductance, nS, as set: negative subtracts */
  g: number;
  /** reversal, mV */
  erev: number;
}

/** Every knob of the model, at the given values or the published ones. */
export function knobValues(m: ModelDef, set?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of m.knobs ?? []) out[k.id] = set?.[k.id] ?? k.value;
  return out;
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
  /** the share of each channel's current that feeds the calcium pool: 0, or 1, or a channel's own (ModelChannel.caFraction) */
  caFrac: number[];
  /** how many of `channels` are the model's own; any after them were added by dynamic clamp (CellParams.inject) */
  nOwn: number;
  /** some channel reads the cell's Ca²⁺ current (Channel.readsICa), so the solver computes it for them */
  readsICa: boolean;
  pool: CaPool | null;
  eLeak: number;
  /** gate offset of each channel in the state vector */
  offsets: number[];
  nGates: number;
  /** state layout: [gates (nGates) | Ca | V | P | pool's extra state (nExtra)] */
  iCa: number;
  iv: number;
  ip: number;
  /** first slot of the pool's extra state (e.g. ER calcium); nState is the whole vector's length */
  ix: number;
  nState: number;
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
  caFrac: number[];
  nOwn: number;
  readsICa: boolean;
  cm: number;
  pool: CaPool | null;
  eLeak: number;
}

/** How far a cell's rest may sit from the control's and still count as "its own rest", mV. */
const OWN_REST_MV = 15;

/**
 * The dynamic clamp setting as injected conductances. "As its leak" and "gating only" need a resting potential
 * to linearize at: the injected cell's own rest for the leak (so the leak reproduces that cell), the control's
 * for gating only (so the control's rest and input resistance are what is left untouched). Where the injected
 * cell has no rest near the control's (a subtraction larger than what the cell has), the control's rest is used.
 * Rest here is at zero holding current.
 */
export function clampInjected(p: CellParams, m: ModelDef = MODELS[p.model]): Injected[] {
  const c = p.clamp;
  if (!c || !c.on || c.g === 0) return [];
  if (c.kind === "leak") return [leakInjection(c.g, c.erev)];
  const kv4 = kv4Injection(c.g, c.erev);
  if (c.as === "kv4") return [kv4];
  const bare: CellParams = { ...p, clamp: undefined };
  const v0 = steadyV(activeSet(bare, m), p.gLeak);
  if (!Number.isFinite(v0)) return [kv4];
  if (c.as === "gating") return [kv4, opposite(linearizedAt(kv4, v0).slope)];
  const v1 = steadyV(activeSet({ ...bare, inject: [...(p.inject ?? []), kv4] }, m), p.gLeak);
  const at = Number.isFinite(v1) && Math.abs(v1 - v0) < OWN_REST_MV ? v1 : v0;
  return [linearizedAt(kv4, at).slope];
}

function activeSet(p: CellParams, m: ModelDef = MODELS[p.model]): ActiveSet {
  const scale = p.cm / m.cmRef;
  const chs = m.channels(knobValues(m, p.knobs));
  const inj = [...(p.inject ?? []), ...clampInjected(p, m)];
  return {
    channels: [...chs.map((c) => c.channel), ...inj.map((c) => c.channel)],
    gbar: [...chs.map((c) => (p.block?.includes(c.channel.id) ? 0 : c.gbar * scale)), ...inj.map((c) => c.g)],
    erev: [...chs.map((c) => c.erev), ...inj.map((c) => c.erev)],
    erevCa: [...chs.map((c) => c.erevCa), ...inj.map(() => undefined)],
    carriesCa: [...chs.map((c) => !!c.carriesCa), ...inj.map(() => false)],
    caFrac: [...chs.map((c) => (c.carriesCa ? (c.caFraction ?? 1) : 0)), ...inj.map(() => 0)],
    nOwn: chs.length,
    readsICa: chs.some((c) => c.channel.readsICa),
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
      if (a.carriesCa[k]) iCa += a.caFrac[k] * a.gbar[k] * a.channels[k].openInf(v, ca) * (v - erevAt(a, k, ca));
    const next = a.pool.steady(iCa, a.cm);
    if (Math.abs(next - ca) < 1e-12 * (1 + ca)) return next;
    ca = next;
  }
  return ca;
}

/** Steady-state membrane current (pA, outward positive) at v, every gate and the calcium at steady state. */
export function iSteady(a: ActiveSet, gLeak: number, v: number): number {
  const ca = caSteady(a, v);
  // the steady Ca²⁺ current density, for a channel that reads it (Channel.readsICa)
  let iCaD: number | undefined;
  if (a.readsICa) {
    iCaD = 0;
    for (let k = 0; k < a.channels.length; k++)
      if (a.carriesCa[k]) iCaD += a.caFrac[k] * a.gbar[k] * a.channels[k].openInf(v, ca) * (v - erevAt(a, k, ca));
    iCaD /= a.cm;
  }
  let i = gLeak * (v - a.eLeak);
  for (let k = 0; k < a.channels.length; k++) i += a.gbar[k] * a.channels[k].openInf(v, ca, iCaD) * (v - erevAt(a, k, ca));
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

/**
 * Instantiate the cell. The leak is taken as given; rest and Rin follow from it.
 * `model` defaults to the registered model `p.model` names; a variant of it
 * (another of its published parameter sets) can be passed instead.
 */
export function buildCell(p: CellParams, model: ModelDef = MODELS[p.model]): BuiltCell {
  const a = activeSet(p, model);
  const gLeak = p.gLeak;

  const offsets: number[] = [];
  let n = 0;
  for (const c of a.channels) {
    offsets.push(n);
    n += c.nGates;
  }
  return {
    params: p,
    model,
    channels: a.channels,
    gbar: a.gbar,
    erev: a.erev,
    erevCa: a.erevCa,
    carriesCa: a.carriesCa,
    caFrac: a.caFrac,
    nOwn: a.nOwn,
    readsICa: a.readsICa,
    pool: a.pool,
    eLeak: a.eLeak,
    offsets,
    nGates: n,
    iCa: n,
    iv: n + 1,
    ip: n + 2,
    ix: n + 3,
    nState: n + 3 + (a.pool?.nExtra ?? 0),
    gLeak,
    cm: p.cm,
    areaUm2: p.cm * 100, // 1 pF per 100 µm² at 1 µF/cm²
    vRest: steadyV(a, gLeak),
    rinRest: rinAt(a, gLeak),
  };
}

function asActive(c: BuiltCell): ActiveSet {
  return { channels: c.channels, gbar: c.gbar, erev: c.erev, erevCa: c.erevCa, carriesCa: c.carriesCa, caFrac: c.caFrac, nOwn: c.nOwn, readsICa: c.readsICa, cm: c.cm, pool: c.pool, eLeak: c.eLeak };
}

/** Rin of a built cell at a given holding current, MΩ. */
export function cellRinAt(c: BuiltCell, iInj = 0): number {
  return rinAt(asActive(c), c.gLeak, iInj);
}

/** The steady current a cell needs to hold it at v, pA: its steady-state membrane current there, every gate at steady state. */
export function cellHoldAt(c: BuiltCell, v: number): number {
  return iSteady(asActive(c), c.gLeak, v);
}

export function cellSteadyV(c: BuiltCell, iInj = 0): number {
  return steadyV(asActive(c), c.gLeak, iInj);
}

export function cellCaSteady(c: BuiltCell, v: number): number {
  return caSteady(asActive(c), v);
}
