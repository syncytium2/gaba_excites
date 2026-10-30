/// <reference lib="webworker" />
/**
 * Voltage clamp runs here, off the main thread, like the step protocol's
 * worker. Everything is local; the CSP forbids any network connection from it.
 *
 * Two jobs: a family ("run"), and a zoomed window of it re-simulated at a finer
 * step ("window"). Both report progress. A window runs in its own worker, which
 * the page terminates to cancel it, so a stale window never arrives.
 */
import { buildCell, type CellParams } from "./core/cell.ts";
import { runVCFamily, runVCWindow, VC_SIM, type VCInputs, type VCProtocol, type VCSweep, type VCWindowSweep } from "./core/vclamp.ts";

export type VCRequest =
  | { kind?: "run"; id: number; cell: CellParams; inputs: VCInputs; protocol: VCProtocol; seed: number }
  | { kind: "window"; id: number; cell: CellParams; inputs: VCInputs; protocol: VCProtocol; seed: number; t0: number; t1: number; fineDt: number };
export type VCResponse =
  | { kind: "run"; id: number; sweeps: VCSweep[]; ms: number }
  | { kind: "window"; id: number; sweeps: VCWindowSweep[]; ms: number; t0: number; t1: number; fineDt: number }
  | { kind: "progress"; id: number; f: number }
  | { kind: "error"; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<VCRequest>) => {
  const r = ev.data;
  const t0 = performance.now();
  // progress at most every 50 ms, so the page is not flooded
  let last = 0;
  const progress = (f: number) => {
    const now = performance.now();
    if (now - last < 50 && f < 1) return;
    last = now;
    ctx.postMessage({ kind: "progress", id: r.id, f } satisfies VCResponse);
  };
  try {
    const opt = { ...VC_SIM, seed: r.seed };
    const transfer: ArrayBuffer[] = [];
    if (r.kind === "window") {
      const sweeps = runVCWindow(buildCell(r.cell), r.inputs, r.protocol, opt, r.t0, r.t1, r.fineDt, progress);
      for (const s of sweeps) transfer.push(s.iRec.buffer as ArrayBuffer, s.iTrue.buffer as ArrayBuffer, s.vm.buffer as ArrayBuffer, s.vCmd.buffer as ArrayBuffer);
      ctx.postMessage({ kind: "window", id: r.id, sweeps, ms: performance.now() - t0, t0: r.t0, t1: r.t1, fineDt: r.fineDt } satisfies VCResponse, transfer);
      return;
    }
    const sweeps = runVCFamily(buildCell(r.cell), r.inputs, r.protocol, opt, progress);
    for (const s of sweeps) transfer.push(s.iRec.buffer as ArrayBuffer, s.iTrue.buffer as ArrayBuffer, s.vm.buffer as ArrayBuffer, s.vCmd.buffer as ArrayBuffer);
    ctx.postMessage({ kind: "run", id: r.id, sweeps, ms: performance.now() - t0 } satisfies VCResponse, transfer);
  } catch (e) {
    ctx.postMessage({ kind: "error", id: r.id, message: String(e) } satisfies VCResponse);
  }
};
