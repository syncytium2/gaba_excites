/**
 * Rheobase from a standard membrane potential: hold the cell at `vFrom` with the steady current that puts it there,
 * then bisect the least step that fires a spike during the step. A cell that fires on its own has no rheobase from
 * its own state; from a set potential it does, and cells compare (the owner, 2026-11-04: "Rheobase is usually measured
 * from a standardized membrane potential").
 */
import { cellHoldAt, type BuiltCell } from "./cell.ts";
import { runSweep, settle, type Inputs, type SimOptions, type StepProtocol } from "./simulate.ts";
import { sweepStats } from "./analysis.ts";

export interface RheobaseFrom {
  /** the potential asked for, mV */
  vFrom: number;
  /** the holding current that puts the cell there, pA */
  hold: number;
  /** Vm measured before the step, mV (synaptic inputs can move it off vFrom) */
  vBase: number;
  /** rheobase, pA, and the bisection's resolution; NaN if the held cell fires with no step or none up to 100 nA */
  amp: number;
  tol: number;
}

export function rheobaseFrom(cell: BuiltCell, inputs: Inputs, proto: StepProtocol, vFrom: number, tol: number, opt: SimOptions): RheobaseFrom {
  const hold = cellHoldAt(cell, vFrom);
  const inp: Inputs = { ...inputs, ihold: hold };
  const st = settle(cell, inp.electrode, hold, opt.settleMs ?? cell.model.settleMs, opt.dt);
  // sweep index 0 for every probe, so each sees the same synaptic barrage
  const probe = (a: number) => sweepStats(runSweep(cell, inp, proto, a, st, opt, 0), proto);
  const zero = probe(0);
  const out = { vFrom, hold, vBase: zero.vBaseline, amp: NaN, tol };
  if (zero.nInStep > 0) return out;
  let lo = 0, hi = Math.max(tol, 1);
  while (probe(hi).nInStep === 0) {
    if (hi > 1e5) return out;
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > tol) {
    const mid = 0.5 * (lo + hi);
    if (probe(mid).nInStep > 0) hi = mid;
    else lo = mid;
  }
  return { ...out, amp: hi, tol: hi - lo };
}
