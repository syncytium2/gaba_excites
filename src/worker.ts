/// <reference lib="webworker" />
/**
 * The simulation runs here, off the main thread, so dragging a slider never
 * freezes the page. Everything is local: the worker is bundled with the app
 * and the CSP forbids any network connection from it.
 */
import { buildCell, cellRinAt, type CellParams } from "./core/cell.ts";
import { runFamily, runSweep, settle, DEFAULT_SIM, type Inputs, type StepProtocol, type Sweep } from "./core/simulate.ts";
import { summarize, sweepStats, type FamilySummary } from "./core/analysis.ts";

export type Request =
  | { kind: "run"; id: number; cell: CellParams; inputs: Inputs; protocol: StepProtocol; seed: number }
  | { kind: "rheobase"; id: number; cell: CellParams; inputs: Inputs; protocol: StepProtocol; seed: number; lo: number; hi: number; tol: number };

export interface CellInfo {
  gLeak: number;
  vRest: number;
  areaUm2: number;
  rinClamped: boolean;
  /** Rin at the holding current — differs from Rin at rest once Ihold recruits channels */
  rinAtHold: number;
}

export type Response =
  | { kind: "run"; id: number; sweeps: Sweep[]; summary: FamilySummary; cell: CellInfo; ms: number }
  | { kind: "rheobase"; id: number; rheobase: number; tolerance: number; ms: number }
  | { kind: "error"; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<Request>) => {
  const r = ev.data;
  const t0 = performance.now();
  try {
    const cell = buildCell(r.cell);
    const opt = { ...DEFAULT_SIM, seed: r.seed };
    if (r.kind === "run") {
      const sweeps = runFamily(cell, r.inputs, r.protocol, opt);
      const summary = summarize(sweeps, r.protocol);
      const info: CellInfo = {
        gLeak: cell.gLeak,
        vRest: cell.vRest,
        areaUm2: cell.areaUm2,
        rinClamped: cell.rinClamped,
        rinAtHold: cellRinAt(cell, r.inputs.ihold),
      };
      const transfer: ArrayBuffer[] = [];
      for (const s of sweeps) transfer.push(s.vRec.buffer as ArrayBuffer, s.vm.buffer as ArrayBuffer, s.iCmd.buffer as ArrayBuffer, s.gGlu.buffer as ArrayBuffer, s.gGaba.buffer as ArrayBuffer);
      const msg: Response = { kind: "run", id: r.id, sweeps, summary, cell: info, ms: performance.now() - t0 };
      ctx.postMessage(msg, transfer);
    } else {
      // Bisection to `tol` pA between a step that did not fire and one that did.
      // Sweep index 0 for every probe, so each sees the same synaptic barrage.
      const settled = settle(cell, r.inputs.electrode, r.inputs.ihold, opt.settleMs ?? cell.model.settleMs, opt.dt);
      const fires = (amp: number) =>
        sweepStats(runSweep(cell, r.inputs, r.protocol, amp, settled, opt, 0), r.protocol).nInStep > 0;
      let lo = r.lo;
      let hi = r.hi;
      for (let it = 0; it < 60 && hi - lo > r.tol; it++) {
        const mid = 0.5 * (lo + hi);
        if (fires(mid)) hi = mid;
        else lo = mid;
      }
      ctx.postMessage({ kind: "rheobase", id: r.id, rheobase: hi, tolerance: hi - lo, ms: performance.now() - t0 } satisfies Response);
    }
  } catch (e) {
    ctx.postMessage({ kind: "error", id: r.id, message: String(e) } satisfies Response);
  }
};
