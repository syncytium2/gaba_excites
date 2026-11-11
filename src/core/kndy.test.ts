/**
 * The arcuate kisspeptin (KNDy) cell of Qiu et al. 2024 against the authors' own MATLAB code, run unchanged:
 * src/core/oracle/matlab_kndy.json, written by tools/kndy_oracle.m, which says how to regenerate it. The oracle
 * integrates with ode45 at tight tolerances; the port is this repository's fixed-step scheme (backward Euler
 * for V, Rush–Larsen for the gates), which is first order, so spike times agree to a tolerance that halves
 * with dt. That convergence is tested too.
 *
 * Also here: the paper's parameter table describes a different cell, and it does not fire.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCell } from "./cell.ts";
import { KNDY_E2, KNDY_ID, KNDY_OVX, kndy, QIU_AS_WRITTEN, QIU_TABLE, QIU_TABLE_E2 } from "./kndy.ts";
import { MODEL_LIST, MODELS, type ModelDef } from "./models.ts";
import { runSweep, settle, type Electrode } from "./simulate.ts";
import { detectSpikes, sweepStats } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";

interface OracleCell {
  source: "code" | "table" | "written";
  state: "OVX" | "OVXE2";
  vRest: number;
  vRestScript: number;
  rinMOhm5000: number;
  resting: boolean;
  sweeps: { amp: number; spikes: number[] | number; nSpikes: number }[];
}
const oracle = JSON.parse(readFileSync(new URL("./oracle/matlab_kndy.json", import.meta.url), "utf8")) as { stepMs: number; cells: OracleCell[] };
const want = (source: string, state: string) => oracle.cells.find((c) => c.source === source && c.state === state)!;
const spikesOf = (sw: OracleCell["sweeps"][number]) => (Array.isArray(sw.spikes) ? sw.spikes : [sw.spikes]);

const DEFS: Record<string, ModelDef> = {
  "code OVX": KNDY_OVX,
  "code OVXE2": KNDY_E2,
  "table OVX": kndy(QIU_TABLE),
  "table OVXE2": kndy(QIU_TABLE_E2),
  "written OVX": kndy(QIU_AS_WRITTEN),
  "written OVXE2": kndy({ ...QIU_TABLE_E2, leakCaVh: -1e6 }),
};
const IDEAL: Electrode = { rs: 0, cp: 0, bridge: 0 };
const INPUTS = { ihold: 0, electrode: IDEAL, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
const cellOf = (m: ModelDef) => buildCell({ model: m.id, cm: m.defaults.cm, gLeak: m.defaults.gLeak }, m);

/** Spike times of a step from the settled cell, as the oracle runs it: the step starts at 0 and lasts the sweep. */
function spikeTimes(m: ModelDef, amp: number, dt = 0.01): number[] {
  const cell = cellOf(m);
  const st = settle(cell, IDEAL, 0, m.settleMs, dt);
  const sw = runSweep(cell, INPUTS, { sweepMs: oracle.stepMs, stepStart: 0, stepDur: oracle.stepMs, amps: [amp] }, amp, st, { dt, sampleMs: dt, seed: 1 }, 0);
  return detectSpikes(sw.vm, sw.sampleMs).map((s) => s.t);
}

describe("KNDy cell (Qiu et al. 2024) vs the authors' MATLAB code", () => {
  it("rests where the code rests, in all six cells, to 0.001 mV", () => {
    for (const c of oracle.cells) {
      const m = DEFS[`${c.source} ${c.state}`];
      const cell = cellOf(m);
      expect(c.resting).toBe(true);
      // the zero of the steady-state I–V, and where a run from it settles
      expect(Math.abs(cell.vRest - c.vRest)).toBeLessThan(1e-3);
      expect(Math.abs(settle(cell, IDEAL, 0, m.settleMs, 0.01)[cell.iv] - c.vRest)).toBeLessThan(1e-3);
    }
  });

  it("has the code's input resistance: a −2 pA step for 5 s, within 0.5%", () => {
    for (const state of ["OVX", "OVXE2"] as const) {
      const m = DEFS[`code ${state}`];
      const cell = cellOf(m);
      const st = settle(cell, IDEAL, 0, m.settleMs, 0.01);
      const sw = runSweep(cell, INPUTS, { sweepMs: 5000, stepStart: 0, stepDur: 5000, amps: [-2] }, -2, st, { dt: 0.01, sampleMs: 1, seed: 1 }, 0);
      const rin = ((sw.vm[sw.vm.length - 1] - st[cell.iv]) / -2) * 1000;
      expect(Math.abs(rin / want("code", state).rinMOhm5000 - 1)).toBeLessThan(0.005);
    }
  });

  // Measured 2026-11-11 at dt = 0.01 ms. OVX, 10 to 60 pA (7 to 22 Hz): counts exact, worst spike 5.0 ms late at
  // the end of 5 s of firing, the 112th spike of the 60 pA sweep; the error grows along the train and halves with
  // dt (2.5 ms at 0.005, 1.2 at 0.0025, 0.5 at 0.001). At 80 and 120 pA the train has a long pause whose timing
  // is sensitive to anything, and counts differ by 1 or 2 at dt = 0.01; those sweeps are not held.
  for (const amp of [5, 10, 15, 20, 30, 40, 60]) {
    it(`OVX, ${amp} pA: same spike count, every spike within 6 ms over 5 s`, () => {
      const got = spikeTimes(KNDY_OVX, amp);
      const ref = spikesOf(want("code", "OVX").sweeps.find((s) => s.amp === amp)!);
      expect(got.length).toBe(ref.length);
      for (let i = 0; i < got.length; i++) expect(Math.abs(got[i] - ref[i])).toBeLessThan(6);
    });
  }

  // OVX+E2 fires in bursts whose pattern is sensitive at most amplitudes; 5, 15 and 20 pA are held (worst 0.73 ms).
  for (const amp of [5, 15, 20]) {
    it(`OVX+E2, ${amp} pA: same spike count, every spike within 1 ms`, () => {
      const got = spikeTimes(KNDY_E2, amp);
      const ref = spikesOf(want("code", "OVXE2").sweeps.find((s) => s.amp === amp)!);
      expect(got.length).toBe(ref.length);
      for (let i = 0; i < got.length; i++) expect(Math.abs(got[i] - ref[i])).toBeLessThan(1);
    });
  }

  it("converges on the code as dt shrinks: at 0.0025 ms the 20 pA train is within 1 ms", () => {
    const ref = spikesOf(want("code", "OVX").sweeps.find((s) => s.amp === 20)!);
    const got = spikeTimes(KNDY_OVX, 20, 0.0025);
    expect(got.length).toBe(ref.length);
    for (let i = 0; i < got.length; i++) expect(Math.abs(got[i] - ref[i])).toBeLessThan(1);
  });

  it("fires in Mendonça's 7–13 Hz range at 10 to 20 pA, with no delayed rectifier", () => {
    for (const amp of [10, 15, 20]) {
      const n = want("code", "OVX").sweeps.find((s) => s.amp === amp)!.nSpikes;
      expect(n / 5).toBeGreaterThanOrEqual(7);
      expect(n / 5).toBeLessThanOrEqual(13);
    }
    expect(KNDY_OVX.channels().map((c) => c.channel.id)).toEqual(["nat", "nap", "a", "bk", "sk", "m", "h", "t", "ca", "trpc5", "leakca"]);
  });

  it("does not reproduce the resting potentials in the authors' script comment (−68.9241, −70.9198)", () => {
    // at the script's own solver tolerance the archived parameters give these, in MATLAB R2025b
    expect(want("code", "OVX").vRestScript).toBeCloseTo(-66.3638, 3);
    expect(want("code", "OVXE2").vRestScript).toBeCloseTo(-69.977, 3);
  });

  it("quotes its measured rheobase: an 800 ms step from rest", () => {
    for (const m of [KNDY_OVX, KNDY_E2]) {
      const cell = cellOf(m);
      const e: Electrode = { rs: 15, cp: 0, bridge: 1 };
      const proto = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [0] };
      const st = settle(cell, e, 0, m.settleMs, 0.01);
      const fires = (a: number) => sweepStats(runSweep(cell, { ...INPUTS, electrode: e }, proto, a, st, { dt: 0.01, sampleMs: 0.025, seed: 1 }, 0), proto).nInStep > 0;
      expect(fires(m.rheobase)).toBe(true);
      expect(fires(m.rheobase - 0.1)).toBe(false);
    }
  });
});

describe("the paper's parameter table is not the cell the code runs", () => {
  it("with the table's values the cell fires at most one spike, as the same values do in the authors' code", () => {
    for (const state of ["OVX", "OVXE2"] as const) {
      for (const amp of [20, 60, 120]) {
        const ref = want("table", state).sweeps.find((s) => s.amp === amp)!;
        expect(ref.nSpikes).toBeLessThanOrEqual(1);
        expect(spikeTimes(DEFS[`table ${state}`], amp).length).toBe(ref.nSpikes);
      }
    }
  });

  it("with the paper's leak equation as written it sits near −55 mV with about 21 MΩ and never fires", () => {
    const cell = cellOf(DEFS["written OVX"]);
    expect(cell.vRest).toBeCloseTo(-55.55, 1);
    expect(cell.rinRest).toBeCloseTo(21.5, 0);
    expect(want("written", "OVX").sweeps.every((s) => s.nSpikes === 0)).toBe(true);
    expect(spikeTimes(DEFS["written OVX"], 120).length).toBe(0);
  });
});

describe("the KNDy cell is private", () => {
  it("is not in the app's registry or its selector", () => {
    expect(Object.keys(MODELS)).not.toContain(KNDY_ID);
    expect(MODEL_LIST.map((m) => m.id)).not.toContain(KNDY_ID);
  });
});
