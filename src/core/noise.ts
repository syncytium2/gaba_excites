/**
 * Two kinds of noise, kept apart because they teach different things.
 *
 * RECORDING noise — the amplifier and digitizer. Added to the recorded signal
 * at the pipette, with optional mains hum, and the sum goes through the
 * amplifier's filter (filter.ts: 4-pole Bessel, 1–10 kHz or bypass), as on a
 * rig; the cell never feels it, and no measurement uses it (measurements are
 * on Vm). The RMS you set is the RMS through the 10 kHz filter, the way an
 * amplifier's noise is specified; a lower cutoff passes less of it.
 *
 * MEMBRANE noise — fluctuations the cell does feel. A current injected at the
 * membrane (not through the pipette, so it causes no bridge error), following
 * an Ornstein–Uhlenbeck process: Gaussian, mean zero, SD σ, correlation time τ.
 * Current-based on purpose: it adds fluctuation without adding conductance, so
 * it does not change Rin. The Poisson PSCs are the conductance-based kind.
 *
 * Both draw from seeded generators whose seeds depend only on the draw number
 * and the sweep, like the PSCs: change the cell, and the same noise replays.
 */

import { rng } from "./synapses.ts";
import { Bessel4, type FilterKHz } from "./filter.ts";

export interface NoiseParams {
  /** recording noise, mV RMS as seen through the 10 kHz filter */
  recSigma: number;
  /** the amplifier's filter, 4-pole Bessel −3 dB, kHz; 0 = bypass */
  recFilter: FilterKHz;
  /** mains hum amplitude, mV peak */
  humAmp: number;
  /** mains frequency, Hz */
  humHz: number;
  /** membrane noise current SD, pA */
  memSigma: number;
  /** membrane noise correlation time, ms */
  memTau: number;
}

// Core runs default to bypass, so the recorded trace is the pipette signal itself; the app opens at 10 kHz.
export const DEFAULT_NOISE: NoiseParams = { recSigma: 0, recFilter: 0, humAmp: 0, humHz: 60, memSigma: 0, memTau: 5 };

/** Standard normal draws from a seeded uniform source (Box–Muller, both halves used). */
export function gaussian(seed: number): () => number {
  const u = rng(seed);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let a = 0;
    while (a <= 1e-12) a = u();
    const b = u();
    const r = Math.sqrt(-2 * Math.log(a));
    spare = r * Math.sin(2 * Math.PI * b);
    return r * Math.cos(2 * Math.PI * b);
  };
}

/**
 * Exact one-step update of an OU process with SD σ and correlation time τ:
 * x ← x·e^(−dt/τ) + σ·√(1 − e^(−2dt/τ))·N(0,1). Stable and exact at any dt.
 */
export class OU {
  private decay: number;
  private kick: number;
  private x = 0;
  private n: () => number;
  constructor(sigma: number, tau: number, dt: number, seed: number) {
    this.decay = Math.exp(-dt / Math.max(tau, 1e-6));
    this.kick = sigma * Math.sqrt(1 - this.decay * this.decay);
    this.n = gaussian(seed);
    this.x = sigma * this.n(); // start in the stationary distribution
  }
  next(): number {
    this.x = this.x * this.decay + this.kick * this.n();
    return this.x;
  }
}

/** RMS of the 10 kHz filter's output for unit white noise at dtMs: Σh² of its impulse response, square-rooted. */
const refRms = new Map<number, number>();
function rmsThrough10k(dtMs: number): number {
  let r = refRms.get(dtMs);
  if (r === undefined) {
    const f = new Bessel4(10, dtMs);
    let ss = 0;
    for (let i = 0; i < Math.ceil(5 / dtMs); i++) {
      const h = f.next(i === 0 ? 1 : 0);
      ss += h * h;
    }
    r = Math.sqrt(ss);
    refRms.set(dtMs, r);
  }
  return r;
}

/**
 * What the amplifier records, one integration step at a time: the pipette
 * signal (after bridge balance) plus white noise and hum, through the filter.
 * runSweep and the oscilloscope's stream both feed it every step, so the two
 * record identically.
 */
export class Recorder {
  private filter: Bessel4 | null;
  private g: () => number;
  private sigma: number;
  private hum: number;
  private humW: number;
  private humPhase: number;
  private n = 0;
  private dtMs: number;
  constructor(p: NoiseParams, dtMs: number, seed: number) {
    this.dtMs = dtMs;
    this.filter = p.recFilter > 0 ? new Bessel4(p.recFilter, dtMs) : null;
    this.g = gaussian(seed);
    // white noise per step whose RMS through the 10 kHz filter is recSigma
    this.sigma = p.recSigma > 0 ? p.recSigma / rmsThrough10k(dtMs) : 0;
    this.hum = p.humAmp;
    this.humW = (2 * Math.PI * p.humHz) / 1000;
    this.humPhase = 2 * Math.PI * rng(seed ^ 0x5bd1e995)();
  }

  /** Start at a steady pipette signal: the filter is settled there, and this is the first sample. */
  start(v: number): number {
    this.filter?.reset(v);
    return v;
  }

  /** The recorded voltage for this step, given the pipette signal. */
  next(v: number): number {
    let x = v;
    if (this.sigma > 0) x += this.sigma * this.g();
    if (this.hum > 0) x += this.hum * Math.sin(this.humW * this.n * this.dtMs + this.humPhase);
    this.n++;
    return this.filter ? this.filter.next(x) : x;
  }
}
