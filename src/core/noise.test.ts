import { describe, expect, it } from "vitest";
import { addRecordingNoise, DEFAULT_NOISE, gaussian, OU } from "./noise.ts";
import { buildCell, PUBLISHED_RS } from "./cell.ts";
import { runFamily, type Inputs } from "./simulate.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";

const sd = (a: ArrayLike<number>) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m += a[i];
  m /= a.length;
  let v = 0;
  for (let i = 0; i < a.length; i++) v += (a[i] - m) ** 2;
  return Math.sqrt(v / a.length);
};

describe("recording noise", () => {
  it("has the RMS you set, at any bandwidth", () => {
    for (const bw of [1, 5, 10, 20]) {
      const v = new Float32Array(200000);
      addRecordingNoise(v, 0.025, { ...DEFAULT_NOISE, recSigma: 0.3, recBandwidth: bw }, 5);
      expect(sd(v)).toBeCloseTo(0.3, 1);
    }
  });

  it("is on the record only: Vm is untouched", () => {
    const cell = buildCell(PUBLISHED_RS);
    const base: Inputs = { ihold: 0, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
    const proto = { sweepMs: 300, stepStart: 50, stepDur: 200, amps: [800] };
    const opt = { dt: 0.01, sampleMs: 0.025, settleMs: 1000, seed: 2 };
    const [a] = runFamily(cell, base, proto, opt);
    const [b] = runFamily(cell, { ...base, noise: { ...DEFAULT_NOISE, recSigma: 1, humAmp: 0.5 } }, proto, opt);
    expect(Array.from(b.vm)).toEqual(Array.from(a.vm));
    expect(sd(Array.from(b.vRec, (x, i) => x - a.vRec[i]))).toBeGreaterThan(0.9);
  });
});

describe("membrane noise", () => {
  it("OU has the SD and correlation time you set", () => {
    const dt = 0.01, tau = 5, sigma = 20;
    const ou = new OU(sigma, tau, dt, 9);
    const x = Float64Array.from({ length: 400000 }, () => ou.next());
    expect(sd(x)).toBeGreaterThan(sigma * 0.9);
    expect(sd(x)).toBeLessThan(sigma * 1.1);
    // autocorrelation at lag τ should be ≈ e^-1
    const lag = Math.round(tau / dt);
    let c = 0, v = 0;
    for (let i = 0; i + lag < x.length; i++) c += x[i] * x[i + lag];
    for (let i = 0; i < x.length; i++) v += x[i] * x[i];
    expect(c / v).toBeGreaterThan(0.3);
    expect(c / v).toBeLessThan(0.45);
  });

  it("the cell feels it, reproducibly, and the bridge does not see it", () => {
    const cell = buildCell(PUBLISHED_RS);
    const base: Inputs = { ihold: 0, electrode: { rs: 40, cp: 0, bridge: 0 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA, noise: { ...DEFAULT_NOISE, memSigma: 50 } };
    const proto = { sweepMs: 300, stepStart: 50, stepDur: 200, amps: [0] };
    const opt = { dt: 0.01, sampleMs: 0.025, settleMs: 1000, seed: 4 };
    const [a] = runFamily(cell, base, proto, opt);
    const [b] = runFamily(cell, base, proto, opt);
    expect(Array.from(a.vm)).toEqual(Array.from(b.vm));
    expect(sd(a.vm)).toBeGreaterThan(0.2);
    // with the bridge fully unbalanced, vRec − Vm is exactly I_cmd·Rs (0 here): noise current is not in it
    for (let i = 0; i < a.vm.length; i += 97) expect(a.vRec[i] - a.vm[i]).toBeCloseTo(0, 4);
  });

  it("gaussian() is standard normal", () => {
    const g = gaussian(3);
    const x = Array.from({ length: 100000 }, g);
    expect(sd(x)).toBeCloseTo(1, 1);
  });
});
