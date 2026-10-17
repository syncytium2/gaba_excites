/**
 * The audio monitor's arithmetic: what the scope's stream should sound like.
 * Kept here, free of any audio API, so it can be tested; src/ui/audio.ts plays
 * it through the browser's Web Audio.
 *
 * Two modes, after the two generations of rig audio monitor:
 *
 *   hiss & pop   the recording noise as hiss, each spike as a pop. Built from
 *                events (spike times), not by sending the trace to the
 *                speaker: the worker delivers samples in uneven bursts, and a
 *                raw trace would crackle at every one.
 *   tone (Vm)    a tone whose pitch follows the membrane potential, like a
 *                voltage-controlled oscillator: subthreshold drift is a
 *                gliding tone, PSPs are blips, spikes are chirps.
 */

import type { NoiseParams } from "./noise.ts";

export type MonitorMode = "off" | "pop" | "tone";

/** the voltage span the tone covers, mV, and its pitch at each end, Hz: four octaves */
export const TONE_V_LO = -90;
export const TONE_V_HI = 40;
export const TONE_F_LO = 200;
export const TONE_F_HI = 3200;

/** Pitch for a membrane potential: exponential in voltage, so equal mV are equal musical intervals. */
export function vmToPitch(v: number): number {
  const x = Math.min(1, Math.max(0, (v - TONE_V_LO) / (TONE_V_HI - TONE_V_LO)));
  return TONE_F_LO * Math.pow(TONE_F_HI / TONE_F_LO, x);
}

/**
 * One pitch per bin of `binMs`, from samples `dtMs` apart. A bin holding a
 * spike (any sample above −20 mV) takes its maximum, so a 1 ms spike is never
 * averaged away into a 2 ms bin; any other bin takes its mean.
 */
export function pitchTrack(vm: ArrayLike<number>, t0: number, dtMs: number, binMs: number): { t: number; f: number }[] {
  const per = Math.max(1, Math.round(binMs / dtMs));
  const out: { t: number; f: number }[] = [];
  for (let k = 0; k < vm.length; k += per) {
    let sum = 0, max = -Infinity, n = 0;
    for (let j = k; j < Math.min(vm.length, k + per); j++) {
      sum += vm[j];
      if (vm[j] > max) max = vm[j];
      n++;
    }
    out.push({ t: t0 + k * dtMs, f: vmToPitch(max > -20 ? max : sum / n) });
  }
  return out;
}

/** Hiss loudness (0..1) from the recording noise: 1 mV RMS is full scale. No recording noise, no hiss. */
export function hissGain(noise: NoiseParams | undefined): number {
  if (!noise) return 0;
  return Math.min(1, noise.recSigma / 1);
}

/**
 * Where on the audio clock a sample at stream time `tMs` should sound, given
 * the offset found when the stream was first heard. The clocks drift a little
 * (the worker runs to the wall clock, the audio to its own crystal), so when a
 * sound would land in the past or too far ahead the caller resynchronizes.
 */
export function audioTime(tMs: number, offsetS: number): number {
  return tMs / 1000 + offsetS;
}
