import { useEffect, useRef, useState } from "react";
import type { CellParams } from "../core/cell.ts";
import { MODELS } from "../core/models.ts";
import { describe as describeTrip, ExtremeWatch, type Limits } from "../core/extremes.ts";
import type { StreamInputs } from "../core/stream.ts";
import type { ScopeRequest, ScopeResponse } from "../scope-worker.ts";
import { fmtDiv, Scope, STORED_DASH, type ScopeHandle, type Snapshot } from "./Scope.tsx";
import { Tip } from "./Tip.tsx";
import { MUTED, ORANGE } from "./palette.ts";

const TIMEBASES = [10, 20, 50, 100, 200, 500, 1000, 2000];
const SPEEDS = [0.1, 1, 10];
/** stored screens kept at once; the oldest goes first */
const MAX_STORED = 3;
/** windows for the live readouts, in simulated time */
const RATE_WINDOW = 2000;
const VM_WINDOW = 1000;

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

interface Readout {
  rate: number;
  meanVm: number;
  vNow: number;
  achieved: number;
  speed: number;
  t: number;
}

/**
 * Oscilloscope mode: the cell runs continuously and every control acts on it
 * live. The simulation is in its own worker (scope-worker.ts); this owns the
 * screen, the scope's own controls, and the live readouts, which are measured
 * on true Vm like every other number on the page.
 */
/** the siren stays on while anything tripped within this much simulated time */
const SIREN_WINDOW = 1000;

export function ScopeMode({ cell, inputs, seed, limits, onExtremes }: {
  cell: CellParams; inputs: StreamInputs; seed: number; limits: Limits; onExtremes: (reasons: string[]) => void;
}) {
  const scope = useRef<ScopeHandle>(null);
  const worker = useRef<Worker | null>(null);
  const [msPerDiv, setMsPerDiv] = useState(200);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [showVm, setShowVm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [stored, setStored] = useState<Snapshot[]>([]);

  // rolling measurements, kept off React state and published a few times a second
  const spikes = useRef<number[]>([]);
  const vmBins = useRef<{ t: number; sum: number; n: number }[]>([]);
  const live = useRef({ vNow: NaN, achieved: 1, speed: 1, t: 0 });

  // the siren's watcher runs continuously, on every chunk, with the current limits
  const watch = useRef(new ExtremeWatch(limits));
  const limitsRef = useRef(limits);
  limitsRef.current = limits;
  useEffect(() => watch.current.setLimits(limits), [limits]);
  const onExtremesRef = useRef(onExtremes);
  onExtremesRef.current = onExtremes;

  const latest = useRef({ cell, inputs, speed });
  latest.current = { cell, inputs, speed };

  useEffect(() => {
    const w = new Worker(new URL("../scope-worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (ev: MessageEvent<ScopeResponse>) => {
      const r = ev.data;
      if (r.kind === "error") {
        setError(r.message);
        return;
      }
      scope.current?.push(r);
      watch.current.feed(r.vm, r.iCmd, r.t0, r.sampleMs);
      const tEnd = r.t0 + r.vm.length * r.sampleMs;
      let sum = 0;
      for (let i = 0; i < r.vm.length; i++) sum += r.vm[i];
      vmBins.current.push({ t: tEnd, sum, n: r.vm.length });
      spikes.current.push(...r.spikes);
      while (vmBins.current.length && vmBins.current[0].t < tEnd - VM_WINDOW) vmBins.current.shift();
      while (spikes.current.length && spikes.current[0] < tEnd - RATE_WINDOW) spikes.current.shift();
      live.current = { vNow: r.vm[r.vm.length - 1], achieved: r.achieved, speed: r.speed, t: tEnd };
    };
    const { cell, inputs, speed } = latest.current;
    w.postMessage({ kind: "start", cell, inputs, speed, seed } satisfies ScopeRequest);
    // a hidden tab stops the clock; it resumes where it was, without catching up
    const vis = () => {
      if (pausedRef.current) return; // the user's pause outlasts a tab switch
      w.postMessage({ kind: document.hidden ? "pause" : "resume" } satisfies ScopeRequest);
    };
    document.addEventListener("visibilitychange", vis);
    const pub = setInterval(() => {
      const bins = vmBins.current;
      const n = bins.reduce((s, b) => s + b.n, 0);
      const span = Math.min(RATE_WINDOW, live.current.t);
      const recent = watch.current.since(live.current.t - SIREN_WINDOW);
      onExtremesRef.current(recent.map((x) => describeTrip(x, limitsRef.current)));
      setReadout({
        rate: span > 200 ? (spikes.current.length / span) * 1000 : NaN,
        meanVm: n ? bins.reduce((s, b) => s + b.sum, 0) / n : NaN,
        ...live.current,
      });
    }, 250);
    return () => {
      onExtremesRef.current([]);
      watch.current = new ExtremeWatch(limitsRef.current);
      document.removeEventListener("visibilitychange", vis);
      clearInterval(pub);
      w.terminate();
      worker.current = null;
    };
    // the worker lives as long as the mode; a new draw restarts it
  }, [seed]);
  useEffect(() => {
    pausedRef.current = false;
    setPaused(false);
  }, [seed]);

  // every setting is live: send the cell and the inputs whenever they change
  const cellKey = JSON.stringify(cell);
  const inputsKey = JSON.stringify(inputs);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    worker.current?.postMessage({ kind: "update", cell, inputs } satisfies ScopeRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellKey, inputsKey]);

  const changeSpeed = (s: number) => {
    setSpeed(s);
    worker.current?.postMessage({ kind: "update", speed: s } satisfies ScopeRequest);
  };
  const togglePause = () => {
    worker.current?.postMessage({ kind: paused ? "resume" : "pause" } satisfies ScopeRequest);
    pausedRef.current = !paused;
    setPaused(!paused);
  };

  // axes: voltage fixed, as on a scope; current spans the command levels in use
  const lo = Math.min(inputs.ihold, inputs.pulse.enabled ? inputs.ihold + inputs.pulse.amp : inputs.ihold);
  const hi = Math.max(inputs.ihold, inputs.pulse.enabled ? inputs.ihold + inputs.pulse.amp : inputs.ihold);
  const iRange = niceRange(lo, hi, 4);

  // what a stored trace was taken with, so the overlay says what it is
  const label = () => {
    const parts = [MODELS[cell.model].short, `gL ${fmt(cell.gLeak, 2)} nS`, `Ihold ${inputs.ihold} pA`];
    if (inputs.pulse.enabled) parts.push(`pulse ${inputs.pulse.amp} pA`);
    if (inputs.glu.enabled) parts.push(`glu ${inputs.glu.rate} Hz`);
    if (inputs.gaba.enabled) parts.push(`GABA ${inputs.gaba.rate} Hz, E ${inputs.gaba.erev} mV`);
    if (inputs.noise && inputs.noise.memSigma > 0) parts.push(`noise ${inputs.noise.memSigma} pA`);
    return parts.join(", ");
  };
  const store = () => {
    const sn = scope.current?.snapshot(label());
    if (sn) setStored([...stored, sn].slice(-MAX_STORED));
  };
  const triggered = inputs.pulse.enabled;

  const lagging = readout && readout.achieved < 0.85 * readout.speed;
  return (
    <>
      <div className="stats">
        <Tile label="Firing rate" value={readout ? fmt(readout.rate, 1) : "—"} unit="Hz" sub="spikes in the last 2 s" />
        <Tile label="Mean Vm" value={readout ? fmt(readout.meanVm, 1) : "—"} unit="mV" sub="over the last 1 s" />
        <Tile label="Vm now" value={readout ? fmt(readout.vNow, 1) : "—"} unit="mV" sub="true membrane potential" />
        <Tile label="Speed" value={readout ? `${fmt(readout.achieved, readout.achieved < 1 ? 2 : 1)}×` : "—"} unit="real time"
          sub={lagging ? <span className="warn">this device's limit; asked for {readout!.speed}×</span> : `asked for ${speed}×`} />
      </div>

      <figure className="card">
        <figcaption>
          <span>Oscilloscope{paused ? ", paused" : ""}</span>
          <span className="scope-ctrls">
            <label className="select inline">
              <span>Time base</span>
              <select id="timebase-select" value={msPerDiv} onChange={(e) => setMsPerDiv(Number(e.target.value))}>
                {TIMEBASES.map((t) => <option key={t} value={t}>{fmtDiv(t)}/div</option>)}
              </select>
            </label>
            <span className="seg small" role="radiogroup" aria-label="Simulation speed">
              {SPEEDS.map((s) => (
                <button key={s} role="radio" aria-checked={speed === s} className={speed === s ? "on" : ""} onClick={() => changeSpeed(s)}>
                  {s}×
                </button>
              ))}
            </span>
            <button id="scope-pause" className="fixed-w" onClick={togglePause}>{paused ? "Run" : "Pause"}</button>
            <button id="scope-store" onClick={store} title="Keep what is on screen as a faint reference trace">Store</button>
            {stored.length > 0 && <button className="linkish" onClick={() => setStored([])}>clear stored</button>}
            <span className="check">
              <input id="scope-show-vm" type="checkbox" checked={showVm} onChange={(e) => setShowVm(e.target.checked)} />
              <label htmlFor="scope-show-vm">show</label>
              <Tip text={<>
                <b>True Vm</b> is the membrane potential itself. The <b>recorded</b> trace is what the amplifier reports: Vm, plus
                I·Rs from series resistance (less what bridge balance removes), smoothed by pipette capacitance, plus recording noise.
                The readouts above are measured on true Vm.
              </>}>true Vm</Tip>
            </span>
          </span>
        </figcaption>
        {error && <p className="warn">Simulation failed: {error}</p>}
        <Scope ref={scope} msPerDiv={msPerDiv} vRange={[-100, 60]} iRange={iRange} showVm={showVm} triggered={triggered} stored={stored} />
        <p className="legendline">
          The cell runs continuously, and every control on the left acts on it as you move it. Nothing resets it: change the
          leak or the holding current and watch it relax, slow currents included. Only switching models starts it again.
          {showVm && <> <span style={{ color: ORANGE }}>- -</span> true Vm.</>}{" "}
          Unlike the step protocol, a scope run cannot be replayed.{" "}
          {triggered
            ? "With pulses on, each sweep starts at a pulse onset, so stored traces line up with the live one."
            : "Store keeps the screen as a reference; with pulses on, sweeps are triggered and line up."}
          {stored.map((sn, n) => (
            <span key={n} className="pinlabel"><br />
              <StoredKey dash={STORED_DASH[n % STORED_DASH.length]} /> stored {n + 1}: {sn.label}
              {sn.msPerDiv !== msPerDiv && <> (hidden: stored at {fmtDiv(sn.msPerDiv)}/div)</>}
              {sn.triggered !== triggered && sn.msPerDiv === msPerDiv && <> (stored {sn.triggered ? "triggered" : "free running"}, so it may not line up)</>}
            </span>
          ))}
        </p>
      </figure>
    </>
  );
}

/** An axis range of `divs` divisions of a round size (1, 2, 2.5 or 5 × 10ⁿ) that holds lo..hi with some room. */
export function niceRange(lo: number, hi: number, divs: number): [number, number] {
  // a flat command still gets a window around it
  const span = Math.max(hi - lo, 0.5 * Math.max(Math.abs(hi), Math.abs(lo)), 4) * 1.25;
  const raw = span / divs;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
  // centre the levels in use, then snap the bottom to a whole division
  const mid = (lo + hi) / 2;
  let bottom = Math.floor((mid - (divs * step) / 2) / step) * step;
  if (bottom + divs * step < hi) bottom += step;
  if (bottom > lo) bottom -= step;
  return [bottom, bottom + divs * step];
}

/** a short line in the stored trace's dash pattern, for the legend */
function StoredKey({ dash }: { dash: number[] }) {
  return (
    <svg width="22" height="8" aria-hidden="true" style={{ verticalAlign: "middle" }}>
      <line x1="1" y1="4" x2="21" y2="4" stroke={MUTED} strokeWidth="1.5" strokeDasharray={dash.join(" ")} />
    </svg>
  );
}

function Tile({ label, value, unit, sub }: { label: string; value: string; unit: string; sub?: React.ReactNode }) {
  return (
    <div className="tile">
      <div className="t-label">{label}</div>
      <div className="t-value">{value} <span className="t-unit">{unit}</span></div>
      {sub && <div className="t-sub">{sub}</div>}
    </div>
  );
}
