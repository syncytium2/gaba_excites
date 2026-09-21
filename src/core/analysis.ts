/**
 * What an electrophysiologist would read off the sweeps.
 *
 * All measurements are taken on the membrane potential Vm, not on the
 * recorded trace. The recorded trace carries whatever bridge error and
 * pipette filtering the electrode settings introduce, and that error is
 * something the app shows, not something it should silently fold into the
 * F–I curve. The UI says so beside the numbers.
 */

import type { StepProtocol, Sweep } from "./simulate.ts";

/** Upward crossing that counts as a spike, and the level it must fall below to re-arm. */
export const SPIKE_LEVEL = -20;
const REARM_LEVEL = -40;
/** dV/dt that defines spike threshold, mV/ms (= V/s). The usual 20 V/s criterion. */
export const THRESH_DVDT = 20;

export interface Spike {
  /** time of the upward SPIKE_LEVEL crossing, ms */
  t: number;
  /** voltage where dV/dt first reaches THRESH_DVDT on the upstroke, mV */
  threshold: number;
  tThreshold: number;
  peak: number;
  /** width at half amplitude (threshold→peak), ms */
  halfWidth: number;
}

export function detectSpikes(vm: Float32Array, dtMs: number): Spike[] {
  const out: Spike[] = [];
  let armed = vm[0] < SPIKE_LEVEL;
  let lastEnd = 0;
  for (let i = 1; i < vm.length; i++) {
    if (!armed) {
      if (vm[i] < REARM_LEVEL) {
        armed = true;
        lastEnd = i;
      }
      continue;
    }
    if (vm[i - 1] < SPIKE_LEVEL && vm[i] >= SPIKE_LEVEL) {
      armed = false;
      // walk back to where the upstroke began exceeding the dV/dt criterion
      let j = i;
      while (j > lastEnd + 1 && (vm[j - 1] - vm[j - 2]) / dtMs >= THRESH_DVDT) j--;
      const thrIdx = Math.max(j - 1, 0);
      // peak
      let k = i;
      while (k + 1 < vm.length && vm[k + 1] >= vm[k]) k++;
      const threshold = vm[thrIdx];
      const peak = vm[k];
      const half = threshold + 0.5 * (peak - threshold);
      let a = thrIdx;
      while (a < k && vm[a] < half) a++;
      let b = k;
      while (b + 1 < vm.length && vm[b] > half) b++;
      // linear interpolation at both half crossings
      const ta = a > 0 ? a - 1 + (half - vm[a - 1]) / (vm[a] - vm[a - 1]) : a;
      const tb = b + 1 < vm.length ? b + (vm[b] - half) / (vm[b] - vm[b + 1]) : b;
      const tc = i - 1 + (SPIKE_LEVEL - vm[i - 1]) / (vm[i] - vm[i - 1]);
      out.push({
        t: tc * dtMs,
        threshold,
        tThreshold: thrIdx * dtMs,
        peak,
        halfWidth: (tb - ta) * dtMs,
      });
    }
  }
  return out;
}

export interface SweepStats {
  amp: number;
  spikes: Spike[];
  /** spikes whose crossing falls inside the step */
  nInStep: number;
  /** nInStep / step duration, Hz */
  meanRate: number;
  /** 1 / first ISI in the step, Hz (NaN with < 2 spikes) */
  initialRate: number;
  /** 1 / last ISI in the step, Hz */
  finalRate: number;
  /** first spike latency from step onset, ms */
  latency: number;
  /** mean Vm over the 50 ms before the step */
  vBaseline: number;
  /** mean Vm over the last 20% of the step, when the sweep did not spike in the step */
  vSteady: number;
}

function mean(a: Float32Array, i0: number, i1: number): number {
  let s = 0;
  const lo = Math.max(0, i0);
  const hi = Math.min(a.length, i1);
  for (let i = lo; i < hi; i++) s += a[i];
  return hi > lo ? s / (hi - lo) : NaN;
}

export function sweepStats(sw: Sweep, proto: StepProtocol): SweepStats {
  const dt = sw.sampleMs;
  const spikes = detectSpikes(sw.vm, dt);
  const on = proto.stepStart;
  const off = proto.stepStart + proto.stepDur;
  const inStep = spikes.filter((s) => s.t >= on && s.t < off);
  const isi = (k: number) => inStep[k + 1].t - inStep[k].t;
  const n = inStep.length;
  return {
    amp: sw.amp,
    spikes,
    nInStep: n,
    meanRate: proto.stepDur > 0 ? (n * 1000) / proto.stepDur : NaN,
    initialRate: n >= 2 ? 1000 / isi(0) : NaN,
    finalRate: n >= 2 ? 1000 / isi(n - 2) : NaN,
    latency: n >= 1 ? inStep[0].t - on : NaN,
    vBaseline: mean(sw.vm, Math.round((on - 50) / dt), Math.round(on / dt)),
    vSteady: n === 0 ? mean(sw.vm, Math.round((off - 0.2 * proto.stepDur) / dt), Math.round(off / dt)) : NaN,
  };
}

export interface FamilySummary {
  stats: SweepStats[];
  /** smallest step (pA) that fired at least one spike in the step; NaN if none did */
  rheobase: number;
  /** threshold of the first spike at rheobase, mV */
  threshold: number;
  /** that spike's peak and half-width */
  apPeak: number;
  apHalfWidth: number;
  /** Rin from the slope of ΔV vs I over non-spiking hyperpolarizing and small steps, MΩ */
  rinMeasured: number;
  /** mean baseline Vm across sweeps (the holding potential), mV */
  vHold: number;
  /** F–I slope over the suprathreshold sweeps, Hz/nA */
  fiGain: number;
}

/** Least-squares slope of y on x. */
export function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return sxx > 0 ? sxy / sxx : NaN;
}

export function summarize(sweeps: Sweep[], proto: StepProtocol): FamilySummary {
  const stats = sweeps.map((s) => sweepStats(s, proto));
  const byAmp = [...stats].sort((a, b) => a.amp - b.amp);
  const first = byAmp.find((s) => s.amp > 0 && s.nInStep > 0);
  const firstSpike = first?.spikes.find((s) => s.t >= proto.stepStart);

  // Rin: only steps that stayed subthreshold AND at or below 0 pA, plus 0 itself.
  // Depolarizing subthreshold steps recruit the M current and bend the I–V, which
  // is physiology, but it is not what "input resistance" is usually taken to mean.
  const passive = byAmp.filter((s) => s.amp <= 0 && s.nInStep === 0 && Number.isFinite(s.vSteady));
  const rinMeasured =
    passive.length >= 2
      ? slope(passive.map((s) => s.amp), passive.map((s) => s.vSteady - s.vBaseline)) * 1000
      : NaN;

  const supra = byAmp.filter((s) => s.nInStep > 0);
  const fiGain = supra.length >= 2 ? slope(supra.map((s) => s.amp), supra.map((s) => s.meanRate)) * 1000 : NaN;

  const baselines = stats.map((s) => s.vBaseline).filter(Number.isFinite);
  return {
    stats,
    rheobase: first ? first.amp : NaN,
    threshold: firstSpike ? firstSpike.threshold : NaN,
    apPeak: firstSpike ? firstSpike.peak : NaN,
    apHalfWidth: firstSpike ? firstSpike.halfWidth : NaN,
    rinMeasured,
    vHold: baselines.length ? baselines.reduce((a, b) => a + b, 0) / baselines.length : NaN,
    fiGain,
  };
}
