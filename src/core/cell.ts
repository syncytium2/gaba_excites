/**
 * The cell: one isopotential compartment, the stock channels, and a leak.
 *
 * The user sets whole-cell quantities — Cm in pF, Rin in MΩ — the way they are
 * read off a rig, not the per-area densities a model file carries. The mapping:
 *
 *   area   = Cm / (1 µF/cm²)                       Cm fixes the size of the cell
 *   gbar_i = density_i × area                      active densities stay fixed,
 *                                                  so a bigger cell has more channels
 *   gL     = chosen so the input resistance        Rin is what you would measure:
 *            measured at rest equals Rin           the slope of the steady-state
 *                                                  I–V at rest, active currents included
 *
 * Units throughout: mV, ms, nS, pA, pF, MΩ.  (pA/pF = mV/ms; nS·mV = pA.)
 */

import { makeKd, makeM, makeNa, type Channel } from "./channels.ts";

export interface CellParams {
  /** whole-cell capacitance, pF */
  cm: number;
  /** input resistance at rest (Ihold = 0), MΩ */
  rin: number;
  /** leak reversal, mV */
  eLeak: number;
  eNa: number;
  eK: number;
  /** Traub threshold offset (hh2 `vtraub`), mV */
  vTraub: number;
  /** channel densities, mS/cm² */
  gNa: number;
  gKd: number;
  gM: number;
  /** peak time constant of the M current, ms */
  tauMaxM: number;
}

/**
 * The published regular-spiking pyramidal cell, ModelDB 123623 `sPY_template`
 * (Pospischil et al. 2008). diam = L = 96 µm, so NEURON's area is π·96² µm² ≈
 * 28 953 µm², which at 1 µF/cm² is 289.5 pF; g_pas = 1e-4 S/cm² over that area
 * is the template's own "Rin = 34 Meg". The Rin default here is that cell's
 * input resistance measured at its rest, active conductances included, so the
 * default reproduces the published model exactly (checked in cell.test.ts).
 */
export const PUBLISHED_RS: CellParams = {
  cm: 289.53,
  rin: 32.13,
  eLeak: -70,
  eNa: 50,
  eK: -100,
  vTraub: -55,
  gNa: 50,
  gKd: 5,
  gM: 0.07,
  tauMaxM: 1000,
};

export interface BuiltCell {
  params: CellParams;
  channels: Channel[];
  /** absolute maximal conductances, nS, aligned with `channels` */
  gbar: number[];
  /** reversal potentials, mV, aligned with `channels` */
  erev: number[];
  /** gate offset of each channel in the state vector */
  offsets: number[];
  nGates: number;
  /** leak conductance, nS, solved from Rin */
  gLeak: number;
  /** membrane area, µm² */
  areaUm2: number;
  /** resting potential with no injected current, mV */
  vRest: number;
  /** true when no leak can give the requested Rin (the active channels alone are too leaky) */
  rinClamped: boolean;
}

/**
 * mS/cm² × pF → nS, given 1 µF/cm². area_cm² = pF × 1e-6, and mS × 1e-6 = nS,
 * so the number is simply the product: 50 mS/cm² on 289.5 pF is 14 476 nS.
 */
export function densityToNs(mSperCm2: number, cmPf: number): number {
  return mSperCm2 * cmPf;
}

interface ActiveSet {
  channels: Channel[];
  gbar: number[];
  erev: number[];
}

function activeSet(p: CellParams): ActiveSet {
  return {
    channels: [makeNa(p.vTraub), makeKd(p.vTraub), makeM(p.tauMaxM)],
    gbar: [densityToNs(p.gNa, p.cm), densityToNs(p.gKd, p.cm), densityToNs(p.gM, p.cm)],
    erev: [p.eNa, p.eK, p.eK],
  };
}

/** Steady-state membrane current (pA, outward positive) at v, all gates at steady state. */
export function iSteady(a: ActiveSet, gLeak: number, eLeak: number, v: number): number {
  let i = gLeak * (v - eLeak);
  for (let k = 0; k < a.channels.length; k++) i += a.gbar[k] * a.channels[k].openInf(v) * (v - a.erev[k]);
  return i;
}

/**
 * The most hyperpolarized zero of the steady-state I–V at the given injected
 * current. That is the resting (or holding) potential an experimenter sees;
 * depolarized zeros beyond it belong to the spiking regime.
 */
export function steadyV(a: ActiveSet, gLeak: number, eLeak: number, iInj = 0): number {
  const f = (v: number) => iSteady(a, gLeak, eLeak, v) - iInj;
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
export function rinAt(a: ActiveSet, gLeak: number, eLeak: number, iInj = 0): number {
  const v = steadyV(a, gLeak, eLeak, iInj);
  const h = 0.01;
  const slope = (iSteady(a, gLeak, eLeak, v + h) - iSteady(a, gLeak, eLeak, v - h)) / (2 * h); // nS
  return 1000 / slope;
}

/** Instantiate the cell, solving for the leak that yields the requested Rin. */
export function buildCell(p: CellParams): BuiltCell {
  const a = activeSet(p);
  const target = p.rin;

  // Rin falls monotonically as the leak grows. Bisect on log(gL).
  const rinOf = (gL: number) => rinAt(a, gL, p.eLeak);
  let lo = 1e-3;
  let hi = 1e5;
  let rinClamped = false;
  const rinMax = rinOf(lo);
  let gLeak: number;
  if (!(rinMax > target)) {
    // Even with (almost) no leak, the channels open at rest set a lower Rin.
    gLeak = lo;
    rinClamped = true;
  } else {
    for (let it = 0; it < 80; it++) {
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
    channels: a.channels,
    gbar: a.gbar,
    erev: a.erev,
    offsets,
    nGates: n,
    gLeak,
    areaUm2: p.cm * 100, // 1 pF per 100 µm² at 1 µF/cm²
    vRest: steadyV(a, gLeak, p.eLeak),
    rinClamped,
  };
}

/** Rin actually achieved by a built cell at a given holding current. */
export function cellRinAt(c: BuiltCell, iInj = 0): number {
  return rinAt({ channels: c.channels, gbar: c.gbar, erev: c.erev }, c.gLeak, c.params.eLeak, iInj);
}

export function cellSteadyV(c: BuiltCell, iInj = 0): number {
  return steadyV({ channels: c.channels, gbar: c.gbar, erev: c.erev }, c.gLeak, c.params.eLeak, iInj);
}
