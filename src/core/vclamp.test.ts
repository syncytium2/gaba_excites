/**
 * Voltage clamp. The port is held to NEURON (tools/neuron_oracle_vc.py, which
 * says how to regenerate src/core/oracle/neuron_vc_rs.json): the pyramidal
 * cell of ModelDB 123623 clamped by SEClamp, the same circuit stepVC solves.
 * Then the ideal clamp against the cell's own steady state, the measurements,
 * blocking, and the rule that noise and filter touch only the record.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCell, publishedParams } from "./cell.ts";
import { MODEL_LIST, MODELS, ionReversal } from "./models.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";
import { DEFAULT_NOISE } from "./noise.ts";
import { blankSweep, fitBoltzmann, measureSweep, transientMs, runVCFamily, variedValue, zeroCrossing, type VCInputs, type VCProtocol, type VCSweep } from "./vclamp.ts";
import { VC_PRESETS } from "./protocol.ts";
import { runFamily } from "./simulate.ts";
import { detectSpikes } from "./analysis.ts";

interface OracleSweep {
  value: number;
  durs: number[];
  i: number[];
  v: number[];
  [seg: `seg${number}`]: { peakIn: number; tIn: number; peakOut: number; tOut: number };
}
interface Oracle {
  sampleMs: number;
  peakSampleMs: number;
  families: Record<string, { rs: number; hold: number; sweeps: OracleSweep[] }>;
}
const ORACLE = JSON.parse(readFileSync(new URL("./oracle/neuron_vc_rs.json", import.meta.url), "utf8")) as Oracle;

const OFF = { glu: { ...DEFAULT_GLU, enabled: false }, gaba: { ...DEFAULT_GABA, enabled: false } };
const ACT: VCProtocol = {
  hold: -80,
  segments: [{ dur: 10, v: -80 }, { dur: 50, v: 0 }, { dur: 20, v: -80 }],
  vary: { seg: 1, what: "v", first: -80, delta: 10, count: 13 },
};
const INACT: VCProtocol = {
  hold: -80,
  segments: [{ dur: 10, v: -80 }, { dur: 100, v: 0 }, { dur: 10, v: 0 }, { dur: 10, v: -80 }],
  vary: { seg: 1, what: "v", first: -120, delta: 10, count: 12 },
};
const PROTOCOLS: Record<string, VCProtocol> = { act: ACT, act_rs2: ACT, inact: INACT };

/** full-resolution peaks of a segment, skipping its first 0.2 ms, as the oracle takes them */
function peaks(sw: VCSweep, seg: number) {
  const a = Math.round((sw.starts[seg] + 0.2) / sw.sampleMs);
  const b = Math.round((seg + 1 < sw.starts.length ? sw.starts[seg + 1] : sw.iTrue.length * sw.sampleMs) / sw.sampleMs);
  let lo = a;
  let hi = a;
  for (let j = a; j <= Math.min(b, sw.iTrue.length - 1); j++) {
    if (sw.iTrue[j] < sw.iTrue[lo]) lo = j;
    if (sw.iTrue[j] > sw.iTrue[hi]) hi = j;
  }
  return { peakIn: sw.iTrue[lo], tIn: lo * sw.sampleMs, peakOut: sw.iTrue[hi], tOut: hi * sw.sampleMs };
}

describe("voltage clamp: the pyramidal cell against NEURON's SEClamp", () => {
  const cell = buildCell(publishedParams("rs"));
  for (const [fam, F] of Object.entries(ORACLE.families)) {
    it(`${fam} (rs ${F.rs} MΩ): every 0.2 ms sample within 10 pA and 0.01 mV, peaks within 0.05%, and inward peaks over 1 nA within 0.02 ms`, () => {
      const sw = runVCFamily(cell, { rs: F.rs, ...OFF }, PROTOCOLS[fam]);
      expect(sw.length).toBe(F.sweeps.length);
      const every = Math.round(ORACLE.sampleMs / sw[0].sampleMs);
      for (let k = 0; k < sw.length; k++) {
        const o = F.sweeps[k];
        expect(sw[k].value).toBe(o.value);
        for (let j = 1; j < o.i.length; j++) {
          expect(Math.abs(sw[k].iTrue[j * every] - o.i[j]), `${fam} ${o.value} mV, t ${(j * ORACLE.sampleMs).toFixed(1)} ms`).toBeLessThan(10);
          expect(Math.abs(sw[k].vm[j * every] - o.v[j])).toBeLessThan(0.01);
        }
        for (let seg = 1; seg < o.durs.length; seg++) {
          const p = peaks(sw[k], seg);
          const q = o[`seg${seg}`];
          expect(Math.abs(p.peakIn - q.peakIn)).toBeLessThanOrEqual(Math.max(2, 5e-4 * Math.abs(q.peakIn)));
          expect(Math.abs(p.peakOut - q.peakOut)).toBeLessThanOrEqual(Math.max(2, 5e-4 * Math.abs(q.peakOut)));
          // the time of a peak means something only where there is one: a flat trace's minimum is anywhere
          if (q.peakIn < -1000) expect(Math.abs(p.tIn - q.tIn)).toBeLessThanOrEqual(0.02 + 1e-9);
        }
      }
    });
  }

  it("with Rs = 2 MΩ the clamp loses the cell to its own sodium current: at a −40 mV command Vm reaches over +30 mV", () => {
    const o = ORACLE.families.act_rs2.sweeps.find((s) => s.value === -40)!;
    expect(Math.max(...o.v)).toBeGreaterThan(30);
    const sw = runVCFamily(cell, { rs: 2, ...OFF }, { ...ACT, vary: { ...ACT.vary, first: -40, count: 1 } })[0];
    expect(Math.max(...sw.vm)).toBeGreaterThan(30);
  });
});

describe("voltage clamp: the ideal clamp and the measurements", () => {
  const cell = buildCell(publishedParams("rs"));

  it("with Rs = 0 the cell sits exactly at the command, and a long step's current settles to the channels' own steady state", () => {
    const p: VCProtocol = { hold: -80, segments: [{ dur: 10, v: -80 }, { dur: 3000, v: -50 }], vary: { seg: 1, what: "v", first: -60, delta: 10, count: 3 } };
    for (const sw of runVCFamily(cell, { rs: 0, ...OFF }, p)) {
      const v = sw.value;
      const end = sw.iTrue.length - 1;
      expect(sw.vm[end]).toBe(v);
      let iss = cell.gLeak * (v - cell.eLeak);
      for (let k = 0; k < cell.channels.length; k++) iss += cell.gbar[k] * cell.channels[k].openInf(v, 0) * (v - cell.erev[k]);
      expect(Math.abs(sw.iTrue[end] - iss)).toBeLessThan(1e-3 * Math.abs(iss) + 0.5);
    }
  });

  it("Rs = 0 is the limit of a small Rs", () => {
    const a = runVCFamily(cell, { rs: 0, ...OFF }, { ...ACT, vary: { ...ACT.vary, first: -60, count: 1 } })[0];
    const b = runVCFamily(cell, { rs: 1e-6, ...OFF }, { ...ACT, vary: { ...ACT.vary, first: -60, count: 1 } })[0];
    for (let j = 600; j < a.iTrue.length; j += 50) expect(Math.abs(a.iTrue[j] - b.iTrue[j])).toBeLessThan(0.5);
  });

  it("measures the min, the max, the value largest in magnitude, the mean over a window, and a cursor, on the recorded current", () => {
    const sw: VCSweep = {
      value: 0,
      sampleMs: 1,
      iRec: Float32Array.from([0, -5, -20, -10, 3, 8, 6, 6, 6, 6]),
      iTrue: new Float32Array(10),
      vm: Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      vCmd: new Float32Array(10),
      starts: [0, 2],
    };
    expect(measureSweep(sw, { seg: 1, from: 0, to: 7, kind: "peakIn" })).toMatchObject({ i: -20, t: 2, vm: 3 });
    expect(measureSweep(sw, { seg: 1, from: 0, to: 7, kind: "peakOut" })).toMatchObject({ i: 8, t: 5 });
    expect(measureSweep(sw, { seg: 1, from: 4, to: 7, kind: "mean" }).i).toBe(6);
    expect(measureSweep(sw, { seg: 0, from: 1, to: 1, kind: "cursor" }).i).toBe(-5);
    // Max |I|: the value largest in magnitude, with its sign kept
    expect(measureSweep(sw, { seg: 1, from: 0, to: 7, kind: "peakAbs" })).toMatchObject({ i: -20, t: 2 });
    expect(measureSweep(sw, { seg: 1, from: 2, to: 7, kind: "peakAbs" })).toMatchObject({ i: 8, t: 5 });
    // Min is the plain minimum: where the current is outward throughout, it is the smallest outward value, not a peak
    expect(measureSweep(sw, { seg: 1, from: 3, to: 7, kind: "peakIn" }).i).toBe(6);
  });

  it("fits a Boltzmann: recovers V½ and k from points on one, either sign of k", () => {
    const x = [-100, -90, -80, -70, -60, -50, -40, -30, -20];
    for (const [vh, k] of [[-62.5, 7.2], [-35, -6.4]]) {
      const y = x.map((v) => 1 / (1 + Math.exp((v - vh) / k)));
      const f = fitBoltzmann(x, y);
      expect(f.vHalf).toBeCloseTo(vh, 1);
      expect(f.k).toBeCloseTo(k, 1);
      expect(f.rms).toBeLessThan(1e-3);
    }
  });

  it("finds where a measured current reverses, and steps durations without float noise", () => {
    expect(zeroCrossing([-100, -90, -80, -70], [-4, -2, 2, 6])).toBeCloseTo(-85, 9);
    expect(zeroCrossing([-80, -100, -90], [2, -4, -2])).toBeCloseTo(-85, 9); // order of x, not of input
    expect(zeroCrossing([1, 2, 3], [1, 2, 3])).toBeNaN();
    expect(variedValue({ hold: 0, segments: [], vary: { seg: 0, what: "dur", first: 0.2, delta: 0.4, count: 3 } }, 1)).toBe(0.6);
  });

  it("the tail preset finds E_K: on the pyramidal cell (E_K −100 mV, leak −70 mV) its tails reverse between −95 and −80 mV", () => {
    const pr = VC_PRESETS.find((p) => p.id === "vc-tails")!;
    const pts = runVCFamily(cell, { rs: 0, ...OFF }, pr.protocol).map((s) => measureSweep(s, pr.measures[0]));
    const e = zeroCrossing(pts.map((p) => p.value), pts.map((p) => p.i));
    expect(e).toBeGreaterThan(-95);
    expect(e).toBeLessThan(-80);
  });

  it("E_rev comes from each model's own channels: E_Na +50 mV on the pyramidal, FS, LTS and squid cells, +54 on the GnRH cell; the beta cell has none", () => {
    for (const id of ["rs", "fs", "lts", "hh"] as const) expect(ionReversal(MODELS[id], "na")).toBe(50);
    expect(ionReversal(MODELS.gnrh, "na")).toBe(54);
    expect(ionReversal(MODELS.hh, "k")).toBe(-77);
    expect(ionReversal(MODELS.betamouse, "na")).toBeUndefined();
    for (const p of VC_PRESETS) if (p.norm === "G") expect(p.erevIon).toBeDefined();
  });

  it("fitBoltzmann returns its best however poor, and flags a best that lies on the edge of its search", () => {
    // the GnRH activation family as G/Gmax, every point: Peak − turns outward at +30 and +40 mV
    const x = [-80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40];
    const y = [0, 0, 0, 0, 0, 0.02, 0.22, 0.7, 1, 0.94, 0.54, -0.49, -4.01];
    // the best is V½ −120 mV (the search's lower edge), k +0.5: a flat line at 0 across the data, rms 1.2.
    // It is returned, flagged, so the panel can draw it and say so.
    const all = fitBoltzmann(x, y);
    expect(all.edge).toBe(true);
    expect(all.vHalf).toBeCloseTo(-120, 0);
    // the refinement stays inside the search, so the V½ the caption reports is one the search could reach
    expect(all.vHalf).toBeGreaterThanOrEqual(-120);
    expect(all.rms).toBeGreaterThan(1);
    // the same family with the two negative-G points left out does settle
    const f = fitBoltzmann(x.slice(0, 11), y.slice(0, 11));
    expect(f.edge).toBe(false);
    expect(f.vHalf).toBeGreaterThan(-20);
    expect(f.vHalf).toBeLessThan(-10);
    expect(f.k).toBeLessThan(0);
  });

  it("on the GnRH cell's activation preset, fitting every point lands on the search's edge; G > 0 only fits V½ −14 mV, k −4.5 mV", () => {
    const pr = VC_PRESETS.find((p) => p.id === "vc-act")!;
    const pts = runVCFamily(buildCell(publishedParams("gnrh")), { rs: 0, noise: DEFAULT_NOISE, ...OFF }, pr.protocol).map((s) => measureSweep(s, pr.measures[0]));
    const x = pts.map((p) => p.value);
    const g = pts.map((p) => p.i / (p.value - ionReversal(MODELS.gnrh, pr.erevIon!)!));
    const big = Math.max(...g);
    const y = g.map((r) => r / big);
    expect(y.filter((v) => v < -0.05).length).toBe(2);
    const all = fitBoltzmann(x, y);
    expect(all.edge).toBe(true);
    expect(all.vHalf).toBeGreaterThanOrEqual(Math.min(...x) - 40);
    const ok = y.map((v) => v > -0.05);
    const f = fitBoltzmann(x.filter((_, i) => ok[i]), y.filter((_, i) => ok[i]));
    expect(f.edge).toBe(false);
    expect(f.vHalf).toBeCloseTo(-14, 0);
    expect(f.k).toBeCloseTo(-4.5, 0);
  });

  it("the amplifier's filter blunts the fast sodium peak and moves the fitted G–V: V½ −20.5 mV unfiltered, −17.3 at 10 kHz, −11.1 at 5 kHz", () => {
    const pr = VC_PRESETS.find((p) => p.id === "vc-act")!;
    const fit = (recFilter: 0 | 5 | 10) => {
      const noise = { ...DEFAULT_NOISE, recSigma: 2, recFilter };
      const pts = runVCFamily(cell, { rs: 0, noise, ...OFF }, pr.protocol).map((s) => measureSweep(s, pr.measures[0]));
      const g = pts.map((p) => p.i / (p.value - ionReversal(MODELS.rs, pr.erevIon!)!));
      const big = g.reduce((a, r) => (Math.abs(r) > Math.abs(a) ? r : a), 0);
      return fitBoltzmann(pts.map((p) => p.value), g.map((r) => r / big));
    };
    for (const [f, vh, k] of [[0, -20.5, -8.5], [10, -17.3, -10.6], [5, -11.1, -14.6]] as const) {
      const r = fit(f);
      expect(r.vHalf).toBeCloseTo(vh, 0);
      expect(r.k).toBeCloseTo(k, 0);
    }
  });

  it("blocking a channel removes its current, in voltage clamp and in current clamp", () => {
    const step0 = { ...ACT, vary: { ...ACT.vary, first: 0, count: 1 } };
    const ctl = runVCFamily(cell, { rs: 0, ...OFF }, step0)[0];
    const ttx = runVCFamily(buildCell({ ...publishedParams("rs"), block: ["na"] }), { rs: 0, ...OFF }, step0)[0];
    const pk = (s: VCSweep) => measureSweep(s, { seg: 1, from: 0.2, to: 5, kind: "peakIn" }).i;
    expect(pk(ctl)).toBeLessThan(-100000);
    expect(pk(ttx)).toBeGreaterThan(0); // nothing inward left at 0 mV: only K⁺ and leak
    const cc = (block?: string[]) =>
      runFamily(buildCell({ ...publishedParams("rs"), block }), { ihold: 0, electrode: { rs: 15, cp: 0, bridge: 1 }, ...OFF }, { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [700] })[0];
    expect(detectSpikes(cc().vm, cc().sampleMs).length).toBeGreaterThan(0);
    expect(detectSpikes(cc(["na"]).vm, cc(["na"]).sampleMs).length).toBe(0);
  });

  it("noise and the amplifier's filter change the recorded current only: the true current and Vm are untouched", () => {
    const one = { ...ACT, vary: { ...ACT.vary, first: -40, count: 1 } };
    const run = (inp: Partial<VCInputs>) => runVCFamily(cell, { rs: 2, ...OFF, ...inp }, one)[0];
    const clean = run({});
    const noisy = run({ noise: { ...DEFAULT_NOISE, recSigma: 20, recFilter: 2, humAmp: 5 } });
    expect(Array.from(noisy.iTrue)).toEqual(Array.from(clean.iTrue));
    expect(Array.from(noisy.vm)).toEqual(Array.from(clean.vm));
    expect(Array.from(clean.iRec)).toEqual(Array.from(clean.iTrue)); // no noise, filter bypassed: the record is the current
    expect(Array.from(noisy.iRec)).not.toEqual(Array.from(clean.iRec));
  });
});

describe("voltage clamp on every model", () => {
  for (const m of MODEL_LIST) {
    it(`${m.short}: every preset runs and every measurement is finite`, () => {
      const cell = buildCell(publishedParams(m.id));
      for (const pr of VC_PRESETS) {
        const sw = runVCFamily(cell, { rs: 0, ...OFF }, pr.protocol, { dt: 0.01, sampleMs: 0.02, seed: 1, settleMs: 500 });
        expect(sw.length).toBe(pr.protocol.vary.count);
        for (const s of sw) for (const meas of pr.measures) expect(Number.isFinite(measureSweep(s, meas).i), `${m.id} ${pr.id} ${s.value}`).toBe(true);
      }
    });
  }
});

describe("voltage clamp: the capacitive transient and blanking", () => {
  const inp: VCInputs = { rs: 0, glu: { ...DEFAULT_GLU, enabled: false }, gaba: { ...DEFAULT_GABA, enabled: false } };
  const proto: VCProtocol = { hold: -80, segments: [{ dur: 5, v: -80 }, { dur: 5, v: 0 }, { dur: 5, v: -80 }], vary: { seg: 1, what: "v", first: 0, delta: 10, count: 1 } };

  it("lasts five Rs·Cm, or two samples with an ideal clamp, plus a period of the filter's corner", () => {
    expect(transientMs(5, 20, 0.02)).toBeCloseTo(0.5, 12);
    expect(transientMs(0, 20, 0.02)).toBeCloseTo(0.04, 12);
    expect(transientMs(0, 20, 0.02, 10)).toBeCloseTo(0.14, 12);
  });

  it("blanking holds the recorded current at its value before each step, for that long, and nothing else", () => {
    const sw = runVCFamily(buildCell(publishedParams("gnrh")), inp, proto)[0];
    const ms = transientMs(0, 20, sw.sampleMs);
    const b = blankSweep(sw, ms);
    const dt = sw.sampleMs;
    for (const t of sw.starts.filter((t) => t > 0)) {
      const a = Math.round(t / dt);
      for (let j = a; j <= a + Math.round(ms / dt); j++) expect(b.iRec[j]).toBe(sw.iRec[a - 1]);
      expect(b.iRec[a + Math.round(ms / dt) + 1]).toBe(sw.iRec[a + Math.round(ms / dt) + 1]);
    }
    expect(b.iTrue).toBe(sw.iTrue);
    // the ideal clamp's transient is gone from the recording: no sample within 0.1 ms of a step is above 1 nA outward
    const a = Math.round(sw.starts[1] / dt);
    expect(Math.max(...Array.from(b.iRec.subarray(a, a + 5)))).toBeLessThan(1000);
  });
});
