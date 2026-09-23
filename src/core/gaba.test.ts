/**
 * The result the app is named for, pinned so a change to the model or the
 * integrator cannot quietly move it. Regular (clock-like) GABA at 200 Hz,
 * 3 nS, 0.5/10 ms, on the published cell; rheobase bisected to 1 pA for an
 * 800 ms step. Measured 2026-09-21; E −35 re-measured 2026-09-23 as 458 when
 * the published leak became exact rather than solved from a rounded Rin:
 *
 *   GABA off   561 pA
 *   E −80      765       hyperpolarizing and inhibitory
 *   E −60      628       depolarizing (rest is −70.6) and STILL inhibitory
 *   E −50      560       the crossover: no effect on rheobase
 *   E −35      458       excitatory
 *
 * The presets' notes quote these numbers; update both together.
 */
import { describe, expect, it } from "vitest";
import { buildCell, PUBLISHED_RS } from "./cell.ts";
import { runSweep, settle, DEFAULT_SIM } from "./simulate.ts";
import { sweepStats } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU, type SynInput } from "./synapses.ts";

const cell = buildCell(PUBLISHED_RS);
const proto = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [] };
const settled = settle(cell, { rs: 15, cp: 0, bridge: 1 }, 0, 3000, 0.01);

function rheobase(gaba: SynInput): number {
  const inputs = { ihold: 0, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba };
  const fires = (a: number) => sweepStats(runSweep(cell, inputs, proto, a, settled, DEFAULT_SIM, 0), proto).nInStep > 0;
  let lo = 0, hi = 1500;
  while (hi - lo > 1) {
    const m = (lo + hi) / 2;
    if (fires(m)) hi = m;
    else lo = m;
  }
  return hi;
}
const tonic = (erev: number): SynInput => ({ ...DEFAULT_GABA, enabled: true, rate: 200, gPeak: 3, erev, pattern: "regular" });

describe("where GABA changes sides", () => {
  const off = rheobase(DEFAULT_GABA);
  it("rheobase without GABA is 561 pA", () => expect(off).toBeCloseTo(561, -1));
  it("depolarizing GABA (−60 mV, above rest) still raises rheobase", () => expect(rheobase(tonic(-60))).toBeGreaterThan(off + 40));
  it("at −50 mV it is neutral", () => expect(Math.abs(rheobase(tonic(-50)) - off)).toBeLessThan(5));
  it("above the crossover it excites", () => expect(rheobase(tonic(-35))).toBeLessThan(off - 60));
});
