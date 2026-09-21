/**
 * Conductance-based PSCs. Each input is a train of events, and each event
 * opens a difference-of-exponentials conductance whose peak is `gPeak`.
 *
 * Conductance-based, not current-based, on purpose: the whole point of a
 * variable GABA reversal is that the same conductance can hyperpolarize,
 * shunt, or depolarize depending on where E_GABA sits relative to Vm and to
 * threshold. A current-based PSC cannot show that.
 */

export type Pattern = "poisson" | "regular";

export interface SynInput {
  enabled: boolean;
  /** mean event rate, Hz */
  rate: number;
  /** peak conductance of one event, nS */
  gPeak: number;
  /** rise and decay time constants, ms */
  tauRise: number;
  tauDecay: number;
  /** reversal potential, mV */
  erev: number;
  pattern: Pattern;
}

export const DEFAULT_GLU: SynInput = {
  enabled: false,
  rate: 50,
  gPeak: 3,
  tauRise: 0.5,
  tauDecay: 3,
  erev: 0,
  pattern: "poisson",
};

export const DEFAULT_GABA: SynInput = {
  enabled: false,
  rate: 50,
  gPeak: 3,
  tauRise: 0.5,
  tauDecay: 10,
  erev: -80,
  pattern: "poisson",
};

/** mulberry32: small, fast, seedable. Reproducibility matters more than quality here. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Event times (ms) in [0, duration). */
export function eventTimes(s: SynInput, duration: number, seed: number): number[] {
  if (!s.enabled || s.rate <= 0 || s.gPeak <= 0) return [];
  const out: number[] = [];
  const mean = 1000 / s.rate;
  if (s.pattern === "regular") {
    for (let t = mean; t < duration; t += mean) out.push(t);
    return out;
  }
  const r = rng(seed);
  let t = -mean * Math.log(1 - r());
  while (t < duration) {
    out.push(t);
    t += -mean * Math.log(1 - r());
  }
  return out;
}

/**
 * Kinetics of one input in state-update form. g(t) = A(t) − B(t), where A
 * decays with tauDecay and B with tauRise; each event adds `jump` to both, so
 * a lone event peaks at exactly gPeak. A rise tau near zero degenerates to an
 * instantaneous rise and a single exponential decay (B stays 0).
 */
export interface SynKinetics {
  decayA: number;
  decayB: number;
  jump: number;
  single: boolean;
}

export function kinetics(s: SynInput, dt: number): SynKinetics {
  const td = Math.max(s.tauDecay, 1e-3);
  let tr = s.tauRise;
  if (!(tr > 1e-3)) return { decayA: Math.exp(-dt / td), decayB: 0, jump: s.gPeak, single: true };
  if (Math.abs(tr - td) < 1e-6) tr = td * (1 - 1e-4); // the peak formula is singular at tr = td
  const tp = ((td * tr) / (td - tr)) * Math.log(td / tr);
  const norm = Math.exp(-tp / td) - Math.exp(-tp / tr);
  return {
    decayA: Math.exp(-dt / td),
    decayB: Math.exp(-dt / tr),
    jump: s.gPeak / norm,
    single: false,
  };
}
