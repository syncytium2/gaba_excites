/**
 * Cytosolic calcium pools. Like channels, a pool is an object the solver
 * drives without knowing its equation: given the calcium current it returns
 * the next calcium, or the steady calcium. Each model that carries calcium
 * names one. Units: Ca in µM, I_Ca in pA (inward negative), Cm in pF, ms.
 */

export interface CaPool {
  /** Ca at steady state when a steady I_Ca flows, on a cell of capacitance cm */
  steady(iCa: number, cm: number): number;
  /**
   * Ca after one step of dt. A pool with its own extra state (`nExtra`, e.g.
   * the endoplasmic reticulum's calcium) reads and advances it in
   * x[o..o+nExtra) in the same call.
   */
  advance(ca: number, iCa: number, cm: number, dt: number, x?: Float64Array, o?: number): number;
  /** number of extra state variables the pool keeps besides Ca (0 when absent) */
  nExtra?: number;
  /** write the extra state's steady values, given the steady Ca, into x[o..o+nExtra) */
  initExtra?(ca: number, x: Float64Array, o: number): void;
  /** names of the extra state variables, for display */
  extraNames?: readonly string[];
  /**
   * Which I_Ca the pool integrates. "before": the current at the start of the
   * step, before the voltage solve — NEURON's order (nrn_cur, solve,
   * nrn_state), needed where an oracle holds the port to NEURON. "after": the
   * current at the new V and gates.
   */
  reads: "before" | "after";
}

/**
 * Adams et al. 2018 Eq. 22, a saturable pump:
 *   dCa/dt = f · (−α·I_Ca − kp·Ca² / (Kp² + Ca²))
 * Stated for the published 20 pF cell; α does not scale with Cm. Forward
 * Euler, which is ample: with f = 0.0025 the pool moves by well under 0.1% of
 * itself per 0.01 ms step.
 */
export function adamsPool(p: { f: number; alpha: number; kp: number; Kp: number }): CaPool {
  return {
    reads: "after",
    steady(iCa) {
      // kp·Ca²/(Kp² + Ca²) = −α·I_Ca  →  Ca = Kp·√(x/(1−x)),  x = −α·I_Ca / kp.
      // When the influx exceeds what the pump can clear (x ≥ 1) there is no
      // steady state; it is capped, which only matters far into the
      // depolarized range.
      const x = (-p.alpha * iCa) / p.kp;
      if (x <= 0) return 0;
      if (x >= 0.9999) return 100;
      return p.Kp * Math.sqrt(x / (1 - x));
    },
    advance(ca, iCa, _cm, dt) {
      const pump = (p.kp * ca * ca) / (p.Kp * p.Kp + ca * ca);
      return Math.max(0, ca + dt * p.f * (-p.alpha * iCa - pump));
    },
  };
}

/** NEURON's cadecay_destexhe.mod Faraday constant, which the file declares itself. */
const FARADAY_CAD = 96489;

/**
 * Destexhe's submembrane shell, cadecay_destexhe.mod (ModelDB 123623):
 *   cai' = max(0, −10⁴·ica / (2F·depth)) + (cainf − cai) / taur
 * with ica in mA/cm² and depth in µm. ica per area is I(pA)·10⁻³ / Cm(pF) at
 * 1 µF/cm², so the pool is the same at any Cm. Inward current only: the
 * shell cannot pump in. The .mod file solves it by derivimplicit, which for
 * this linear equation is backward Euler, done here in closed form.
 */
export function destexheDecay(p: { depth: number; taur: number; cainf: number }): CaPool {
  // −10⁴·(I·10⁻³/Cm)/(2F·depth) mM/ms, ×10³ for µM/ms
  const drive = (iCa: number, cm: number) => Math.max(0, (-1e4 * iCa) / (cm * 2 * FARADAY_CAD * p.depth));
  return {
    reads: "before",
    steady(iCa, cm) {
      return p.cainf + p.taur * drive(iCa, cm);
    },
    advance(ca, iCa, cm, dt) {
      return (ca + dt * (drive(iCa, cm) + p.cainf / p.taur)) / (1 + dt / p.taur);
    },
  };
}

/**
 * Cytosolic and endoplasmic-reticulum calcium of the mouse beta-cell model of
 * Bertram, Satin, Zhang, Smolen & Sherman (2004) Biophys J 87:3074, Eqs. 12–17:
 *   dCa/dt   = f_cyt · (J_mem + J_er)
 *   J_mem    = −(α·I_Ca + k_PMCA·Ca)
 *   J_er     = p_leak·(Ca_er − Ca) − k_SERCA·Ca
 *   dCa_er/dt = −f_er · (V_cyt/V_er) · J_er
 * The paper states α per fA (4.5 × 10⁻⁶ fA⁻¹ µM ms⁻¹); here I_Ca is in pA, so
 * α is 1000× that. As in the paper, α is per cell and does not scale with Cm.
 * Forward Euler: the fastest rate, f_cyt·(k_PMCA + k_SERCA + p_leak) ≈ 0.006
 * ms⁻¹, moves Ca by under 0.01% of itself per 0.01 ms step.
 */
export function bertramPool(p: {
  fcyt: number;
  fer: number;
  /** µM ms⁻¹ per pA */
  alpha: number;
  kPMCA: number;
  kSERCA: number;
  pleak: number;
  /** V_cyt / V_er */
  sigmaV: number;
}): CaPool {
  return {
    reads: "after",
    nExtra: 1,
    extraNames: ["Ca_er"],
    // at steady state J_er = 0, so J_mem = 0: k_PMCA·Ca = −α·I_Ca
    steady(iCa) {
      return Math.max(0, (-p.alpha * iCa) / p.kPMCA);
    },
    // J_er = 0  →  Ca_er = Ca·(p_leak + k_SERCA)/p_leak
    initExtra(ca, x, o) {
      x[o] = (ca * (p.pleak + p.kSERCA)) / p.pleak;
    },
    advance(ca, iCa, _cm, dt, x, o = 0) {
      const caer = x ? x[o] : (ca * (p.pleak + p.kSERCA)) / p.pleak;
      const jer = p.pleak * (caer - ca) - p.kSERCA * ca;
      const jmem = -(p.alpha * iCa + p.kPMCA * ca);
      if (x) x[o] = caer - dt * p.fer * p.sigmaV * jer;
      return Math.max(0, ca + dt * p.fcyt * (jmem + jer));
    },
  };
}
