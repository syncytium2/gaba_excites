/**
 * The mouse pancreatic beta cell: the Dual Oscillator Model of Bertram R,
 * Satin L, Zhang M, Smolen P, Sherman A (2004) "Calcium and glycolysis mediate
 * multiple bursting modes in pancreatic islets", Biophys J 87:3074–3087,
 * doi:10.1529/biophysj.104.049262, with the authors' published errata.
 *
 * Transcribed from the paper (Eqs. 1–24, Table 1); lit/notes/bertram2004.md
 * holds the transcription, every value with where it was read. One piece is
 * not printed there: the PFK rate law, which the paper takes from Smolen
 * (1995) J Theor Biol 174:137, Eqs. 3 and 12. It is written here from the
 * authors' XPP code (artielbm.github.io/Models/DOM1.0, glycophan.ode), cited
 * to that code in lit/sources.json. No file of theirs is in this repository.
 *
 * Four currents (Eq. 1): a delayed-rectifier K⁺ current, a Ca²⁺ current with
 * instantaneous activation, a Ca²⁺-activated K⁺ current, and a K_ATP current
 * whose conductance follows ADP and ATP. Behind K_ATP sits the slow part:
 * glycolysis (G6P, FBP; the PFK enzyme can oscillate on its own) feeding
 * mitochondrial ATP production, which calcium slows (ADP, Eq. 23). Those
 * three variables live in the K_ATP channel's state, because K_ATP is the
 * only current that reads them; the solver does not know they are metabolism.
 * Cytosolic and ER calcium are the pool (pools.ts, bertramPool).
 *
 * Units here: mV, ms, nS, pA, pF, µM. The paper's are pS, fA, fF; conductances
 * are /1000 and Cm is 5.3 pF. Glycolytic rates are in µM s⁻¹ as printed, and
 * κ = 0.005 (the errata's name for the λ of Eqs. 18–19) turns them into
 * per-ms changes, as the paper says it does.
 */

import { boltzmann, makeGated, makeKCa, type Channel } from "./channels.ts";
import { bertramPool } from "./pools.ts";
import type { ModelDef } from "./models.ts";

// ---------------------------------------------------------------- nucleotides

/** Total adenine nucleotide, µM (Table 1). */
export const ATOT = 3000;

/**
 * ATP from ADP, Eqs. 21–22: AMP + ADP + ATP = A_tot with adenylate kinase at
 * equilibrium, AMP = ADP²/ATP. Solving for ATP gives the larger root of
 * ATP² − (A_tot − ADP)·ATP + ADP² = 0. Real only for ADP ≤ A_tot/3.
 */
export function atpOf(adp: number): number {
  const b = ATOT - adp;
  return 0.5 * (b + Math.sqrt(Math.max(0, b * b - 4 * adp * adp)));
}

/**
 * K_ATP open fraction, Eqs. 10–11 (Magnus & Keizer 1998, used unmodified):
 * MgADP⁻ = 0.165·ADP, ADP³⁻ = 0.135·ADP, ATP⁴⁻ = 0.05·ATP; 17, 26 and 1 µM.
 */
export function oInf(adp: number, atp: number): number {
  const mgadp = 0.165 * adp;
  const adp3 = 0.135 * adp;
  const atp4 = 0.05 * atp;
  const top = 0.08 * (1 + (2 * mgadp) / 17) + 0.89 * (mgadp / 17) ** 2;
  const bottom = (1 + mgadp / 17) ** 2 * (1 + adp3 / 26 + atp4 / 1);
  return top / bottom;
}

// ---------------------------------------------------------------- glycolysis

/**
 * PFK rate, µM s⁻¹: Smolen (1995) Eqs. 3 and 12, as the authors' code writes
 * them. The enzyme has four binding sites, each empty or bound: AMP (K1),
 * FBP (K2), F6P (K3, entering squared) and ATP (K4, squared). Each of the 16
 * states has weight ∏(ligand term) / ∏(f for each bound pair), where f scales
 * one ligand's affinity when the other is bound: f13 AMP·F6P, f23 FBP·F6P,
 * f41 AMP·ATP, f42 FBP·ATP, f43 F6P·ATP; AMP·FBP has none. Only F6P-bound
 * states turn over: the AMP+FBP+F6P state (no ATP) at Vmax, every other at
 * λ·Vmax. Parameters: Table 1, with Vmax = 2 from the errata.
 */
export const PFK = { K1: 30, K2: 1, K3: 50000, K4: 1000, f13: 0.02, f23: 0.2, f41: 20, f42: 20, f43: 20, lambda: 0.06, vmax: 2 };

export function rPFK(f6p: number, fbp: number, amp: number, atp: number): number {
  const p = PFK;
  const tAmp = amp / p.K1;
  const tFbp = fbp / p.K2;
  const tF6p = (f6p * f6p) / p.K3;
  const tAtp = (atp * atp) / p.K4;
  let bottom = 0;
  let topa = 0;
  let topb = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let c = 0; c < 2; c++)
        for (let d = 0; d < 2; d++) {
          let w = (a ? tAmp : 1) * (b ? tFbp : 1) * (c ? tF6p : 1) * (d ? tAtp : 1);
          if (a && c) w /= p.f13;
          if (b && c) w /= p.f23;
          if (a && d) w /= p.f41;
          if (b && d) w /= p.f42;
          if (c && d) w /= p.f43;
          bottom += w;
          if (!c) continue;
          if (a && b && !d) topb += w;
          else topa += w;
        }
  return (p.vmax * (p.lambda * topa + topb)) / bottom;
}

/** GPDH rate, µM s⁻¹: R_GPDH = 0.2·√(FBP / 1 µM). */
export function rGPDH(fbp: number): number {
  return 0.2 * Math.sqrt(Math.max(0, fbp));
}

/** Eq. 18–19 rate factor κ (named λ in the paper; renamed in the errata). */
export const KAPPA = 0.005;

/** Mitochondria, Eqs. 23–24 and Table 1. τa = 300 000 ms (5 min). */
export const MITO = { r: 1, r1: 0.35, tauA: 300000, vGamma: 2.2, kGamma: 10 };

/** Glycolytic input to the mitochondria, Eq. 24. */
export function gammaOf(rgpdh: number): number {
  return (MITO.vGamma * rgpdh) / (MITO.kGamma + rgpdh);
}

/** dADP/dt, µM ms⁻¹, Eq. 23. */
export function dADP(adp: number, ca: number, fbp: number): number {
  const atp = atpOf(adp);
  return (atp - adp * Math.exp((MITO.r + gammaOf(rGPDH(fbp))) * (1 - ca / MITO.r1))) / MITO.tauA;
}

/** dG6P/dt and dFBP/dt, µM ms⁻¹, Eqs. 18–20 (F6P = 0.3·G6P), given the nucleotides. */
export function dGlyc(rGK: number, g6p: number, fbp: number, adp: number): [number, number] {
  const atp = atpOf(adp);
  const amp = (adp * adp) / atp;
  const rp = rPFK(0.3 * g6p, fbp, amp, atp);
  return [KAPPA * (rGK - rp), KAPPA * (rp - 0.5 * rGPDH(fbp))];
}

/** Steady FBP: R_PFK = R_GK and R_PFK = R_GPDH/2, so R_GPDH = 2·R_GK. */
export function fbpSteady(rGK: number): number {
  return (2 * rGK / 0.2) ** 2;
}

/** Steady G6P at a given ADP: the G6P at which R_PFK = R_GK, by bisection (R_PFK rises with F6P). */
export function g6pSteady(rGK: number, adp: number): number {
  const fbp = fbpSteady(rGK);
  const atp = atpOf(adp);
  const amp = (adp * adp) / atp;
  let lo = 0;
  let hi = 1e5;
  for (let it = 0; it < 200; it++) {
    const mid = 0.5 * (lo + hi);
    if (rPFK(0.3 * mid, fbp, amp, atp) < rGK) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Steady ADP at cytosolic calcium `ca` with glycolysis at its steady flux:
 * the zero of Eq. 23, ATP(ADP) = ADP·exp((r + γ)(1 − Ca/r1)), on 0 ≤ ADP ≤ A_tot/3.
 */
export function adpSteady(ca: number, rGK: number): number {
  const e = Math.exp((MITO.r + gammaOf(rGPDH(fbpSteady(rGK)))) * (1 - ca / MITO.r1));
  const g = (adp: number) => atpOf(adp) - adp * e;
  let lo = 0;
  let hi = ATOT / 3;
  if (g(hi) >= 0) return hi;
  for (let it = 0; it < 200; it++) {
    const mid = 0.5 * (lo + hi);
    if (g(mid) > 0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * The K_ATP current with the metabolism behind it. Its three state variables
 * are ADP, G6P and FBP (µM); its open fraction is o∞(ADP, ATP). They move by
 * forward Euler at the solver's step: the fastest of them changes by well
 * under 0.01% of itself per 0.01 ms.
 */
export function makeKatpDOM(rGK: number): Channel {
  return {
    id: "katp",
    label: "IK(ATP), with glycolysis and mitochondria",
    nGates: 3,
    gateNames: ["ADP", "G6P", "FBP"],
    init(_v, s, o, ca = 0) {
      const adp = adpSteady(ca, rGK);
      s[o] = adp;
      s[o + 1] = g6pSteady(rGK, adp);
      s[o + 2] = fbpSteady(rGK);
    },
    advance(_v, dt, s, o, ca = 0) {
      const adp = s[o];
      const g6p = s[o + 1];
      const fbp = s[o + 2];
      const [dg, df] = dGlyc(rGK, g6p, fbp, adp);
      s[o] = Math.min(ATOT / 3, Math.max(0, adp + dt * dADP(adp, ca, fbp)));
      s[o + 1] = Math.max(0, g6p + dt * dg);
      s[o + 2] = Math.max(0, fbp + dt * df);
    },
    open(s, o) {
      return oInf(s[o], atpOf(s[o]));
    },
    openInf(_v, ca) {
      const adp = adpSteady(ca, rGK);
      return oInf(adp, atpOf(adp));
    },
  };
}

// ---------------------------------------------------------------- the model

/**
 * A parameter set of the paper. The figures differ only in R_GK (the
 * glucokinase rate, the paper's stand-in for glucose) and the two maximal
 * K⁺ conductances; every other value is Table 1.
 */
export interface DomSet {
  /** glucokinase rate, µM s⁻¹ */
  rGK: number;
  /** maximal K_ATP conductance, nS */
  gKATP: number;
  /** maximal K(Ca) conductance, nS */
  gKCa: number;
}

/** The figure parameter sets, from the figure legends (gK(ATP) 25 nS and gK(Ca) 600 pS are Table 1). */
export const DOM_SETS = {
  /** Fig. 3: glycolysis stationary, bursting driven by calcium alone */
  fast: { rGK: 0.4, gKATP: 25, gKCa: 0.6 },
  /** Fig. 5: compound bursting */
  compound: { rGK: 0.2, gKATP: 25, gKCa: 0.6 },
  /** Fig. 6: accordion bursting */
  accordion: { rGK: 0.2, gKATP: 23, gKCa: 0.6 },
  /** Fig. 7: slow glycolytic bursting */
  glycolytic: { rGK: 0.2, gKATP: 27, gKCa: 0.1 },
  /** Fig. 8: subthreshold glycolytic oscillations */
  subthreshold: { rGK: 0.2, gKATP: 30, gKCa: 0.1 },
} satisfies Record<string, DomSet>;

/** Published capacitance, 5300 fF. */
export const BETA_CM = 5.3;
const VK = -75;
const VCA = 25;

export function betaMouse(set: DomSet = DOM_SETS.fast): ModelDef {
  return {
    id: "betamouse",
    label: "Pancreatic beta cell (mouse)",
    short: "β-cell (mouse)",
    blurb:
      "Bertram et al. 2004: IK, ICa, IK(Ca) and IK(ATP), with ER calcium, glycolysis and mitochondria. Bursts on its own in stimulatory glucose.",
    citation: "Bertram R, Satin L, Zhang M, Smolen P, Sherman A (2004) Biophys J 87:3074–3087",
    doi: "10.1529/biophysj.104.049262",
    cmRef: BETA_CM,
    // The model has no leak. The app's leak control starts at 0 nS; this is
    // the reversal it opens on if it is turned up.
    eLeak: -70,
    channels: () => [
      // Eqs. 2, 7–8: n∞ = 1/(1 + exp(−(16 + V)/5)), τn = 20 ms; gK = 2700 pS
      {
        channel: makeGated("kdr", "IK (delayed rectifier)", [{ name: "n", inf: boltzmann(-16, -5), tau: 20 }], (g, o) => g[o]),
        gbar: 2.7,
        erev: VK,
      },
      // Eqs. 3, 9: m∞ = 1/(1 + exp(−(20 + V)/12)), instantaneous; gCa = 1000 pS.
      // "Instantaneous" here: a gate with τ = 1e-9 ms, set to m∞ at the new V
      // each step, so the conductance lags V by one step (0.01 ms).
      {
        channel: makeGated("cav", "ICa", [{ name: "m", inf: boltzmann(-20, -12), tau: 1e-9 }], (g, o) => g[o]),
        gbar: 1.0,
        erev: VCA,
        carriesCa: true,
      },
      // Eq. 6: gK(Ca) = ḡ·Ca²/(K_D² + Ca²), K_D = 0.5 µM
      { channel: makeKCa("kca", "IK(Ca)", 0.5), gbar: set.gKCa, erev: VK },
      // Eqs. 5, 10–11, 18–24
      { channel: makeKatpDOM(set.rGK), gbar: set.gKATP, erev: VK },
    ],
    // Eqs. 12–17 and Table 1: α = 4.5e-6 fA⁻¹ µM ms⁻¹ = 4.5e-3 pA⁻¹ µM ms⁻¹
    pool: bertramPool({ fcyt: 0.01, fer: 0.01, alpha: 4.5e-3, kPMCA: 0.2, kSERCA: 0.4, pleak: 0.0002, sigmaV: 31 }),
    defaults: { cm: BETA_CM, gLeak: 0, ihold: 0, eGaba: -40 },
    // Not yet sourced for mouse beta cells: a placeholder until the GABA
    // lesson for this cell is written, with its own citation.
    eGabaSource: "placeholder, not yet sourced for mouse beta cells",
    ranges: {
      gLeak: { min: 0, max: 2, step: 0.05 },
      cm: { min: 2, max: 15, step: 0.1 },
      ihold: { min: -20, max: 20, step: 0.5 },
      memNoise: { min: 0, max: 5, step: 0.1 },
    },
    // Rheobase is not defined for a cell that fires on its own in
    // stimulatory glucose; the model is not in the app's list yet.
    rheobase: 0,
    rheobaseTol: 0.1,
    settleMs: 60000,
    validation:
      "Transcribed from the paper, the PFK rate law from the authors' code. Checked against the paper's reported glycolytic periods, its bistability point, and its burst patterns; not yet against the authors' code run in XPP.",
  };
}

export const BETA_MOUSE: ModelDef = betaMouse();

