/**
 * Dynamic clamp: conductances an experimenter adds to a cell, or subtracts from it, through the amplifier.
 *
 * A real dynamic clamp reads the membrane potential, computes the current a conductance would pass, and injects
 * it, many times per millisecond. Here an injected conductance is a `Channel` object that does not belong to the
 * model (cell.ts, `CellParams.inject`): it joins the cell's channels, so rest, input resistance and both clamps
 * see it, and the solver learns about no particular one. The clamp is IDEAL: it reads Vm itself every
 * integration step, with no series resistance, filter or loop delay (Mendonça's ran above 50 kHz through a
 * bridge-balanced electrode).
 *
 * The lesson this is here for: a voltage-gated conductance that is partly open at rest is also a leak. Adding
 * it changes the resting potential and the input resistance before it changes anything else, so an effect of
 * the injection on firing is not yet evidence about the conductance's gating. `linearizedAt` builds the plain
 * leak that does exactly what the injection does at rest, which is the control.
 *
 * Units: mV, ms, nS.
 */

import { boltzmann, makeGated, type Channel } from "./channels.ts";
import type { Injected } from "./cell.ts";

/**
 * The transient K⁺ (Kv4-type) conductance of Mendonça PRF, Vargas-Caballero M, Erdélyi F, Szabó G, Paulsen O,
 * Robinson HPC (2016) eLife 5:e16475, doi:10.7554/eLife.16475, "Model 3" of its Materials and methods, fitted to
 * voltage-clamp steps in irregular-spiking cortical interneurons; and the conductance Mendonça PRF, Kyle V, Yeo
 * S-H, Colledge WH, Robinson HPC (2018) J Physiol 596:885, doi:10.1113/JP274474, injected into arcuate
 * kisspeptin neurons ("Artificial conductance injection"). First power of m:
 *
 *   I = ḡ·m·h·(V − E_K)
 *   m∞ = 1/(1 + exp((−30 − V)/10))            τm = 0.346·exp(−V/18.272) + 2.09 ms
 *   h∞ = 1/(1 + exp(0.0878·(V + 55.1)))       τh = 2.1·exp(−V/21.2) + 4.627 ms
 */
export const KV4 = {
  mInf: boltzmann(-30, -10),
  hInf: boltzmann(-55.1, 1 / 0.0878),
  tauM: (v: number) => 0.346 * Math.exp(-v / 18.272) + 2.09,
  tauH: (v: number) => 2.1 * Math.exp(-v / 21.2) + 4.627,
  /**
   * The reversal the injection uses, mV. The 2018 paper does not state it; the 2016 paper's model has
   * E_K = −90 mV and converts its recorded currents "assuming E_K ≈ −90 mV". An assumption, recorded as one.
   */
  eK: -90,
  /** The potential the 0 mV test step starts from, mV: the pre-pulse protocol of the 2018 paper's Fig. 5D steps from −90. */
  vPre: -90,
};

export function makeMendoncaKv4(): Channel {
  return makeGated(
    "kv4dc",
    "Kv4 (dynamic clamp)",
    [
      { name: "m", inf: KV4.mInf, tau: KV4.tauM },
      { name: "h", inf: KV4.hInf, tau: KV4.tauH },
    ],
    (g, o) => g[o] * g[o + 1],
  );
}

/** The share of ḡ open at steady state at v: the window, m∞·h∞. */
export const kv4Window = (v: number) => KV4.mInf(v) * KV4.hInf(v);

/**
 * The peak of m·h during a step to `vTest` from steady state at `vPre`. At a fixed voltage both gates relax
 * exponentially, so the time course is exact; the peak is found on a 1 µs grid.
 *
 * Mendonça state the dose not as ḡ but as "the peak transient value reached at a potential of 0 mV", g_max0.
 * This is the conversion: ḡ = g_max0 / kv4PeakFraction().
 */
export function kv4PeakFraction(vTest = 0, vPre = KV4.vPre): number {
  const m0 = KV4.mInf(vPre), h0 = KV4.hInf(vPre);
  const mI = KV4.mInf(vTest), hI = KV4.hInf(vTest);
  const tm = KV4.tauM(vTest), th = KV4.tauH(vTest);
  let best = 0;
  for (let t = 0; t <= 50; t += 0.001) {
    const x = (mI + (m0 - mI) * Math.exp(-t / tm)) * (hI + (h0 - hI) * Math.exp(-t / th));
    if (x > best) best = x;
  }
  return best;
}

/** Mendonça's Kv4 at a dose stated their way: `gmax0` nS of peak conductance at 0 mV, negative to subtract. */
export function kv4Injection(gmax0: number, eK = KV4.eK): Injected {
  return { channel: makeMendoncaKv4(), g: gmax0 / kv4PeakFraction(), erev: eK };
}

/** A conductance that is always open: a shunt, or a leak. */
export function makeShunt(id = "shunt", label = "Leak (dynamic clamp)"): Channel {
  return { id, label, nGates: 0, gateNames: [], init() {}, advance() {}, open: () => 1, openInf: () => 1 };
}

/** A plain leak of `g` nS (negative subtracts) reversing at `erev`. */
export function leakInjection(g: number, erev: number, id = "shunt"): Injected {
  return { channel: makeShunt(id), g, erev };
}

/**
 * What a Kv4 injection is at rest, as two plain leaks.
 *
 * At a steady potential v0 the injection passes I(V) = ḡ·w(V)·(V − E_K), w = m∞·h∞. Two things about it are
 * felt at rest, and a leak can copy either or both:
 *
 *   chord   ḡ·w(v0), reversing at E_K: the conductance that is open. It passes the same steady current at v0,
 *           so it moves the resting potential as the injection does, to first order.
 *   slope   dI/dV at v0 = ḡ·(w + w′·(V − E_K)): what a small step sees, so what input resistance sees. It is
 *           larger than the chord, because depolarizing also opens more of the window. A leak with this
 *           conductance and the reversal that makes its current at v0 equal the injection's is the injection's
 *           LINEARIZATION: same current and same slope at v0, and no gating.
 *
 * The linearization is the control: whatever the Kv4 injection does that its linearization also does is owed
 * to the change in passive properties. Kv4 with its linearization subtracted leaves rest and input resistance
 * at v0 untouched and keeps only the gating.
 */
export function linearizedAt(inj: Injected, v0: number): { chord: Injected; slope: Injected } {
  const w = (v: number) => inj.channel.openInf(v, 0);
  const h = 1e-3;
  const dw = (w(v0 + h) - w(v0 - h)) / (2 * h);
  const gChord = inj.g * w(v0);
  const gSlope = inj.g * (w(v0) + dw * (v0 - inj.erev));
  // gSlope·(v0 − E) = gChord·(v0 − E_K)
  const eSlope = v0 - (gChord * (v0 - inj.erev)) / gSlope;
  return { chord: leakInjection(gChord, inj.erev, "chord"), slope: leakInjection(gSlope, eSlope, "lin") };
}

/**
 * The amplifier's dynamic clamp as a setting (CellParams.clamp): plain data, resolved into injected conductances
 * when the cell is built (cell.ts clampInjected).
 */
export interface DynClamp {
  on: boolean;
  /** Mendonça's Kv4, or a plain leak */
  kind: "kv4" | "leak";
  /**
   * nS; negative subtracts. For Kv4 it is the dose as Mendonça state it, the peak conductance at 0 mV
   * (ḡ is 2.40 times it); for a leak, its conductance.
   */
  g: number;
  /** reversal, mV */
  erev: number;
  /**
   * Kv4 only: inject the Kv4 itself; or in its place the plain leak with its steady current and slope at rest
   * ("leak"); or the Kv4 with that leak subtracted, which leaves rest and input resistance as they were and
   * adds only the gating ("gating").
   */
  as: "kv4" | "leak" | "gating";
}

export const DEFAULT_CLAMP: DynClamp = { on: false, kind: "kv4", g: 0, erev: KV4.eK, as: "kv4" };

/** The same leak with its sign flipped: subtracts what the other adds. */
export function opposite(inj: Injected, id = `${inj.channel.id}neg`): Injected {
  return { channel: makeShunt(id), g: -inj.g, erev: inj.erev };
}

/** A dynamic clamp setting in words, for a summary line, a file header or a report; "" when it is off. */
export function describeClamp(c: DynClamp | undefined): string {
  if (!c || !c.on || c.g === 0) return "";
  const g = `${c.g > 0 ? "+" : "−"}${+Math.abs(c.g).toFixed(3)} nS`;
  if (c.kind === "leak") return `dynamic clamp: leak ${g}, reversing at ${c.erev} mV`;
  const what = c.as === "leak" ? "the leak that matches Kv4 at rest, in place of Kv4" : c.as === "gating" ? "Kv4 with its leak at rest subtracted (gating only)" : "Kv4";
  return `dynamic clamp: ${what}, ${g} peak at 0 mV, reversing at ${c.erev} mV`;
}
