/**
 * Why did DeFazio, Keros, Quick & Hablitz (2000, J Neurosci 20:8069) have to
 * "correct for activity" to make their outside-out calibration patches agree
 * with the pipette chloride?
 *
 * The paper computed [Cl⁻]i = [Cl⁻]o·exp(−V_rev·F/RT) with [Cl⁻]o scaled by an
 * activity coefficient of 0.76 and [Cl⁻]i not scaled. Applied to one side only,
 * that is not an activity correction: it is a constant 7.2 mV shift of every
 * reversal potential. Applied to both sides it cancels (both solutions are
 * near 150 mM ionic strength). This file asks what the fudge was absorbing:
 *
 *   - the liquid junction potentials the solutions should have had (Henderson
 *     equation, mobilities from Barry 1994 / Barry & Lynch 1991); the paper says
 *     they were measured and corrected but prints no value;
 *   - the two patch calibrations, refitted with the recipe's bath chloride and
 *     every source of pipette chloride counted, against: a constant offset, a
 *     permeant pipette anion (gluconate, or Cl⁻ contaminating it), and both.
 *
 * An experiment, not part of the app. Run it: node tools/experiments/chloride_calibration.ts
 * Results and their reading: lit/notes/defazio2000.md. src/experiments.test.ts keeps it working.
 */
import { fileURLToPath } from "node:url";

const R = 8.314462618;
const F = 96485.33212;
/** RT/F in mV */
export const rtf = (celsius: number) => ((R * (celsius + 273.15)) / F) * 1000;

/** the paper's recording temperature */
export const T_REC = 30;

// ---------------------------------------------------------------- Henderson liquid junction potential

type Ion = "K" | "Na" | "Cl" | "Glu" | "HCO3" | "Ca" | "Mg" | "HEPES" | "EGTA" | "ATP";
export type Solution = Partial<Record<Ion, number>>;

/**
 * Mobilities relative to K⁺, per ion (the JPCalc convention, Barry 1994): limiting
 * equivalent conductances (Robinson & Stokes) divided by |z| and by K⁺'s.
 * HEPES⁻, EGTA²⁻ and ATP²⁻ are rough values; at 4–10 mM they move the answer by
 * a few tenths of a mV.
 */
export const MOBILITY: Record<Ion, number> = {
  K: 1, Na: 0.682, Cl: 1.0388, Glu: 0.33, HCO3: 0.605, Ca: 0.4048, Mg: 0.361, HEPES: 0.3, EGTA: 0.25, ATP: 0.3,
};
const Z: Record<Ion, number> = { K: 1, Na: 1, Cl: -1, Glu: -1, HCO3: -1, Ca: 2, Mg: 2, HEPES: -1, EGTA: -2, ATP: -2 };

/**
 * Generalized Henderson equation, concentrations for activities. Returns the
 * junction potential in the JPCalc sign: the bath relative to the pipette, so
 * that true Vm = V_read − LJP. `pipette` and `bath` must differ.
 */
export function henderson(pipette: Solution, bath: Solution, celsius = T_REC): number {
  const ions = new Set([...Object.keys(pipette), ...Object.keys(bath)] as Ion[]);
  let num = 0, den = 0, sP = 0, sB = 0;
  for (const i of ions) {
    const p = pipette[i] ?? 0, b = bath[i] ?? 0, u = MOBILITY[i], z = Z[i];
    num += z * u * (b - p);
    den += z * z * u * (b - p);
    sP += z * z * u * p;
    sB += z * z * u * b;
  }
  return rtf(celsius) * (num / den) * Math.log(sP / sB);
}

// ---------------------------------------------------------------- the paper's solutions (Methods)

/**
 * Recording saline: 125 NaCl, 3.5 KCl, 26 NaHCO3, 10 glucose, 2.5 CaCl2, 1.3 MgCl2.
 * Its chloride is 125 + 3.5 + 5 + 2.6 = 136.1 mM. The paper used 139.6.
 */
export const BATH: Solution = { Na: 151, K: 3.5, Ca: 2.5, Mg: 1.3, Cl: 136.1, HCO3: 26 };
export const BATH_CL = 136.1;
/** the paper's [Cl⁻]o, before its 0.76: 3.5 mM more than the recipe gives */
export const PAPER_CL_O = 139.6;
export const PAPER_GAMMA = 0.76;
/** GABA was puffed in 125 NaCl, 3.5 KCl, 20 HEPES, 10 glucose: less Cl⁻, no HCO3⁻, no Ca²⁺ or Mg²⁺ */
export const PUFFER_CL = 128.5;

/**
 * Pipette: 135 K-gluconate, 5 EGTA, 10 HEPES, 2 MgATP, 0.2 NaGTP, 0.2 CaCl2,
 * with KCl substituted for K-gluconate; [K⁺] 150 mM; pH 7.3 (HEPES about 39%
 * deprotonated). The "added Cl⁻" of 1, 20 or 40 mM leaves out the CaCl2's 0.4 mM.
 */
export function pipette(addedCl: number): Solution {
  return { K: 150, Na: 0.2, Cl: addedCl + 0.4, Glu: 135 - addedCl, HEPES: 3.9, EGTA: 5, ATP: 2 };
}

// ---------------------------------------------------------------- the patch calibrations (Results)

/**
 * Outside-out patches, [Cl⁻]i as the paper reports it (computed with 106.1 mM).
 * 1 mM: 2.06 ± 0.16 (n = 4) in the Discussion and at 1 mM in the text; the
 * Results paragraph gives 2.10 ± 0.16 (n = 4) for the same patches.
 * 20 mM: 21.69 ± 0.72 (n = 7). The 40 mM patches are only in Fig. 2A.
 */
export const PATCHES = [
  { addedCl: 1, reportedCl: 2.06 },
  { addedCl: 20, reportedCl: 21.69 },
];

/** the reversal potential behind a reported [Cl⁻]i: undo the paper's formula */
export function reversalFromReported(reportedCl: number): number {
  return rtf(T_REC) * Math.log(reportedCl / (PAPER_CL_O * PAPER_GAMMA));
}

/** the constant shift a one-sided activity coefficient amounts to, mV */
export const oneSidedShift = (gamma = PAPER_GAMMA) => rtf(T_REC) * Math.log(1 / gamma);

export interface Refit {
  vrev: number[];
  /** Nernst with every Cl⁻ counted, the recipe's bath, activities equal on both sides */
  expected: number[];
  /** measured − expected, mV */
  gap: number[];
  /** P_glu/P_Cl that alone would explain each point: should agree, and does not */
  gluconateOnly: number[];
  /** the two-parameter fit: a constant offset (mV, positive = reversals read too depolarized) and P_glu/P_Cl */
  offset: number;
  pGlu: number;
  /** what the fit predicts for the 40 mM patches, which are only in Fig. 2A */
  predict40: { vrev: number; reportedCl: number; vrevNoOffset: number };
}

export function refit(bathCl = BATH_CL): Refit {
  const phi = rtf(T_REC);
  const vrev = PATCHES.map((p) => reversalFromReported(p.reportedCl));
  const ci = PATCHES.map((p) => pipette(p.addedCl).Cl!);
  const glu = PATCHES.map((p) => pipette(p.addedCl).Glu!);
  const expected = ci.map((c) => phi * Math.log(c / bathCl));
  const apparent = vrev.map((v) => bathCl * Math.exp(v / phi));
  // k·apparent = ci + p·glu, with k = exp(−offset/RT·F): two equations, two unknowns
  const det = -apparent[0] * glu[1] + glu[0] * apparent[1];
  const k = (-ci[0] * glu[1] + glu[0] * ci[1]) / det;
  const pGlu = (apparent[0] * ci[1] - ci[0] * apparent[1]) / det;
  const offset = -phi * Math.log(k);
  const p40 = pipette(40);
  const vrevNoOffset = phi * Math.log((p40.Cl! + pGlu * p40.Glu!) / bathCl);
  const v40 = vrevNoOffset + offset;
  return {
    vrev,
    expected,
    gap: vrev.map((v, i) => v - expected[i]),
    gluconateOnly: apparent.map((a, i) => (a - ci[i]) / glu[i]),
    offset,
    pGlu,
    predict40: { vrev: v40, reportedCl: PAPER_CL_O * PAPER_GAMMA * Math.exp(v40 / phi), vrevNoOffset: phi * Math.log(p40.Cl! / bathCl) },
  };
}

// ---------------------------------------------------------------- report

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = (x: number, d = 1) => x.toFixed(d);
  console.log(`Henderson LJP (bath re pipette, ${T_REC} °C; true Vm = V_read − LJP)`);
  console.log(`  checks: 150 KCl | 150 NaCl ${f(henderson({ K: 150, Cl: 150 }, { Na: 150, Cl: 150 }))} mV; 140 K-gluconate | saline ${f(henderson({ K: 140, Glu: 140 }, BATH))} mV`);
  for (const c of [1, 20, 40]) console.log(`  pipette with ${c} mM KCl: ${f(henderson(pipette(c), BATH))} mV`);
  console.log(`\nOne-sided activity (γ ${PAPER_GAMMA}) = a constant ${f(oneSidedShift(), 2)} mV shift`);
  console.log(`Bath Cl⁻: paper ${PAPER_CL_O}, recipe ${BATH_CL} (${f(rtf(T_REC) * Math.log(PAPER_CL_O / BATH_CL), 2)} mV); puffer ${PUFFER_CL} (${f(rtf(T_REC) * Math.log(BATH_CL / PUFFER_CL), 2)} mV)`);
  const r = refit();
  console.log(`\nPatch calibrations (pipette Cl⁻ counted with CaCl2: 1.4 and 20.4 mM; bath ${BATH_CL})`);
  PATCHES.forEach((p, i) =>
    console.log(`  ${p.addedCl} mM: V_rev ${f(r.vrev[i])}, expected ${f(r.expected[i])}, gap ${f(r.gap[i])} mV; gluconate alone needs P ${f(r.gluconateOnly[i], 4)}`),
  );
  console.log(`  fit: offset ${f(r.offset)} mV + P_glu/P_Cl ${f(r.pGlu, 4)}`);
  console.log(`  40 mM patches (Fig. 2A) should read ${f(r.predict40.vrev)} mV (${f(r.predict40.reportedCl)} mM by the paper's formula); with no offset ${f(r.predict40.vrevNoOffset)} mV`);
}
