/**
 * The mouse beta cell (beta.ts) against Bertram et al. (2004) Biophys J
 * 87:3074. Every target below is a number or a pattern the paper states, with
 * where it says it; lit/notes/bertram2004.md has the quotes. The one exception
 * is marked CODE-DERIVED: the burst period the authors' own equations give
 * when integrated (LSODA, rtol 1e-9) from the same start, a check on this
 * port's transcription rather than a claim of the paper.
 *
 * Starting values for the whole-cell runs are those of the authors' figure
 * files (artielbm.github.io/Models/DOM1.0), cited in lit/sources.json.
 *
 * The slow patterns (Figs. 5–8) run at dt = 0.05 ms to keep the suite quick.
 * At that step the fast-bursting period is 7% longer than at the app's 0.01 ms
 * (34.7 against 32.4 s, docs/process.md); every tolerance below allows for it.
 */
import { describe, expect, it } from "vitest";
import {
  ATOT,
  adpSteady,
  atpOf,
  dADP,
  dGlyc,
  DOM_SETS,
  fbpSteady,
  g6pSteady,
  oInf,
} from "./beta.ts";
import { corr, DOM_START, meanDiff, peaks, runDom } from "./beta-run.ts";
import { buildCell, cellSteadyV } from "./cell.ts";
import { MODEL_LIST, MODELS } from "./models.ts";
import { bertramPool } from "./pools.ts";

// ---------------------------------------------------------------- helpers

/** Glycolysis alone with the nucleotides held as in Figs. 2 and 10: ATP = 2000 µM of A_tot = 3000. */
const ADP_FIXED = (() => {
  const atp = 2000;
  // ADP + ADP²/ATP = A_tot − ATP
  return (-atp + Math.sqrt(atp * atp + 4 * atp * (ATOT - atp))) / 2;
})();

function glycolysis(rGK: number, f6p0: number, fbp0: number, minutes: number) {
  let g = f6p0 / 0.3;
  let f = fbp0;
  const dt = 10; // ms; glycolysis moves on a scale of minutes
  const n = Math.round((minutes * 60000) / dt);
  const fbp: number[] = []; // one sample per second
  for (let i = 1; i <= n; i++) {
    const [dg, df] = dGlyc(rGK, g, f, ADP_FIXED);
    g += dt * dg;
    f += dt * df;
    if (i % 100 === 0) fbp.push(f);
  }
  return { f6p: 0.3 * g, fbp: f, trace: fbp };
}

// ---------------------------------------------------------------- pieces

describe("beta cell: the pieces hold their equations", () => {
  it("nucleotides: AMP + ADP + ATP = A_tot with AMP = ADP²/ATP (Eqs. 21–22)", () => {
    for (const adp of [100, 500, 800, 999]) {
      const atp = atpOf(adp);
      expect(adp * adp / atp + adp + atp).toBeCloseTo(ATOT, 6);
    }
  });

  it("K_ATP: more ATP closes it, more ADP opens it (Eq. 10)", () => {
    expect(oInf(800, atpOf(800))).toBeGreaterThan(oInf(600, atpOf(600)));
    expect(oInf(800, 1500)).toBeLessThan(oInf(800, 1000));
  });

  it("the steady states are steady: ADP (Eq. 23), glycolysis (Eqs. 18–19), ER calcium (Eqs. 14–17)", () => {
    for (const rGK of [0.2, 0.3, 0.4]) {
      for (const ca of [0.05, 0.1, 0.2]) {
        const adp = adpSteady(ca, rGK);
        expect(Math.abs(dADP(adp, ca, fbpSteady(rGK)))).toBeLessThan(1e-9);
        const [dg, df] = dGlyc(rGK, g6pSteady(rGK, adp), fbpSteady(rGK), adp);
        expect(Math.abs(dg)).toBeLessThan(1e-9);
        expect(Math.abs(df)).toBeLessThan(1e-9);
      }
    }
    const pool = bertramPool({ fcyt: 0.01, fer: 0.01, alpha: 4.5e-3, kPMCA: 0.2, kSERCA: 0.4, pleak: 0.0002, sigmaV: 31 });
    const ca = pool.steady(-20, 5.3);
    const x = new Float64Array(1);
    pool.initExtra!(ca, x, 0);
    expect(pool.advance(ca, -20, 5.3, 0.01, x, 0)).toBeCloseTo(ca, 12);
    expect(x[0]).toBeCloseTo(ca * 2001, 9);
  });

  it("is registered for the core but not offered in the app yet", () => {
    expect(MODELS.betamouse.id).toBe("betamouse");
    expect(MODEL_LIST.map((m) => m.id)).not.toContain("betamouse");
  });
});

// ---------------------------------------------------------------- glycolysis alone

describe("beta cell: glycolysis alone is a conditional oscillator (Figs. 2 and 10)", () => {
  it("oscillates at R_GK = 0.2 with a period of about 5 min; steady at 0.4 (Fig. 2)", () => {
    const osc = glycolysis(0.2, 81, 5, 60);
    const late = osc.trace.slice(1800);
    expect(Math.max(...late) - Math.min(...late)).toBeGreaterThan(10); // sustained, not damped
    const p = peaks(osc.trace, 1);
    expect(meanDiff(p.slice(-6)) / 60).toBeGreaterThan(4);
    expect(meanDiff(p.slice(-6)) / 60).toBeLessThan(7);

    const steady = glycolysis(0.4, 81, 5, 60);
    const tail = steady.trace.slice(1800);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.01);
    expect(steady.fbp).toBeCloseTo(fbpSteady(0.4), 3);
  });

  it("is bistable at R_GK = 0.3: F6P 75 rests near F6P ≈ 64, FBP ≈ 9.1; F6P 78 oscillates with a period of ~5 min (Fig. 10)", () => {
    const rest = glycolysis(0.3, 75, 8, 60);
    expect(rest.f6p).toBeGreaterThan(63);
    expect(rest.f6p).toBeLessThan(65);
    expect(rest.fbp).toBeGreaterThan(8.9);
    expect(rest.fbp).toBeLessThan(9.2);
    const tail = rest.trace.slice(2400);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.5);

    const osc = glycolysis(0.3, 78, 8, 60);
    const late = osc.trace.slice(1800);
    expect(Math.max(...late) - Math.min(...late)).toBeGreaterThan(10);
    const per = meanDiff(peaks(osc.trace, 1).slice(-6)) / 60;
    expect(per).toBeGreaterThan(4);
    expect(per).toBeLessThan(6.5);
  });
});

// ---------------------------------------------------------------- the whole cell

describe("beta cell: the burst patterns of Figs. 3 and 5–9", () => {
  it("Fig. 3: R_GK = 0.4 bursts with glycolysis stationary, period ≈ 30 s, ADP in phase with Ca (Fig. 9B)", () => {
    const r = runDom(DOM_SETS.fast, DOM_START.fast, 3, 0.01);
    const per = meanDiff(r.bursts.slice(-5));
    // paper: "much more rapid (period ≈ 30 s)"; CODE-DERIVED: the authors'
    // equations integrated by LSODA give 30.3–31.6 s over 6 min from this start
    expect(per).toBeGreaterThan(28);
    expect(per).toBeLessThan(35);
    expect(r.vMax).toBeGreaterThan(-25); // spikes
    expect(r.vMin).toBeLessThan(-60); // a silent phase
    // glycolysis stays near its steady state, with small ripples driven by the bursts
    expect(Math.min(...r.fbp)).toBeGreaterThan(12);
    expect(Math.max(...r.fbp)).toBeLessThan(20);
    expect(corr(r.ca, r.adp)).toBeGreaterThan(0);
  });

  it("has a measurable rest and input resistance at the steady state the app starts from", () => {
    const cell = buildCell({ model: "betamouse", cm: 5.3, gLeak: 0 });
    expect(Number.isFinite(cell.vRest)).toBe(true);
    expect(cell.vRest).toBeGreaterThan(-75);
    expect(cell.vRest).toBeLessThan(-40);
    expect(cellSteadyV(cell)).toBeCloseTo(cell.vRest, 9);
    expect(cell.rinRest).toBeGreaterThan(0);
  });
});
