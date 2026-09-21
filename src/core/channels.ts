/**
 * Voltage-gated channels, stock set.
 *
 * Every channel implements the same small interface, and the integrator knows
 * nothing about any particular one. That seam is deliberate: the roadmap
 * (docs/roadmap.md) has plug-and-play channels and a channel editor, and they
 * should arrive as new objects satisfying `Channel`, not as edits to the solver.
 *
 * Kinetics are transcribed from ModelDB 123623 (Pospischil et al. 2008,
 * Biol Cybern 99:427), files HH_traub.mod and IM_cortex.mod, at 36 °C where
 * both temperature factors are exactly 1. Units: mV, ms, nS.
 */

export interface Channel {
  /** stable id, used as a key in parameter objects */
  readonly id: string;
  readonly label: string;
  /** number of gating variables this channel keeps in the state vector */
  readonly nGates: number;
  /** names of the gating variables, for display */
  readonly gateNames: readonly string[];
  /** write steady-state gate values at voltage v into s[o..o+nGates) */
  init(v: number, s: Float64Array, o: number): void;
  /**
   * Advance the gates one step at fixed v, exactly (Rush–Larsen: each gate
   * relaxes exponentially toward its steady state at the current voltage).
   * This is the scheme NEURON's hh2 mechanism itself uses.
   */
  advance(v: number, dt: number, s: Float64Array, o: number): void;
  /** open fraction (0..1) given the gates; conductance = gbar * openFraction */
  open(s: Float64Array, o: number): number;
  /** steady-state open fraction at v — used to find rest and input resistance */
  openInf(v: number): number;
}

/** x / (exp(x/y) - 1), with the removable singularity at x = 0 handled. */
export function vtrap(x: number, y: number): number {
  return Math.abs(x / y) < 1e-6 ? y * (1 - x / y / 2) : x / (Math.exp(x / y) - 1);
}

/** hh2's Exp(): underflow-safe exp. */
function Exp(x: number): number {
  return x < -100 ? 0 : Math.exp(x);
}

function relax(x: number, xinf: number, tau: number, dt: number): number {
  return xinf + (x - xinf) * Math.exp(-dt / tau);
}

// ---------------------------------------------------------------- Traub Na / Kd

interface Rates {
  inf: number;
  tau: number;
}

function naM(v2: number): Rates {
  const a = 0.32 * vtrap(13 - v2, 4);
  const b = 0.28 * vtrap(v2 - 40, 5);
  return { inf: a / (a + b), tau: 1 / (a + b) };
}
function naH(v2: number): Rates {
  const a = 0.128 * Exp((17 - v2) / 18);
  const b = 4 / (1 + Exp((40 - v2) / 5));
  return { inf: a / (a + b), tau: 1 / (a + b) };
}
function kdN(v2: number): Rates {
  const a = 0.032 * vtrap(15 - v2, 5);
  const b = 0.5 * Exp((10 - v2) / 40);
  return { inf: a / (a + b), tau: 1 / (a + b) };
}

/** Transient Na+ current, I = gNa m³h (V − ENa). */
export function makeNa(vtraub: number): Channel {
  return {
    id: "na",
    label: "INa (Traub)",
    nGates: 2,
    gateNames: ["m", "h"],
    init(v, s, o) {
      s[o] = naM(v - vtraub).inf;
      s[o + 1] = naH(v - vtraub).inf;
    },
    advance(v, dt, s, o) {
      const m = naM(v - vtraub);
      const h = naH(v - vtraub);
      s[o] = relax(s[o], m.inf, m.tau, dt);
      s[o + 1] = relax(s[o + 1], h.inf, h.tau, dt);
    },
    open(s, o) {
      const m = s[o];
      return m * m * m * s[o + 1];
    },
    openInf(v) {
      const m = naM(v - vtraub).inf;
      return m * m * m * naH(v - vtraub).inf;
    },
  };
}

/** Delayed-rectifier K+ current, I = gKd n⁴ (V − EK). */
export function makeKd(vtraub: number): Channel {
  return {
    id: "kd",
    label: "IKd (Traub)",
    nGates: 1,
    gateNames: ["n"],
    init(v, s, o) {
      s[o] = kdN(v - vtraub).inf;
    },
    advance(v, dt, s, o) {
      const n = kdN(v - vtraub);
      s[o] = relax(s[o], n.inf, n.tau, dt);
    },
    open(s, o) {
      const n2 = s[o] * s[o];
      return n2 * n2;
    },
    openInf(v) {
      const n2 = kdN(v - vtraub).inf ** 2;
      return n2 * n2;
    },
  };
}

// ---------------------------------------------------------------- M current

function mP(v: number, tauMax: number): Rates {
  return {
    inf: 1 / (1 + Math.exp(-(v + 35) / 10)),
    tau: tauMax / (3.3 * Math.exp((v + 35) / 20) + Math.exp(-(v + 35) / 20)),
  };
}

/** Slow non-inactivating K+ (M) current, I = gM p (V − EK). Spike-frequency adaptation. */
export function makeM(tauMax: number): Channel {
  return {
    id: "m",
    label: "IM (slow K⁺)",
    nGates: 1,
    gateNames: ["p"],
    init(v, s, o) {
      s[o] = mP(v, tauMax).inf;
    },
    advance(v, dt, s, o) {
      const p = mP(v, tauMax);
      s[o] = relax(s[o], p.inf, p.tau, dt);
    },
    open(s, o) {
      return s[o];
    },
    openInf(v) {
      return mP(v, tauMax).inf;
    },
  };
}
