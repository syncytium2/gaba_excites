/**
 * Does a train of GABA_A IPSPs do what a hyperpolarizing step does to the LTS
 * cell — fire it on release? The step does (src/core/lts.test.ts): from
 * −64 mV (60 pA hold), a 500 ms step to −80 mV fires one spike 88 ms after
 * release, but a step to −70 mV fires none. So the rebound needs the cell
 * taken to about −78 mV or below.
 *
 * A conductance cannot take the cell past its own reversal, and against the
 * hold it falls well short of it. With E_GABA −80 mV a 100 Hz train bottoms
 * out near −79 mV even at 40 nS per event, and never rebounds the cell. With
 * E_GABA −85 mV it takes 10 nS; at −90 mV, 5 nS; at −95 mV (near E_K, where
 * a GABA_B response reverses), 3 nS. So
 * the GABA that rebounds this cell is GABA whose reversal sits below the
 * T channels' inactivation range, not the conventional −80 mV GABA_A.
 *
 * The app's GABA input runs for the whole sweep, so a train that stops is
 * built here from the shipped step() and synaptic kinetics: regular events
 * from 200 ms for `durMs`, PSC 0.5/10 ms (the app's GABA default), then
 * nothing until 1500 ms.
 *
 * An experiment, not part of the app. src/experiments.test.ts keeps it working.
 * Run the table: node tools/experiments/lts_gaba_rebound.ts
 */
import { fileURLToPath } from "node:url";
import { buildCell, publishedParams } from "../../src/core/cell.ts";
import { settle, step } from "../../src/core/simulate.ts";
import { DEFAULT_GABA, kinetics } from "../../src/core/synapses.ts";
import { REARM_LEVEL, SPIKE_LEVEL } from "../../src/core/analysis.ts";

const E = { rs: 15, cp: 0, bridge: 1 };
const DT = 0.01;
const T0 = 200;
const SWEEP = 1500;

export interface TrainResult {
  /** most hyperpolarized Vm during the train, mV */
  vMin: number;
  /** spike times after the train ends, ms after its end */
  after: number[];
  /** spikes during the train */
  during: number;
}

/** A regular GABA train on the published LTS cell at holding current `ihold` (pA). */
export function gabaTrain(ihold: number, rateHz: number, gPeak: number, eGaba: number, durMs = 500): TrainResult {
  const cell = buildCell(publishedParams("lts"));
  const s = Float64Array.from(settle(cell, E, ihold, cell.model.settleMs, DT));
  const k = kinetics({ ...DEFAULT_GABA, enabled: true, gPeak }, DT);
  const tEnd = T0 + durMs;
  let a = 0, b = 0, next = T0, armed = true, prev = s[cell.iv], vMin = Infinity;
  const spikes: number[] = [];
  for (let i = 1; i * DT <= SWEEP; i++) {
    const t = i * DT;
    a *= k.decayA;
    b *= k.decayB;
    while (next <= t && next < tEnd) {
      a += k.jump;
      if (!k.single) b += k.jump;
      next += 1000 / rateHz;
    }
    step(cell, E, s, ihold, 0, DT, { gGlu: 0, gGaba: a - b, eGlu: 0, eGaba });
    const v = s[cell.iv];
    if (t >= T0 && t < tEnd) vMin = Math.min(vMin, v);
    if (!armed && v < REARM_LEVEL) armed = true;
    if (armed && prev < SPIKE_LEVEL && v >= SPIKE_LEVEL) {
      spikes.push(t);
      armed = false;
    }
    prev = v;
  }
  return { vMin, after: spikes.filter((t) => t >= tEnd).map((t) => t - tEnd), during: spikes.filter((t) => t < tEnd).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("LTS cell held at 60 pA (−64 mV); regular GABA at 100 Hz for 500 ms, then released.");
  console.log("cells: most negative Vm during the train / spikes after it\n");
  const gs = [3, 5, 10, 20, 40];
  console.log("E_GABA  " + gs.map((g) => `${g} nS`.padStart(12)).join(""));
  for (const e of [-80, -85, -90, -95]) {
    const row = gs.map((g) => {
      const r = gabaTrain(60, 100, g, e);
      return `${r.vMin.toFixed(1)} / ${r.after.length}`.padStart(12);
    });
    console.log(`${e} mV  ` + row.join(""));
  }
}
