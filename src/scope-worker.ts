/// <reference lib="webworker" />
/**
 * The oscilloscope's clock. One Stream (src/core/stream.ts), advanced to keep
 * pace with the wall clock at the chosen speed, in its own worker so that the
 * step protocol's worker and the page are never kept waiting.
 *
 * It never catches up. After a stall (a background tab, a slow device) it
 * resumes from where it is rather than racing through the time it missed,
 * and it reports the speed it actually achieved, so the page can say when a
 * device cannot keep up instead of letting the trace stutter silently.
 */
import { buildCell, type CellParams } from "./core/cell.ts";
import { Stream, STREAM_SIM, type Chunk, type StreamInputs } from "./core/stream.ts";

export type ScopeRequest =
  | { kind: "start"; cell: CellParams; inputs: StreamInputs; speed: number; seed: number }
  | { kind: "update"; cell?: CellParams; inputs?: StreamInputs; speed?: number }
  | { kind: "pause" }
  | { kind: "resume" };

export type ScopeResponse =
  | (Chunk & { kind: "chunk"; /** simulated ms per wall ms, recent */ achieved: number; speed: number })
  | { kind: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const TICK_MS = 16;
/** wall time a tick may spend computing, so a slow device still answers messages */
const BUDGET_MS = 30;
/** the most wall time one tick will try to make up after a stall */
const MAX_GAP_MS = 100;
/** integrate in slices this long, checking the budget between them */
const SLICE_MS = 2;

let stream: Stream | null = null;
let speed = 1;
let paused = false;
let last = 0;
let achieved = 1;
let timer: ReturnType<typeof setTimeout> | null = null;

function merge(chunks: Chunk[]): Chunk {
  if (chunks.length === 1) return chunks[0];
  const n = chunks.reduce((s, c) => s + c.vm.length, 0);
  const cat = (key: "vRec" | "vm" | "iCmd" | "gGlu" | "gGaba") => {
    const out = new Float32Array(n);
    let o = 0;
    for (const c of chunks) {
      out.set(c[key], o);
      o += c[key].length;
    }
    return out;
  };
  const first = chunks.find((c) => c.vm.length > 0) ?? chunks[0];
  return {
    t0: first.t0,
    sampleMs: first.sampleMs,
    vRec: cat("vRec"),
    vm: cat("vm"),
    iCmd: cat("iCmd"),
    gGlu: cat("gGlu"),
    gGaba: cat("gGaba"),
    spikes: chunks.flatMap((c) => c.spikes),
  };
}

function tick() {
  timer = null;
  if (!stream || paused) return;
  const now = performance.now();
  const wall = Math.min(now - last, MAX_GAP_MS);
  last = now;
  const want = wall * speed;
  const chunks: Chunk[] = [];
  let done = 0;
  try {
    while (done < want - 1e-9 && performance.now() - now < BUDGET_MS) {
      const ms = Math.min(SLICE_MS, want - done);
      chunks.push(stream.advance(ms));
      done += ms;
    }
  } catch (e) {
    ctx.postMessage({ kind: "error", message: String(e) } satisfies ScopeResponse);
    return;
  }
  // simulated time per wall time over the tick and its compute, smoothed
  const spent = Math.max(wall, performance.now() - now);
  if (spent > 0) achieved = 0.8 * achieved + 0.2 * (done / spent);
  if (chunks.length) {
    const c = merge(chunks);
    const msg: ScopeResponse = { ...c, kind: "chunk", achieved, speed };
    ctx.postMessage(msg, [c.vRec.buffer, c.vm.buffer, c.iCmd.buffer, c.gGlu.buffer, c.gGaba.buffer] as ArrayBuffer[]);
  }
  timer = setTimeout(tick, TICK_MS);
}

function run() {
  if (timer === null && stream && !paused) {
    last = performance.now();
    timer = setTimeout(tick, TICK_MS);
  }
}

ctx.onmessage = (ev: MessageEvent<ScopeRequest>) => {
  const r = ev.data;
  try {
    if (r.kind === "start") {
      speed = r.speed;
      achieved = r.speed;
      stream = new Stream(buildCell(r.cell), r.inputs, { ...STREAM_SIM, seed: r.seed });
      run();
    } else if (r.kind === "update" && stream) {
      // inputs before the cell, so a new model settles at the new holding current
      if (r.inputs) stream.setInputs(r.inputs);
      if (r.cell) stream.setCell(buildCell(r.cell));
      if (r.speed !== undefined) {
        speed = r.speed;
        achieved = r.speed;
      }
    } else if (r.kind === "pause") {
      paused = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    } else if (r.kind === "resume") {
      paused = false;
      run();
    }
  } catch (e) {
    ctx.postMessage({ kind: "error", message: String(e) } satisfies ScopeResponse);
  }
};
