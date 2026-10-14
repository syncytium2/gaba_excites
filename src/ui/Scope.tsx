import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { AXIS, BLUE, GRID, INK2, MUTED, ORANGE } from "./palette.ts";

/**
 * An analog-style oscilloscope screen. The trace is written left to right at
 * the time base and wraps, with a blank erase bar running just ahead of the
 * write head; what is behind the bar is the previous pass, still on screen
 * until it is overwritten, as on a real scope.
 *
 * Each pixel column keeps the min and max of every sample that fell in it,
 * so a 0.7 ms spike still reaches its full height at 2 s/div, where one
 * column holds tens of milliseconds. Drawing is a canvas redrawn once per
 * animation frame; samples arrive from the worker in chunks, in between.
 */

export interface ScopeFrame {
  t0: number;
  sampleMs: number;
  vRec: Float32Array;
  vm: Float32Array;
  iCmd: Float32Array;
}

export interface ScopeHandle {
  push(f: ScopeFrame): void;
  clear(): void;
}

interface Props {
  /** ms per division; the screen is 10 divisions wide */
  msPerDiv: number;
  /** voltage axis, mV, 8 divisions */
  vRange: [number, number];
  /** current axis, pA, 4 divisions */
  iRange: [number, number];
  showVm: boolean;
}

const DIVS_X = 10;
const DIVS_V = 8;
const DIVS_I = 4;
const V_H = 300;
const I_H = 96;
const GAP = 14;
const LEFT = 52;
const RIGHT = 10;
const TOP = 8;
const BOTTOM = 22;
/** erase bar, as a fraction of the screen */
const ERASE = 0.025;

interface Columns {
  vrMin: Float32Array; vrMax: Float32Array;
  vmMin: Float32Array; vmMax: Float32Array;
  iMin: Float32Array; iMax: Float32Array;
  filled: Uint8Array;
  head: number;
  pass: number;
}

function columns(w: number): Columns {
  return {
    vrMin: new Float32Array(w), vrMax: new Float32Array(w),
    vmMin: new Float32Array(w), vmMax: new Float32Array(w),
    iMin: new Float32Array(w), iMax: new Float32Array(w),
    filled: new Uint8Array(w),
    head: -1,
    pass: -1,
  };
}

export const Scope = forwardRef<ScopeHandle, Props>(function Scope({ msPerDiv, vRange, iRange, showVm }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = useRef(600);
  const cols = useRef<Columns>(columns(600));
  const dirty = useRef(true);
  const props = useRef({ msPerDiv, vRange, iRange, showVm });
  props.current = { msPerDiv, vRange, iRange, showVm };

  const plotW = () => Math.max(10, width.current - LEFT - RIGHT);
  const reset = () => {
    cols.current = columns(plotW());
    dirty.current = true;
  };

  useImperativeHandle(ref, () => ({
    clear: reset,
    push(f) {
      const c = cols.current;
      const w = c.filled.length;
      const screen = props.current.msPerDiv * DIVS_X;
      for (let k = 0; k < f.vm.length; k++) {
        const t = f.t0 + k * f.sampleMs;
        const pass = Math.floor(t / screen);
        const x = Math.min(w - 1, Math.floor(((t - pass * screen) / screen) * w));
        if (x !== c.head || pass !== c.pass) {
          // Entering a new column. Columns the head jumped over, walking
          // forward from the old head (wrapping once into the next pass), are
          // cleared; everything else keeps the previous pass until written.
          if (pass === c.pass) for (let q = c.head + 1; q < x; q++) c.filled[q] = 0;
          else if (pass === c.pass + 1) {
            for (let q = c.head + 1; q < w; q++) c.filled[q] = 0;
            for (let q = 0; q < x; q++) c.filled[q] = 0;
          } else c.filled.fill(0); // first sample, or a jump of more than a screen
          c.head = x;
          c.pass = pass;
          c.filled[x] = 1;
          c.vrMin[x] = c.vrMax[x] = f.vRec[k];
          c.vmMin[x] = c.vmMax[x] = f.vm[k];
          c.iMin[x] = c.iMax[x] = f.iCmd[k];
          continue;
        }
        if (f.vRec[k] < c.vrMin[x]) c.vrMin[x] = f.vRec[k];
        if (f.vRec[k] > c.vrMax[x]) c.vrMax[x] = f.vRec[k];
        if (f.vm[k] < c.vmMin[x]) c.vmMin[x] = f.vm[k];
        if (f.vm[k] > c.vmMax[x]) c.vmMax[x] = f.vm[k];
        if (f.iCmd[k] < c.iMin[x]) c.iMin[x] = f.iCmd[k];
        if (f.iCmd[k] > c.iMax[x]) c.iMax[x] = f.iCmd[k];
      }
      dirty.current = true;
    },
  }));

  // a new time base starts a clean screen
  useEffect(reset, [msPerDiv]);
  useEffect(() => {
    dirty.current = true;
  }, [vRange[0], vRange[1], iRange[0], iRange[1], showVm]);

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth);
      if (w > 0 && w !== width.current) {
        width.current = w;
        reset();
      }
    });
    ro.observe(el);
    width.current = Math.round(el.clientWidth) || 600;
    reset();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!dirty.current) return;
      dirty.current = false;
      draw();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const cv = canvas.current;
    if (!cv) return;
    const { msPerDiv, vRange, iRange, showVm } = props.current;
    const W = width.current;
    const H = TOP + V_H + GAP + I_H + BOTTOM;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    }
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const pw = plotW();
    const c = cols.current;
    const w = c.filled.length;
    const vTop = TOP;
    const iTop = TOP + V_H + GAP;
    const yV = (v: number) => vTop + ((vRange[1] - v) / (vRange[1] - vRange[0])) * V_H;
    const yI = (i: number) => iTop + ((iRange[1] - i) / (iRange[1] - iRange[0])) * I_H;

    // graticule
    g.font = "11px system-ui, -apple-system, sans-serif";
    g.textBaseline = "middle";
    g.textAlign = "right";
    const grid = (top: number, h: number, divs: number, lo: number, hi: number, label: (x: number) => string) => {
      g.strokeStyle = GRID;
      g.lineWidth = 1;
      for (let d = 0; d <= DIVS_X; d++) {
        const x = LEFT + Math.round((d / DIVS_X) * pw) + 0.5;
        g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + h); g.stroke();
      }
      for (let d = 0; d <= divs; d++) {
        const y = top + Math.round((d / divs) * h) + 0.5;
        g.beginPath(); g.moveTo(LEFT, y); g.lineTo(LEFT + pw, y); g.stroke();
        g.fillStyle = INK2;
        g.fillText(label(hi - (d / divs) * (hi - lo)), LEFT - 6, y);
      }
      g.strokeStyle = AXIS;
      g.strokeRect(LEFT + 0.5, top + 0.5, pw, h);
    };
    grid(vTop, V_H, DIVS_V, vRange[0], vRange[1], (v) => v.toFixed(0));
    grid(iTop, I_H, DIVS_I, iRange[0], iRange[1], (i) => (Math.abs(iRange[1] - iRange[0]) < 8 ? i.toFixed(1) : i.toFixed(0)));
    g.save();
    g.translate(12, vTop + V_H / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillStyle = INK2;
    g.fillText("V recorded (mV)", 0, 0);
    g.restore();
    g.save();
    g.translate(12, iTop + I_H / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillStyle = INK2;
    g.fillText("I (pA)", 0, 0);
    g.restore();
    g.textAlign = "right";
    g.fillStyle = MUTED;
    g.fillText(`${fmtDiv(msPerDiv)}/div · ${(vRange[1] - vRange[0]) / DIVS_V} mV/div`, LEFT + pw, H - 8);

    // traces, with the erase bar ahead of the write head left blank
    const gapCols = Math.max(2, Math.round(ERASE * w));
    const blank = (q: number) => c.head >= 0 && ((q - c.head + w) % w) > 0 && ((q - c.head + w) % w) <= gapCols;
    const trace = (lo: Float32Array, hi: Float32Array, y: (v: number) => number, top: number, h: number, color: string, lw: number, dash: number[] = []) => {
      g.save();
      g.beginPath();
      g.rect(LEFT, top, pw, h);
      g.clip();
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.setLineDash(dash);
      g.beginPath();
      let pen = false;
      for (let q = 0; q < w; q++) {
        if (!c.filled[q] || blank(q)) {
          pen = false;
          continue;
        }
        const x = LEFT + q + 0.5;
        if (!pen) g.moveTo(x, y(hi[q]));
        else g.lineTo(x, y(hi[q]));
        g.lineTo(x, y(lo[q]));
        pen = true;
        // the write head ends the line: what follows is the older pass
        if (q === c.head) pen = false;
      }
      g.stroke();
      g.restore();
    };
    trace(c.vrMin, c.vrMax, yV, vTop, V_H, BLUE, 1.25);
    if (showVm) trace(c.vmMin, c.vmMax, yV, vTop, V_H, ORANGE, 1.25, [4, 3]);
    trace(c.iMin, c.iMax, yI, iTop, I_H, INK2, 1.25);

    // the write head
    if (c.head >= 0) {
      g.fillStyle = "rgba(42, 120, 214, 0.08)";
      const x0 = LEFT + c.head + 1;
      g.fillRect(x0, vTop, Math.min(gapCols, LEFT + pw - x0), V_H);
      g.fillRect(x0, iTop, Math.min(gapCols, LEFT + pw - x0), I_H);
    }
  }

  return (
    <div ref={box} className="scope-screen">
      <canvas ref={canvas} role="img" aria-label="Oscilloscope: recorded membrane voltage and command current, sweeping left to right" />
    </div>
  );
});

export function fmtDiv(ms: number): string {
  return ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`;
}
