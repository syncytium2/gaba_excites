/**
 * The audio monitor, played through Web Audio: hiss and pops, or a tone that
 * follows Vm (src/core/monitor.ts has the arithmetic and its reasons).
 *
 * Only built-in nodes: looping filtered noise for the hiss, a scheduled click
 * buffer per spike, an oscillator for the tone. No AudioWorklet, so nothing
 * has to be loaded as a script. Everything is synthesized here; nothing is
 * fetched, in keeping with the page's no-network rule.
 *
 * Sound is scheduled LATENCY ahead of now, on the audio clock, from stream
 * time. Browsers only allow audio after a click, so a Monitor is made in
 * response to one.
 */

import { audioTime, hissGain, pitchTrack, type MonitorMode } from "../core/monitor.ts";
import type { NoiseParams } from "../core/noise.ts";

export interface MonitorChunk {
  t0: number;
  sampleMs: number;
  vm: Float32Array;
  spikes: number[];
}

/** how far ahead of the audio clock sound is scheduled, s: enough to ride out the worker's uneven bursts */
const LATENCY = 0.12;
/** resynchronize if a sound would land this far ahead, s */
const MAX_AHEAD = 0.4;

export class Monitor {
  private ctx: AudioContext;
  private out: GainNode;
  private hiss: GainNode;
  private click: AudioBuffer;
  private osc: OscillatorNode | null = null;
  private toneGain: GainNode | null = null;
  private offset: number | null = null;
  mode: MonitorMode = "pop";

  constructor() {
    this.ctx = new AudioContext();
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(this.ctx.destination);

    // hiss: two seconds of white noise, looped, band-limited like a small speaker
    const sr = this.ctx.sampleRate;
    const noise = this.ctx.createBuffer(1, 2 * sr, sr);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 300;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6000;
    this.hiss = this.ctx.createGain();
    this.hiss.gain.value = 0;
    src.connect(hp).connect(lp).connect(this.hiss).connect(this.out);
    src.start();

    // a pop: a sharp rise and a quick ringing decay, about 3 ms
    const n = Math.round(0.003 * sr);
    this.click = this.ctx.createBuffer(1, n, sr);
    const c = this.click.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      c[i] = Math.exp(-t / 0.0006) * Math.sin(2 * Math.PI * 1800 * t) * 0.9;
    }
  }

  setVolume(v: number) {
    this.out.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.02);
  }

  setNoise(noise: NoiseParams | undefined) {
    // hiss sits under the tone too, a little quieter
    const g = 0.35 * hissGain(noise) * (this.mode === "tone" ? 0.5 : 1);
    this.hiss.gain.setTargetAtTime(this.mode === "off" ? 0 : g, this.ctx.currentTime, 0.05);
  }

  setMode(mode: MonitorMode, noise: NoiseParams | undefined) {
    this.mode = mode;
    if (mode === "tone" && !this.osc) {
      this.osc = this.ctx.createOscillator();
      this.osc.type = "triangle";
      this.toneGain = this.ctx.createGain();
      this.toneGain.gain.value = 0.18;
      this.osc.connect(this.toneGain).connect(this.out);
      this.osc.start();
    } else if (mode !== "tone" && this.osc) {
      this.osc.stop();
      this.osc.disconnect();
      this.osc = null;
      this.toneGain = null;
    }
    this.setNoise(noise);
    this.offset = null;
  }

  /** Stop scheduling until the next chunk resynchronizes (a pause, a speed change, a stall). */
  silence() {
    this.offset = null;
    this.toneGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
  }

  /** Sound for one chunk of the stream. */
  push(c: MonitorChunk) {
    if (this.mode === "off" || c.vm.length === 0) return;
    const now = this.ctx.currentTime;
    if (this.offset === null) {
      this.offset = now + LATENCY - c.t0 / 1000;
      this.toneGain?.gain.setTargetAtTime(0.18, now, 0.02);
    }
    const start = audioTime(c.t0, this.offset);
    if (start < now || start > now + MAX_AHEAD) {
      // the clocks have drifted, or the stream stalled: start again from here
      this.offset = now + LATENCY - c.t0 / 1000;
    }
    if (this.mode === "pop") {
      for (const t of c.spikes) {
        const s = this.ctx.createBufferSource();
        s.buffer = this.click;
        s.connect(this.out);
        s.start(audioTime(t, this.offset));
      }
    } else if (this.osc) {
      const f = this.osc.frequency;
      for (const p of pitchTrack(c.vm, c.t0, c.sampleMs, 2)) f.setTargetAtTime(p.f, audioTime(p.t, this.offset), 0.0007);
    }
  }

  close() {
    void this.ctx.close();
  }
}
