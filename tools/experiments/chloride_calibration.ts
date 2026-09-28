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
 *   - the three patch calibrations (1 and 20 mM from the text, 40 mM read off
 *     Fig. 2A), refitted with the recipe's bath chloride and every source of
 *     pipette chloride counted, against a voltage error (constant, or a
 *     fraction of each pipette's junction potential) with and without a
 *     permeant pipette anion (gluconate, or Cl⁻ contaminating it).
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

// ---------------------------------------------------------------- the patch calibrations (Results, Fig. 2A)

/**
 * Outside-out patches. 1 and 20 mM: [Cl⁻]i as the paper reports it (computed
 * with 106.1 mM), turned back into V_rev. 1 mM: 2.06 ± 0.16 mM, n = 4 (the
 * Results paragraph gives 2.10 for the same patches; the text's V_rev is
 * −102.8 ± 2.0). 20 mM: 21.69 ± 0.72 mM, n = 7. 40 mM is only in Fig. 2A: read
 * off the axes at −26.8 mV, the same reading that gives −102.6 and −41.1 for
 * the other two. `sd` is the SEM in mV, or the reading error for 40 mM.
 */
export const PATCHES = [
  { addedCl: 1, reportedCl: 2.06 as number | undefined, fig2a: -102.6, sd: 2.0 },
  { addedCl: 20, reportedCl: 21.69 as number | undefined, fig2a: -41.1, sd: 0.9 },
  { addedCl: 40, reportedCl: undefined, fig2a: -26.8, sd: 1.0 },
];

/** the reversal potential behind a reported [Cl⁻]i: undo the paper's formula */
export function reversalFromReported(reportedCl: number): number {
  return rtf(T_REC) * Math.log(reportedCl / (PAPER_CL_O * PAPER_GAMMA));
}

export const patchVrev = () => PATCHES.map((p) => (p.reportedCl ? reversalFromReported(p.reportedCl) : p.fig2a));

/** the constant shift a one-sided activity coefficient amounts to, mV */
export const oneSidedShift = (gamma = PAPER_GAMMA) => rtf(T_REC) * Math.log(1 / gamma);

/**
 * Explanations of the patch reversals, each as V_rev(i; a, b): Nernst with
 * every Cl⁻ counted and the recipe's bath, plus a voltage error, plus a
 * permeant pipette anion (gluconate, or Cl⁻ contaminating it).
 */
export const MODELS_CL = {
  /** a constant voltage offset `a`, nothing else */
  offset: (a: number, _b: number, i: number) => a + nernst(i, 0),
  /** a constant offset `a` and gluconate with P_glu/P_Cl = `b` */
  offsetGluconate: (a: number, b: number, i: number) => a + nernst(i, b),
  /** a fraction `a` of each pipette's own junction potential, and gluconate `b` */
  ljpFractionGluconate: (a: number, b: number, i: number) => a * henderson(pipette(PATCHES[i].addedCl), BATH) + nernst(i, b),
};
function nernst(i: number, pGlu: number): number {
  const s = pipette(PATCHES[i].addedCl);
  return rtf(T_REC) * Math.log((s.Cl! + pGlu * s.Glu!) / BATH_CL);
}

export interface Fit { a: number; b: number; chi2: number; resid: number[] }

/** weighted least squares on a grid (two parameters, three points: a grid is plenty) */
export function fitPatches(model: keyof typeof MODELS_CL, aRange: [number, number], bRange: [number, number]): Fit {
  const m = MODELS_CL[model], v = patchVrev();
  let best: Fit = { a: 0, b: 0, chi2: Infinity, resid: [] };
  for (let j = 0; j <= 300; j++)
    for (let k = 0; k <= (bRange[0] === bRange[1] ? 0 : 300); k++) {
      const a = aRange[0] + ((aRange[1] - aRange[0]) * j) / 300, b = bRange[0] + ((bRange[1] - bRange[0]) * k) / 300;
      const chi2 = v.reduce((s, x, i) => s + ((x - m(a, b, i)) / PATCHES[i].sd) ** 2, 0);
      if (chi2 < best.chi2) best = { a, b, chi2, resid: v.map((x, i) => x - m(a, b, i)) };
    }
  return best;
}

export function refit() {
  const v = patchVrev();
  const expected = PATCHES.map((_, i) => nernst(i, 0));
  return {
    vrev: v,
    expected,
    gap: v.map((x, i) => x - expected[i]),
    /** the paper's own frame: patch minus its theory line (103.4 mM, added Cl⁻ only); positive = above the line */
    vsPaperTheory: PATCHES.map((p, i) => v[i] - rtf(T_REC) * Math.log(p.addedCl / 103.4)),
    offset: fitPatches("offset", [-5, 20], [0, 0]),
    offsetGluconate: fitPatches("offsetGluconate", [-5, 15], [0, 0.03]),
    ljpFractionGluconate: fitPatches("ljpFractionGluconate", [0, 1.2], [0, 0.03]),
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
  console.log(`\nPatch reversals (Cl⁻ counted with CaCl2: 1.4, 20.4, 40.4 mM; bath ${BATH_CL})`);
  PATCHES.forEach((p, i) =>
    console.log(`  ${p.addedCl} mM: V_rev ${f(r.vrev[i])}, expected ${f(r.expected[i])}, gap ${f(r.gap[i])} mV; ${f(r.vsPaperTheory[i])} mV from the paper's theory line`),
  );
  const show = (name: string, x: Fit, unit: string) =>
    console.log(`  ${name.padEnd(34)} ${f(x.a, 2)}${unit}  P_glu ${f(x.b, 4)}  χ² ${f(x.chi2, 1)}  residuals ${x.resid.map((e) => f(e)).join(", ")} mV`);
  show("constant offset", r.offset, " mV");
  show("offset + gluconate", r.offsetGluconate, " mV");
  show("fraction of the LJP + gluconate", r.ljpFractionGluconate, " ×LJP");
}
