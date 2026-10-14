/**
 * The oscilloscope's stream against the step protocol it must agree with.
 * Same cell, same seeds, same step(): an unchanged stream is a sweep that
 * never ends, so it must reproduce runSweep sample for sample.
 */
import { describe, expect, it } from "vitest";
import { buildCell, publishedParams, PUBLISHED_RS } from "./cell.ts";
import { DEFAULT_SIM, runSweep, settle } from "./simulate.ts";
import { detectSpikes } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";
import { DEFAULT_NOISE, RecordingNoise } from "./noise.ts";
import { DEFAULT_PULSE, Stream, type Chunk, type StreamInputs } from "./stream.ts";

const OPT = { dt: 0.01, sampleMs: 0.05, seed: 3 };

function concat(chunks: Chunk[], key: "vm" | "vRec" | "gGlu" | "iCmd"): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c[key].length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c[key], o);
    o += c[key].length;
  }
  return out;
}

function replay(model: "rs" | "gnrh", amp: number, ms: number) {
  const cell = buildCell(publishedParams(model));
  const ihold = cell.model.defaults.ihold;
  const electrode = { rs: 20, cp: 3, bridge: 0.8 };
  const glu = { ...DEFAULT_GLU, enabled: true, rate: 300 };
  const gaba = { ...DEFAULT_GABA, enabled: true, rate: 100, pattern: "regular" as const, erev: cell.model.defaults.eGaba };
  const noise = { ...DEFAULT_NOISE, memSigma: model === "rs" ? 40 : 4 };
  const settled = settle(cell, electrode, ihold, 1000, OPT.dt);
  // runSweep with a step covering the whole sweep is a constant command of ihold + amp
  const proto = { sweepMs: ms, stepStart: 0, stepDur: ms, amps: [amp] };
  const sweep = runSweep(cell, { ihold, electrode, glu, gaba, noise }, proto, amp, settled, { ...DEFAULT_SIM, ...OPT }, 0);
  const stream = new Stream(cell, { ihold: ihold + amp, electrode, glu, gaba, noise, pulse: DEFAULT_PULSE }, OPT, 0, settled);
  const chunks: Chunk[] = [];
  // deliberately ragged chunks: the result must not depend on how time is cut up
  for (const c of [37.3, 101, 0.5, 13.37]) chunks.push(stream.advance(c));
  chunks.push(stream.advance(ms - stream.t));
  return { sweep, chunks };
}

describe("stream reproduces the step protocol exactly", () => {
  for (const [model, amp, ms] of [["rs", 700, 500], ["gnrh", 20, 300]] as const) {
    it(`${model}: Vm, the record and the PSCs match runSweep sample for sample, across ragged chunks`, () => {
      const { sweep, chunks } = replay(model, amp, ms);
      const vm = concat(chunks, "vm");
      // stream sample k is sweep sample k+1 (the sweep also stores t = 0); the
      // sweep's final step falls at t = stepDur, where its step has just ended
      const n = vm.length - 1;
      expect(n).toBeGreaterThan(5000);
      expect(Array.from(vm.subarray(0, n))).toEqual(Array.from(sweep.vm.subarray(1, n + 1)));
      expect(Array.from(concat(chunks, "vRec").subarray(0, n))).toEqual(Array.from(sweep.vRec.subarray(1, n + 1)));
      expect(Array.from(concat(chunks, "gGlu").subarray(0, n))).toEqual(Array.from(sweep.gGlu.subarray(1, n + 1)));
      expect(detectSpikes(vm, OPT.sampleMs).length).toBeGreaterThan(0);
    });
  }
});

describe("live changes", () => {
  const cell = buildCell(PUBLISHED_RS);
  const base: StreamInputs = { ihold: 0, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA, pulse: DEFAULT_PULSE };

  it("a new leak keeps the cell where it is, then lets it relax", () => {
    const st = new Stream(cell, base, OPT, 1000);
    const before = st.advance(50);
    const v0 = before.vm[before.vm.length - 1];
    st.setCell(buildCell({ ...PUBLISHED_RS, gLeak: 5 }));
    const after = st.advance(400);
    expect(Math.abs(after.vm[0] - v0)).toBeLessThan(0.05); // continuous, not reset
    expect(after.vm[after.vm.length - 1]).toBeLessThan(v0 - 1); // and it moves toward the new rest (−72.6 mV)
  });

  it("a different model starts again, settled", () => {
    const st = new Stream(cell, base, OPT, 1000);
    st.advance(20);
    const g = buildCell(publishedParams("gnrh"));
    st.setInputs({ ...base, ihold: -6 });
    st.setCell(g);
    expect(st.vm).toBeCloseTo(-70.1, 0);
  });

  it("the pulse generator gives the width and period asked for, from the moment it is switched on", () => {
    const st = new Stream(cell, base, OPT, 500);
    st.advance(33);
    const t0 = st.t;
    st.setInputs({ ...base, ihold: 10, pulse: { enabled: true, amp: 100, width: 20, period: 100 } });
    const c = st.advance(1000);
    const on = Array.from(c.iCmd).filter((i) => i === 110).length / c.iCmd.length;
    expect(on).toBeCloseTo(0.2, 2);
    expect(Array.from(c.iCmd).every((i) => i === 10 || i === 110)).toBe(true);
    // on at t0 + k·period, off 20 ms later
    const at = (t: number) => c.iCmd[Math.round((t - c.t0) / c.sampleMs)];
    expect(at(t0 + 500 + 1)).toBe(110);
    expect(at(t0 + 500 + 19)).toBe(110);
    expect(at(t0 + 500 + 21)).toBe(10);
  });

  it("switching an input on starts a train at the rate asked for", () => {
    const st = new Stream(cell, base, OPT, 500);
    st.advance(10);
    st.setInputs({ ...base, gaba: { ...DEFAULT_GABA, enabled: true, rate: 40, gPeak: 1, tauRise: 0 } });
    const c = st.advance(20000);
    // instantaneous rise, so each event is one jump in g
    let n = 0;
    for (let i = 1; i < c.gGaba.length; i++) if (c.gGaba[i] - c.gGaba[i - 1] > 0.05) n++;
    expect(n / 20).toBeGreaterThan(36);
    expect(n / 20).toBeLessThan(44);
  });

  it("counts spikes the way analysis.ts does", () => {
    const st = new Stream(cell, { ...base, ihold: 900 }, OPT, 1000);
    const chunks = [st.advance(700), st.advance(611), st.advance(689)];
    const online = chunks.flatMap((c) => c.spikes);
    expect(online.length).toBeGreaterThan(20);
    expect(online.length).toBe(detectSpikes(concat(chunks, "vm"), OPT.sampleMs).length);
  });
});

describe("recording noise, one sample at a time", () => {
  it("has the RMS you set, as the step protocol's does", () => {
    for (const bw of [1, 10]) {
      const r = new RecordingNoise({ ...DEFAULT_NOISE, recSigma: 0.3, recBandwidth: bw }, 0.05, 5);
      const x = Float64Array.from({ length: 200000 }, () => r.next());
      const m = x.reduce((a, b) => a + b, 0) / x.length;
      const sd = Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length);
      expect(sd).toBeCloseTo(0.3, 1);
    }
  });
});
