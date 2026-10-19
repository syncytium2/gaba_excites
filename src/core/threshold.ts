/**
 * Spike threshold at a chosen dV/dt criterion.
 *
 * Threshold is the Vm where dV/dt first reaches the criterion on the upstroke,
 * found by walking back from the −20 mV crossing. The app's readout uses 20 V/s
 * (analysis.ts). The criterion is a convention, and it matters: from 1 to 20 V/s
 * the same spike's threshold moves about 7 mV in the cortical cells and 13.5 mV
 * in the GnRH cell (tools/experiments/threshold_criteria.ts). So every threshold
 * a report quotes carries its criterion.
 */

export interface Criterion {
  /** V/s (= mV/ms) */
  vps: number;
  /** where the convention comes from */
  source: string;
}

/**
 * The criteria a report tabulates. 1 V/s (GnRH) and 2 V/s (kisspeptin neurons)
 * are the owner's lab's conventions. The three taken from papers are in lit/sources.json.
 */
export const CRITERIA: readonly Criterion[] = [
  { vps: 1, source: "GnRH neurons: DeFazio & Moenter 2002, Mol Endocrinol 16:2255" },
  { vps: 2, source: "AVPV kisspeptin neurons: Wang, DeFazio & Moenter 2016, eNeuro 3:ENEURO.0094-16.2016" },
  { vps: 10, source: "Kress et al. 2010, Hippocampus 20:558" },
  { vps: 20, source: "this app's readout" },
];

export interface ThresholdAt {
  /** V/s */
  vps: number;
  /** mV; NaN if there was no spike */
  v: number;
  /** ms from the start of the trace */
  t: number;
  /**
   * The walk-back reached `floorIdx` (the step onset): the criterion caught the
   * charging after the step began, not the spike. The value is not a threshold.
   */
  hitFloor: boolean;
}

/**
 * Threshold of the spike whose −20 mV crossing is at sample `iCross`, walking
 * back while dV/dt ≥ vps, never past sample `floorIdx`.
 */
export function thresholdAt(vm: ArrayLike<number>, dt: number, iCross: number, vps: number, floorIdx: number): ThresholdAt {
  let j = iCross;
  while (j > floorIdx + 1 && (vm[j - 1] - vm[j - 2]) / dt >= vps) j--;
  const k = Math.max(j - 1, 0);
  return { vps, v: vm[k], t: k * dt, hitFloor: j <= floorIdx + 1 };
}
