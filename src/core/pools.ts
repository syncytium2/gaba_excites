/**
 * Cytosolic calcium pools. Like channels, a pool is an object the solver
 * drives without knowing its equation: given the calcium current it returns
 * the next calcium, or the steady calcium. Each model that carries calcium
 * names one. Units: Ca in µM, I_Ca in pA (inward negative), Cm in pF, ms.
 */

export interface CaPool {
  /** Ca at steady state when a steady I_Ca flows, on a cell of capacitance cm */
  steady(iCa: number, cm: number): number;
  /** Ca after one step of dt */
  advance(ca: number, iCa: number, cm: number, dt: number): number;
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
