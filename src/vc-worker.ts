/// <reference lib="webworker" />
/**
 * Voltage clamp runs here, off the main thread, like the step protocol's
 * worker. Everything is local; the CSP forbids any network connection from it.
 */
import { buildCell, type CellParams } from "./core/cell.ts";
import { runVCFamily, VC_SIM, type VCInputs, type VCProtocol, type VCSweep } from "./core/vclamp.ts";

export type VCRequest = { id: number; cell: CellParams; inputs: VCInputs; protocol: VCProtocol; seed: number };
export type VCResponse = { kind: "run"; id: number; sweeps: VCSweep[]; ms: number } | { kind: "error"; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<VCRequest>) => {
  const r = ev.data;
  const t0 = performance.now();
  try {
    const sweeps = runVCFamily(buildCell(r.cell), r.inputs, r.protocol, { ...VC_SIM, seed: r.seed });
    const transfer: ArrayBuffer[] = [];
    for (const s of sweeps) transfer.push(s.iRec.buffer as ArrayBuffer, s.iTrue.buffer as ArrayBuffer, s.vm.buffer as ArrayBuffer, s.vCmd.buffer as ArrayBuffer);
    ctx.postMessage({ kind: "run", id: r.id, sweeps, ms: performance.now() - t0 } satisfies VCResponse, transfer);
  } catch (e) {
    ctx.postMessage({ kind: "error", id: r.id, message: String(e) } satisfies VCResponse);
  }
};
