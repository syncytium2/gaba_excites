/**
 * Voltage-gated channels, stock set.
 *
 * Every channel implements the same small interface, and the integrator knows
 * nothing about any particular one. That seam is deliberate: the roadmap
 * (docs/roadmap.md) has plug-and-play channels and a channel editor, and they
 * should arrive as new objects satisfying `Channel`, not as edits to the solver.
 *
 * The Traub Na/Kd and M-current kinetics are transcribed from ModelDB 123623
 * (Pospischil et al. 2008, Biol Cybern 99:427), files HH_traub.mod and
 * IM_cortex.mod, at 36 °C where both temperature factors are exactly 1. The
 * builders further down (steady-state/τ gates, the Markov Na⁺ scheme, I_KCa)
 * carry the GnRH model of Adams et al. 2018; models.ts assembles both.
 * Units: mV, ms, nS, µM.
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
  /**
   * Open fraction (0..1) given the gates; conductance = gbar * openFraction.
   * `ca` is the cytosolic calcium in µM, for channels that sense it (0 in
   * models without a calcium pool).
   */
  open(s: Float64Array, o: number, ca: number): number;
  /** steady-state open fraction at v (and at the steady-state calcium) — used to find rest and Rin */
  openInf(v: number, ca: number): number;
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

// ---------------------------------------------------------------- generic HH gates
//
// The GnRH model (Adams et al. 2018) is written in the steady-state/time-
// constant form rather than α/β, with several gates per channel. These
// builders describe a gate as data; a channel is a list of gates and a rule
// for combining them. This is the first step toward the plug-and-play
// channels on the roadmap: a channel here is already mostly a table.

/** x∞(V) = 1 / (1 + exp((V − Vh)/k)); activation has k < 0, inactivation k > 0 (Adams 2018 Eq. 13). */
export function boltzmann(vh: number, k: number): (v: number) => number {
  return (v) => 1 / (1 + Math.exp((v - vh) / k));
}

/** τ(V) = e / (exp((a + V)/b) + exp((c + V)/d)) + f   (Adams 2018 Eq. 14). */
export function tauBell(a: number, b: number, c: number, d: number, e: number, f: number): (v: number) => number {
  return (v) => e / (Math.exp((a + v) / b) + Math.exp((c + v) / d)) + f;
}

/**
 * τ(V) = c · exp(−((V − a)/b)²) + d   (Adams 2018 Eq. 15, for Ih).
 * The printed equation has no `d`, but Table 2 lists one for both Ih gates
 * (7.6 and 54.1 ms). Read here as an additive floor; see docs/process.md.
 */
export function tauGauss(a: number, b: number, c: number, d = 0): (v: number) => number {
  return (v) => c * Math.exp(-(((v - a) / b) ** 2)) + d;
}

export interface GateSpec {
  name: string;
  inf: (v: number) => number;
  tau: number | ((v: number) => number);
}

/** A channel made of independent HH gates; `combine` turns the gate values into an open fraction. */
export function makeGated(id: string, label: string, gates: GateSpec[], combine: (g: Float64Array | number[], o: number) => number): Channel {
  const n = gates.length;
  const tauOf = gates.map((g) => (typeof g.tau === "number" ? (() => g.tau as number) : g.tau));
  return {
    id,
    label,
    nGates: n,
    gateNames: gates.map((g) => g.name),
    init(v, s, o) {
      for (let i = 0; i < n; i++) s[o + i] = gates[i].inf(v);
    },
    advance(v, dt, s, o) {
      for (let i = 0; i < n; i++) s[o + i] = relax(s[o + i], gates[i].inf(v), tauOf[i](v), dt);
    },
    open(s, o) {
      return combine(s, o);
    },
    openInf(v) {
      return combine(gates.map((g) => g.inf(v)), 0);
    },
  };
}

/**
 * Fast Na⁺ as a three-state Markov scheme per subunit, C ⇄ O ⇄ I ⇄ C, with
 * I_NaF = g·O³·(V − E_Na)   (Adams 2018 Eqs. 16–20). State kept: C and O.
 *
 *   dC/dt = r3(V)·I + β(V)·O − (α(V) + r4)·C
 *   dO/dt = r2·I + α(V)·C − (β(V) + r1)·O,     I = 1 − C − O
 *
 * At fixed V this is a linear 2×2 system, so it is advanced EXACTLY with the
 * closed-form matrix exponential — stable at any dt, as Rush–Larsen is for
 * independent gates.
 */
export interface MarkovNaRates {
  alpha: (v: number) => number;
  beta: (v: number) => number;
  r3: (v: number) => number;
  r1: number;
  r2: number;
  r4: number;
}

export function sigmoidRate(a: number, b: number, c: number): (v: number) => number {
  return (v) => a / (1 + Math.exp((v + b) / c)); // Adams 2018 Eq. 20
}

function naSystem(r: MarkovNaRates, v: number) {
  const al = r.alpha(v), be = r.beta(v), r3 = r.r3(v);
  const a11 = -(r3 + al + r.r4), a12 = be - r3;
  const a21 = al - r.r2, a22 = -(r.r2 + be + r.r1);
  const b1 = r3, b2 = r.r2;
  const det = a11 * a22 - a12 * a21;
  // fixed point x* = −A⁻¹ b
  const cs = -(a22 * b1 - a12 * b2) / det;
  const os = -(-a21 * b1 + a11 * b2) / det;
  return { a11, a12, a21, a22, cs, os };
}

export function makeMarkovNa(id: string, label: string, r: MarkovNaRates): Channel {
  return {
    id,
    label,
    nGates: 2,
    gateNames: ["C", "O"],
    init(v, s, o) {
      const q = naSystem(r, v);
      s[o] = q.cs;
      s[o + 1] = q.os;
    },
    advance(v, dt, s, o) {
      const q = naSystem(r, v);
      const x1 = s[o] - q.cs;
      const x2 = s[o + 1] - q.os;
      // expm(A·dt) for 2×2 A: e^{σt}[cosh(qt) I + sinh(qt)/q (A − σI)], q² = ((a11−a22)/2)² + a12·a21
      const sig = 0.5 * (q.a11 + q.a22);
      const hd = 0.5 * (q.a11 - q.a22);
      const q2 = hd * hd + q.a12 * q.a21;
      let ch: number, sh: number; // cosh(qt), sinh(qt)/q (or the trig forms when q² < 0)
      if (q2 > 1e-12) {
        const w = Math.sqrt(q2);
        ch = Math.cosh(w * dt);
        sh = Math.sinh(w * dt) / w;
      } else if (q2 < -1e-12) {
        const w = Math.sqrt(-q2);
        ch = Math.cos(w * dt);
        sh = Math.sin(w * dt) / w;
      } else {
        ch = 1;
        sh = dt;
      }
      const e = Math.exp(sig * dt);
      const m11 = e * (ch + sh * hd), m22 = e * (ch - sh * hd);
      const m12 = e * sh * q.a12, m21 = e * sh * q.a21;
      s[o] = q.cs + m11 * x1 + m12 * x2;
      s[o + 1] = q.os + m21 * x1 + m22 * x2;
    },
    open(s, o) {
      const O = s[o + 1];
      return O * O * O;
    },
    openInf(v) {
      const O = naSystem(r, v).os;
      return O * O * O;
    },
  };
}

/** Ca²⁺-activated K⁺, open = Ca² / (K² + Ca²), no voltage gates   (Adams 2018 Eq. 21). */
export function makeKCa(id: string, label: string, kHalf: number): Channel {
  const f = (ca: number) => (ca * ca) / (kHalf * kHalf + ca * ca);
  return {
    id,
    label,
    nGates: 0,
    gateNames: [],
    init() {},
    advance() {},
    open(_s, _o, ca) {
      return f(ca);
    },
    openInf(_v, ca) {
      return f(ca);
    },
  };
}
