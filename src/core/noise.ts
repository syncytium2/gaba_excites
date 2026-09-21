/**
 * Two kinds of noise, kept apart because they teach different things.
 *
 * RECORDING noise — the amplifier and digitizer. Added to the recorded trace
 * after the simulation; the cell never feels it, and no measurement uses it
 * (measurements are on Vm). White Gaussian noise through a Gaussian low-pass
 * at the chosen bandwidth — the filter Clampfit and pCLAMP apply — scaled so
 * the RMS you set is the RMS you see, plus optional mains hum.
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

export interface NoiseParams {
  /** recording noise, mV RMS after filtering */
  recSigma: number;
  /** recording bandwidth (Gaussian filter −3 dB), kHz */
  recBandwidth: number;
  /** mains hum amplitude, mV peak */
  humAmp: number;
  /** mains frequency, Hz */
  humHz: number;
  /** membrane noise current SD, pA */
  memSigma: number;
  /** membrane noise correlation time, ms */
  memTau: number;
}

export const DEFAULT_NOISE: NoiseParams = { recSigma: 0, recBandwidth: 10, humAmp: 0, humHz: 60, memSigma: 0, memTau: 5 };

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

/**
 * Filtered Gaussian noise plus hum, added in place to `v`, sampled every dtMs.
 * Gaussian filter: σ_t = 0.1325 / fc (Colquhoun & Sigworth). The kernel is
 * normalized to unit sum, which shrinks white-noise variance by Σh²; the
 * output is rescaled by 1/√Σh² so its RMS equals recSigma.
 */
export function addRecordingNoise(v: Float32Array, dtMs: number, p: NoiseParams, seed: number): void {
  if (p.recSigma > 0) {
    const fcPerMs = Math.max(p.recBandwidth, 0.01); // kHz = 1/ms
    const sigSamples = 0.1325 / fcPerMs / dtMs;
    const half = Math.max(1, Math.ceil(4 * sigSamples));
    const h: number[] = [];
    let sum = 0;
    for (let k = -half; k <= half; k++) {
      const w = sigSamples > 0.05 ? Math.exp(-0.5 * (k / sigSamples) ** 2) : k === 0 ? 1 : 0;
      h.push(w);
      sum += w;
    }
    let ss = 0;
    for (let k = 0; k < h.length; k++) {
      h[k] /= sum;
      ss += h[k] * h[k];
    }
    const gain = p.recSigma / Math.sqrt(ss);
    const n = v.length;
    const g = gaussian(seed);
    const white = new Float32Array(n + 2 * half);
    for (let i = 0; i < white.length; i++) white[i] = g();
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let k = 0; k < h.length; k++) acc += h[k] * white[i + k];
      v[i] += gain * acc;
    }
  }
  if (p.humAmp > 0) {
    const phase = 2 * Math.PI * rng(seed ^ 0x5bd1e995)();
    const w = (2 * Math.PI * p.humHz) / 1000; // rad per ms
    for (let i = 0; i < v.length; i++) v[i] += p.humAmp * Math.sin(w * i * dtMs + phase);
  }
}
