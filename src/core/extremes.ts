/**
 * When the model is being driven somewhere a real cell would not go: the
 * siren. Every criterion comes from the cell itself, so none is a number
 * someone picked for the cell from outside:
 *
 *   spike failure    a spike that no longer overshoots 0 mV, or depolarization
 *                    block: Vm held above −30 mV for 50 ms (a spike spends
 *                    about a millisecond there; the GnRH cell at the top of its
 *                    range, 1.4 ms)
 *   beyond reversal  Vm outside the span of the reversal potentials in play
 *                    (channels, leak, and any PSCs that are on). No conductance
 *                    can take Vm there; only injected current can
 *   current          injected current more than 10 × the published cell's
 *                    rheobase away from its published holding current
 *                    (800 ms step; ModelDef.rheobase, pinned by tests)
 *
 * Measured on Vm, like every other number on the page. The bounds were chosen
 * by the owner on 2026-10-16 from these three; see docs/process.md.
 */

import type { BuiltCell } from "./cell.ts";
import type { ModelDef } from "./models.ts";
import type { SynInput } from "./synapses.ts";

export type ExtremeKind = "overshoot" | "block" | "range" | "current";

export interface Limits {
  vMin: number;
  vMax: number;
  iCenter: number;
  iBound: number;
}

/** a spike must reach this to count as overshooting, mV */
export const OVERSHOOT = 0;
/** depolarization block: above this… */
export const BLOCK_V = -30;
/** …for this long, ms */
export const BLOCK_MS = 50;
/** how many rheobases away from holding the current may go */
export const CURRENT_RHEOBASES = 10;
/** room at the edge of the reversal span, mV, so rounding never trips it */
const RANGE_MARGIN = 1;

const SPIKE_UP = -20;
const SPIKE_REARM = -40;

export function limitsFor(cell: BuiltCell, model: ModelDef, syn: SynInput[] = []): Limits {
  const es = [...cell.erev, cell.eLeak, ...syn.filter((s) => s.enabled && s.rate > 0 && s.gPeak > 0).map((s) => s.erev)];
  return {
    vMin: Math.min(...es) - RANGE_MARGIN,
    vMax: Math.max(...es) + RANGE_MARGIN,
    iCenter: model.defaults.ihold,
    iBound: CURRENT_RHEOBASES * model.rheobase,
  };
}

export interface Trip {
  kind: ExtremeKind;
  /** when it was last seen, ms */
  t: number;
  /** the value that tripped it: spike peak, block duration, Vm, or current */
  value: number;
}

/**
 * Feed it samples in time order and it records what tripped, and when. A
 * fresh watcher per step-protocol sweep; one continuous watcher for the scope.
 */
export class ExtremeWatch {
  trips = new Map<ExtremeKind, Trip>();
  private lim: Limits;
  private aboveSince = NaN;
  private inSpike = false;
  private armed = true;
  private peak = -Infinity;
  private peakT = 0;
  private lastV = NaN;
  constructor(lim: Limits) {
    this.lim = lim;
  }
  setLimits(lim: Limits) {
    this.lim = lim;
  }
  private trip(kind: ExtremeKind, t: number, value: number) {
    this.trips.set(kind, { kind, t, value });
  }
  feed(vm: ArrayLike<number>, iCmd: ArrayLike<number>, t0: number, dtMs: number) {
    const L = this.lim;
    for (let k = 0; k < vm.length; k++) {
      const v = vm[k];
      const t = t0 + k * dtMs;
      if (v < L.vMin || v > L.vMax) this.trip("range", t, v);
      const i = iCmd[k];
      if (Math.abs(i - L.iCenter) > L.iBound) this.trip("current", t, i);
      // depolarization block
      if (v > BLOCK_V) {
        if (Number.isNaN(this.aboveSince)) this.aboveSince = t;
        else if (t - this.aboveSince >= BLOCK_MS) this.trip("block", t, t - this.aboveSince);
      } else this.aboveSince = NaN;
      // spikes, counted as analysis.ts counts them; each one's peak must overshoot
      if (this.inSpike) {
        if (v > this.peak) {
          this.peak = v;
          this.peakT = t;
        } else if (v < this.peak - 1 || v < SPIKE_UP) {
          if (this.peak < OVERSHOOT) this.trip("overshoot", this.peakT, this.peak);
          this.inSpike = false;
        }
      } else if (this.armed && this.lastV < SPIKE_UP && v >= SPIKE_UP) {
        this.inSpike = true;
        this.armed = false;
        this.peak = v;
        this.peakT = t;
      }
      if (!this.armed && !this.inSpike && v < SPIKE_REARM) this.armed = true;
      this.lastV = v;
    }
  }
  /** what tripped since time t */
  since(t: number): Trip[] {
    return [...this.trips.values()].filter((x) => x.t >= t);
  }
}

/** One line per kind, for the siren's explanation. */
export function describe(trip: Trip, lim: Limits): string {
  switch (trip.kind) {
    case "overshoot":
      return `Spikes have lost their overshoot: one peaked at ${trip.value.toFixed(0)} mV, below 0 mV.`;
    case "block":
      return `Depolarization block: Vm held above ${BLOCK_V} mV for ${BLOCK_MS} ms or more without firing.`;
    case "range":
      return `Vm reached ${trip.value.toFixed(0)} mV, outside the reversal potentials in play (${(lim.vMin + RANGE_MARGIN).toFixed(0)} to ${(lim.vMax - RANGE_MARGIN).toFixed(0)} mV). No conductance can do that; only injected current can.`;
    case "current":
      return `Injected current ${trip.value.toFixed(0)} pA is more than ${CURRENT_RHEOBASES}× this cell's rheobase from its holding current (limit ${(lim.iCenter - lim.iBound).toFixed(0)} to ${(lim.iCenter + lim.iBound).toFixed(0)} pA).`;
  }
}
