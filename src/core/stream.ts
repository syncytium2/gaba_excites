/**
 * The oscilloscope's simulation: one cell, run continuously, advanced a chunk
 * at a time, with every setting live.
 *
 * It integrates with simulate.ts's own `step()`, so it is the same model and
 * the same scheme as the step protocol, not a copy. What changes is
 * bookkeeping: a sweep knows its whole length in advance and draws all of its
 * PSC events up front, a stream draws them as it goes. It draws them from the
 * same seeds in the same order, so for as long as nothing is changed a stream
 * reproduces `runSweep` exactly (stream.test.ts holds it to that).
 *
 * Changing a setting never resets the cell. A new leak, Cm or channel set
 * rebuilds the cell around the same state vector, so you watch it relax to
 * its new behavior, slow currents included. Only a different model, whose
 * state vector has a different shape, starts again from a settled state.
 *
 * Units: mV, ms, nS, pA, pF.
 */

import type { BuiltCell } from "./cell.ts";
import { settle, step, type Electrode, type Inputs, type SynNow } from "./simulate.ts";
import { kinetics, rng, type SynInput, type SynKinetics } from "./synapses.ts";
import { DEFAULT_NOISE, OU, RecordingNoise, type NoiseParams } from "./noise.ts";
import { REARM_LEVEL, SPIKE_LEVEL } from "./analysis.ts";

/** A repeating current pulse, on top of the holding current. */
export interface Pulse {
  enabled: boolean;
  /** pA */
  amp: number;
  /** ms */
  width: number;
  /** onset to onset, ms */
  period: number;
}

export const DEFAULT_PULSE: Pulse = { enabled: false, amp: 100, width: 100, period: 500 };

export interface StreamInputs extends Inputs {
  pulse: Pulse;
}

export interface StreamOptions {
  dt: number;
  sampleMs: number;
  seed: number;
}

/** 20 kHz on screen: a 0.7 ms spike gets 14 samples, and the scope draws min/max per pixel anyway. */
export const STREAM_SIM: StreamOptions = { dt: 0.01, sampleMs: 0.05, seed: 1 };

export interface Chunk {
  /** time of the first sample, ms since the stream began */
  t0: number;
  sampleMs: number;
  vRec: Float32Array;
  vm: Float32Array;
  iCmd: Float32Array;
  gGlu: Float32Array;
  gGaba: Float32Array;
  /** spike times in this chunk, ms (upward crossings of SPIKE_LEVEL on Vm) */
  spikes: number[];
  /** pulse onsets in this chunk, ms: what the scope triggers on */
  onsets: number[];
}

/** One synaptic input's running state: the two exponentials, and when the next event lands. */
class Synapse {
  private k: SynKinetics;
  private draw: () => number;
  a = 0;
  b = 0;
  next = Infinity;
  constructor(private inp: SynInput, private dt: number, seed: number) {
    this.k = kinetics(inp, dt);
    this.draw = rng(seed);
    this.schedule(0);
  }
  private get mean() {
    return 1000 / this.inp.rate;
  }
  private gap() {
    return this.inp.pattern === "regular" ? this.mean : -this.mean * Math.log(1 - this.draw());
  }
  /** first event after time t, drawn as eventTimes() draws them */
  private schedule(t: number) {
    const on = this.inp.enabled && this.inp.rate > 0 && this.inp.gPeak > 0;
    this.next = on ? t + this.gap() : Infinity;
  }
  update(inp: SynInput, t: number) {
    const old = this.inp;
    this.inp = inp;
    this.k = kinetics(inp, this.dt);
    // a new rate or pattern starts a new train from now; new kinetics keep the train
    const train = (s: SynInput) => `${s.enabled && s.rate > 0 && s.gPeak > 0}|${s.rate}|${s.pattern}`;
    if (train(old) !== train(inp)) this.schedule(t);
  }
  /** decay to t, then add the events that arrived in (t − dt, t]; returns g(t) */
  advance(t: number): number {
    const k = this.k;
    this.a *= k.decayA;
    this.b *= k.decayB;
    while (this.next <= t) {
      this.a += k.jump;
      if (!k.single) this.b += k.jump;
      this.next += this.gap();
    }
    return this.a - this.b;
  }
}

export class Stream {
  cell: BuiltCell;
  private inp: StreamInputs;
  private opt: StreamOptions;
  private s: Float64Array;
  /** steps taken; t = i·dt, exactly as runSweep computes it */
  private i = 0;
  private glu: Synapse;
  private gaba: Synapse;
  private ou: OU | null = null;
  private rec: RecordingNoise | null = null;
  private noiseKey = "";
  private draws = 0;
  private pulseT0 = 0;
  private pulseHigh = false;
  private armed: boolean;
  private lastV: number;
  private syn: SynNow;

  constructor(cell: BuiltCell, inp: StreamInputs, opt: StreamOptions = STREAM_SIM, settleMs = cell.model.settleMs, initial?: Float64Array) {
    this.cell = cell;
    this.inp = inp;
    this.opt = opt;
    this.s = initial ? Float64Array.from(initial) : settle(cell, inp.electrode, inp.ihold, settleMs, opt.dt);
    // the seeds runSweep gives sweep 0, so an unchanged stream replays it
    this.glu = new Synapse(inp.glu, opt.dt, opt.seed * 7919 + 1);
    this.gaba = new Synapse(inp.gaba, opt.dt, opt.seed * 7919 + 2);
    this.syn = { gGlu: 0, gGaba: 0, eGlu: inp.glu.erev, eGaba: inp.gaba.erev };
    this.setNoise(inp.noise ?? DEFAULT_NOISE);
    this.lastV = this.s[cell.iv];
    this.armed = this.lastV < SPIKE_LEVEL;
  }

  get t(): number {
    return this.i * this.opt.dt;
  }

  get vm(): number {
    return this.s[this.cell.iv];
  }

  private setNoise(n: NoiseParams) {
    const key = `${n.memSigma}|${n.memTau}|${n.recSigma}|${n.recBandwidth}|${n.humAmp}|${n.humHz}`;
    if (key === this.noiseKey) return;
    const first = this.noiseKey === "";
    this.noiseKey = key;
    // a retuned source draws from a fresh stream, never a replay of the old one
    const d = first ? 0 : ++this.draws * 1000003;
    this.ou = n.memSigma > 0 ? new OU(n.memSigma, n.memTau, this.opt.dt, this.opt.seed * 104729 + 7 + d) : null;
    this.rec = n.recSigma > 0 || n.humAmp > 0 ? new RecordingNoise(n, this.opt.sampleMs, this.opt.seed * 15485863 + 11 + d) : null;
  }

  /** New leak, Cm or channels: same state, new cell. A different model starts over, settled. */
  setCell(cell: BuiltCell) {
    const same = cell.model.id === this.cell.model.id && cell.nGates === this.cell.nGates;
    this.cell = cell;
    if (!same) {
      this.s = settle(cell, this.inp.electrode, this.inp.ihold, cell.model.settleMs, this.opt.dt);
      this.lastV = this.s[cell.iv];
      this.armed = this.lastV < SPIKE_LEVEL;
    }
  }

  setInputs(inp: StreamInputs) {
    const t = this.t;
    if (inp.pulse.enabled && !this.inp.pulse.enabled) this.pulseT0 = t;
    this.glu.update(inp.glu, t);
    this.gaba.update(inp.gaba, t);
    this.syn.eGlu = inp.glu.erev;
    this.syn.eGaba = inp.gaba.erev;
    this.setNoise(inp.noise ?? DEFAULT_NOISE);
    this.inp = inp;
  }

  /** is the pulse on at t? */
  private pulseOn(t: number): boolean {
    const p = this.inp.pulse;
    if (!p.enabled || p.period <= 0) return false;
    const phase = (((t - this.pulseT0) % p.period) + p.period) % p.period;
    return phase < p.width;
  }

  /** Integrate `ms` of simulated time and return what was sampled along the way. */
  advance(ms: number): Chunk {
    const { dt, sampleMs } = this.opt;
    const every = Math.max(1, Math.round(sampleMs / dt));
    const nSteps = Math.max(0, Math.round(ms / dt));
    const nOut = Math.floor((this.i + nSteps) / every) - Math.floor(this.i / every);
    const vRec = new Float32Array(nOut);
    const vm = new Float32Array(nOut);
    const iCmd = new Float32Array(nOut);
    const gGlu = new Float32Array(nOut);
    const gGaba = new Float32Array(nOut);
    const spikes: number[] = [];
    const onsets: number[] = [];
    const e: Electrode = this.inp.electrode;
    const bridgeRs = e.bridge * e.rs * 1e-3;
    const iv = this.cell.iv;
    let j = 0;
    let t0 = NaN;
    for (let n = 0; n < nSteps; n++) {
      const i = ++this.i;
      const t = i * dt;
      this.syn.gGlu = this.glu.advance(t);
      this.syn.gGaba = this.gaba.advance(t);
      const on = this.pulseOn(t);
      if (on && !this.pulseHigh) onsets.push(t);
      this.pulseHigh = on;
      const ic = this.inp.ihold + (on ? this.inp.pulse.amp : 0);
      step(this.cell, e, this.s, ic, this.ou ? this.ou.next() : 0, dt, this.syn);
      if (i % every === 0) {
        const v = this.s[iv];
        if (j === 0) t0 = t;
        vm[j] = v;
        vRec[j] = this.s[iv + 1] - bridgeRs * ic + (this.rec ? this.rec.next() : 0);
        iCmd[j] = ic;
        gGlu[j] = this.syn.gGlu;
        gGaba[j] = this.syn.gGaba;
        j++;
        // spikes as analysis.ts counts them: up through SPIKE_LEVEL, re-armed below REARM_LEVEL
        if (this.armed) {
          if (this.lastV < SPIKE_LEVEL && v >= SPIKE_LEVEL) {
            spikes.push(t);
            this.armed = false;
          }
        } else if (v < REARM_LEVEL) this.armed = true;
        this.lastV = v;
      }
    }
    return { t0, sampleMs: dt * every, vRec, vm, iCmd, gGlu, gGaba, spikes, onsets };
  }
}
