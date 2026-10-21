/**
 * The amplifier's output filter: a 4-pole low-pass Bessel, at the settings the
 * owner chose after an Axopatch 200B's front-panel filter (1, 2, 5 or 10 kHz,
 * or bypass; not checked against the instrument's manual). A
 * Bessel because it delays every frequency by nearly the same time, so a fast
 * event is smoothed and delayed but does not ring.
 *
 * The analog prototype's poles, normalized to −3 dB at 1 rad/s (scipy.signal
 * bessel(4, 1, analog=True, norm="mag")), are discretized per pole pair by
 * the bilinear transform with the cutoff prewarped, so −3 dB falls at exactly
 * fc. It runs at the integration step (dt = 0.01 ms, 100 kHz), as an analog
 * filter acts before the digitizer, so the step protocol and the oscilloscope,
 * which store samples at different rates, filter identically.
 */

/** Axopatch 200B filter settings, kHz; 0 is bypass */
export const FILTER_KHZ = [0, 1, 2, 5, 10] as const;
export type FilterKHz = (typeof FILTER_KHZ)[number];

/** one conjugate pole pair each: [real, imag] */
const POLES: readonly (readonly [number, number])[] = [
  [-0.9952087644, 1.2571057395],
  [-1.3700678306, 0.4102497175],
];

interface Biquad {
  b0: number; b1: number; b2: number; a1: number; a2: number;
  s1: number; s2: number;
}

export class Bessel4 {
  private q: Biquad[];
  constructor(fcKHz: number, dtMs: number) {
    const wc = 2 * Math.PI * fcKHz; // rad/ms
    const K = 2 / dtMs;
    const Wc = K * Math.tan((wc * dtMs) / 2); // prewarped analog cutoff
    this.q = POLES.map(([re, im]) => {
      // H(s) = w² / (s² + a s + w²) for the pair re ± i·im, scaled to Wc; unity gain at DC
      const w2 = (re * re + im * im) * Wc * Wc;
      const a = -2 * re * Wc;
      const d0 = K * K + a * K + w2;
      return {
        b0: w2 / d0, b1: (2 * w2) / d0, b2: w2 / d0,
        a1: (2 * w2 - 2 * K * K) / d0, a2: (K * K - a * K + w2) / d0,
        s1: 0, s2: 0,
      };
    });
  }

  /** Settle the filter at a constant input, so it starts without a transient. */
  reset(x: number): void {
    for (const f of this.q) {
      // direct form II transposed at steady state, where y = x (unity DC gain)
      f.s2 = (f.b2 - f.a2) * x;
      f.s1 = (f.b1 - f.a1) * x + f.s2;
    }
  }

  next(x: number): number {
    let y = x;
    for (const f of this.q) {
      const out = f.b0 * y + f.s1;
      f.s1 = f.b1 * y - f.a1 * out + f.s2;
      f.s2 = f.b2 * y - f.a2 * out;
      y = out;
    }
    return y;
  }
}

/** Gain of the filter at frequency fKHz, from its own coefficients (for tests). */
export function besselGain(fcKHz: number, dtMs: number, fKHz: number): number {
  // drive it with a long sine and measure the steady amplitude
  const f = new Bessel4(fcKHz, dtMs);
  const w = 2 * Math.PI * fKHz * dtMs;
  const n = Math.ceil(40 / (fKHz * dtMs)) + 20000;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const y = f.next(Math.sin(w * i));
    if (i > n - Math.ceil(2 / (fKHz * dtMs)) - 10) peak = Math.max(peak, Math.abs(y));
  }
  return peak;
}
