import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AmpDial, AmpFront, AmpRow, AmpSection, AmpSlot } from "./AmpFront.tsx";
import type { CellParams } from "../core/cell.ts";
import { MODELS } from "../core/models.ts";
import { describe as describeTrip, ExtremeWatch, type Limits } from "../core/extremes.ts";
import type { StreamInputs } from "../core/stream.ts";
import type { ScopeRequest, ScopeResponse } from "../scope-worker.ts";
import { fmtDiv, Scope, STORED_DASH, type ScopeHandle, type Snapshot } from "./Scope.tsx";
import { Tip } from "./Tip.tsx";
import { MUTED, ORANGE } from "./palette.ts";
import { Monitor } from "./audio.ts";
import { HMeter } from "./Meter.tsx";
import type { MonitorMode } from "../core/monitor.ts";

const TIMEBASES = [10, 20, 50, 100, 200, 500, 1000, 2000];
const SPEEDS = [0.1, 1, 10];
/** stored screens kept at once; the oldest goes first */
const MAX_STORED = 3;
/** windows the live readouts (firing rate, mean Vm) can average over, in simulated ms */
const READ_WINDOWS = [100, 200, 500, 1000, 2000];

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

/** full scale of the old-school rate meter, per cell: each cell's own working range */
const RATE_SCALE: Record<string, number[]> = {
  rs: [0, 20, 40, 60, 80, 100],
  fs: [0, 100, 200, 300, 400, 500],
  gnrh: [0, 10, 20, 30, 40, 50],
};

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

export function ScopeMode({ cell, inputs, seed, limits, onExtremes, oldSchool = false, amp, ampLastRow, ampControls, readoutSlot }: {
  cell: CellParams; inputs: StreamInputs; seed: number; limits: Limits; onExtremes: (reasons: string[]) => void; oldSchool?: boolean;
  /** the amplifier rows the app supplies (cell, synapses) */
  amp?: React.ReactNode;
  /** sections that open the amplifier's last row, before the audio monitor */
  ampLastRow?: React.ReactNode;
  /** the mode switch and Old school, in the amplifier's name strip */
  ampControls?: React.ReactNode;
  /** where the one-line readouts go: the mode bar, beside Step / Oscilloscope */
  readoutSlot?: HTMLElement | null;
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
  // one window for both readouts, read by the worker callback through a ref
  const [readWin, setReadWin] = useState(1000);
  const readWinRef = useRef(readWin);
  readWinRef.current = readWin;
  const [stored, setStored] = useState<Snapshot[]>([]);
  // the audio monitor: off until asked for (browsers allow sound only after a click)
  const [sound, setSound] = useState<MonitorMode>("off");
  const [volume, setVolume] = useState(50);
  const monitor = useRef<Monitor | null>(null);

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
      // sound is real time only: at 0.1× or 10× it would be meaningless
      if (monitor.current) {
        if (latest.current.speed === 1 && !pausedRef.current) monitor.current.push(r);
        else monitor.current.silence();
      }
      const tEnd = r.t0 + r.vm.length * r.sampleMs;
      let sum = 0;
      for (let i = 0; i < r.vm.length; i++) sum += r.vm[i];
      vmBins.current.push({ t: tEnd, sum, n: r.vm.length });
      spikes.current.push(...r.spikes);
      const win = readWinRef.current;
      while (vmBins.current.length && vmBins.current[0].t < tEnd - win) vmBins.current.shift();
      while (spikes.current.length && spikes.current[0] < tEnd - win) spikes.current.shift();
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
      const span = Math.min(readWinRef.current, live.current.t);
      const recent = watch.current.since(live.current.t - SIREN_WINDOW);
      onExtremesRef.current(recent.map((x) => describeTrip(x, limitsRef.current)));
      setReadout({
        rate: span >= 0.5 * readWinRef.current ? (spikes.current.length / span) * 1000 : NaN,
        meanVm: n ? bins.reduce((s, b) => s + b.sum, 0) / n : NaN,
        ...live.current,
      });
    }, 100); // often enough that a 0.1 s window shows its changes
    return () => {
      onExtremesRef.current([]);
      watch.current = new ExtremeWatch(limitsRef.current);
      document.removeEventListener("visibilitychange", vis);
      clearInterval(pub);
      monitor.current?.silence();
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

  // the monitor outlives a new draw, but not the mode
  useEffect(() => () => {
    monitor.current?.close();
    monitor.current = null;
  }, []);
  useEffect(() => monitor.current?.setNoise(inputs.noise), [inputsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => monitor.current?.setVolume(volume / 100), [volume]);
  const changeSound = (m: MonitorMode) => {
    if (m !== "off" && !monitor.current) {
      monitor.current = new Monitor(); // made in a click, so the browser allows it
      monitor.current.setVolume(volume / 100);
    }
    monitor.current?.setMode(m, inputs.noise);
    setSound(m);
  };

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
  const rateScale = RATE_SCALE[cell.model];
  const winText = readWin < 1000 ? `${readWin} ms` : `${readWin / 1000} s`;
  const readouts = (
    <span className="readline">
      {oldSchool ? <>
        <HMeter label="FIRING RATE" unit="Hz" value={readout?.rate ?? NaN} min={rateScale[0]} max={rateScale[rateScale.length - 1]} major={rateScale} />
        <HMeter label="MEMBRANE POTENTIAL" unit="mV" value={readout?.meanVm ?? NaN} min={-100} max={0} major={[-100, -80, -60, -40, -20, 0]} />
      </> : <>
      <span>Firing <b>{readout ? fmt(readout.rate, 1) : "—"}</b> Hz</span>
      <span>Mean Vm <b>{readout ? fmt(readout.meanVm, 1) : "—"}</b> mV</span>
      </>}
      <span>Vm now <b>{readout ? fmt(readout.vNow, 1) : "—"}</b> mV</span>
      <span className={lagging ? "warn" : undefined}><b>{readout ? `${fmt(readout.achieved, readout.achieved < 1 ? 2 : 1)}×` : "—"}</b> real time</span>
      <Tip text={<>
        <b>Firing</b>: spikes in the last {winText}. <b>Mean Vm</b>: over the last {winText}. <b>Vm now</b>: the true membrane potential.
        A short window follows changes quickly but jumps; a long one is steady but slow.
        All three are measured on true Vm, not the recorded trace. <b>Real time</b>: the speed reached
        {lagging ? <>, which is this device's limit; asked for {readout!.speed}×</> : <>, asked for {speed}×</>}.
      </>}>{""}</Tip>
    </span>
  );
  return (
    <>
      {readoutSlot ? createPortal(readouts, readoutSlot) : readouts}

      <figure className="card scope-card">
        <figcaption className="sr-only">Oscilloscope{paused ? ", paused" : ""}</figcaption>
        {error && <p className="warn">Simulation failed: {error}</p>}
        <Scope ref={scope} msPerDiv={msPerDiv} vRange={[-100, 60]} iRange={iRange} showVm={showVm} triggered={triggered} stored={stored} phosphor={oldSchool} />
        <div className="scope-bar">
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
          <span className="amp-buttons">
            <button id="scope-pause" className="fixed-w" onClick={togglePause}>{paused ? "Run" : "Pause"}</button>
            <button id="scope-store" onClick={store} title="Keep what is on screen as a faint reference trace">Store</button>
            {stored.length > 0 && <button className="linkish" onClick={() => setStored([])}>clear</button>}
          </span>
          <label className="select inline">
            <span>Readouts over</span>
            <select id="readout-window" value={readWin} onChange={(e) => setReadWin(Number(e.target.value))}>
              {READ_WINDOWS.map((w) => <option key={w} value={w}>{w < 1000 ? `${w} ms` : `${w / 1000} s`}</option>)}
            </select>
          </label>
          <span className="check">
            <input id="scope-show-vm" type="checkbox" checked={showVm} onChange={(e) => setShowVm(e.target.checked)} />
            <label htmlFor="scope-show-vm">show</label>
            <Tip text={<>
              <b>True Vm</b> is the membrane potential itself. The <b>recorded</b> trace is what the amplifier reports: Vm, plus
              I·Rs from series resistance (less what bridge balance removes), smoothed by pipette capacitance, plus recording noise.
              The readouts are measured on true Vm.
            </>}>true Vm</Tip>
          </span>
        </div>
        <p className="legendline">
          <Tip text={<>
            The cell runs continuously, and every control acts on it as you move it. Nothing resets it: change the
            leak or the holding current and watch it relax, slow currents included. Only switching models starts it again.
            Unlike the step protocol, a scope run cannot be replayed.{" "}
            {triggered
              ? "With pulses on, each sweep starts at a pulse onset, so stored traces line up with the live one."
              : "Store keeps the screen as a reference; with pulses on, sweeps are triggered and line up."}
          </>}>How the scope works</Tip>
          {paused && <> · <b>paused</b></>}
          {showVm && <> · <span style={{ color: ORANGE }}>- -</span> true Vm</>}
          {stored.map((sn, n) => (
            <span key={n} className="pinlabel"><br />
              <StoredKey dash={STORED_DASH[n % STORED_DASH.length]} /> stored {n + 1}: {sn.label}
              {sn.msPerDiv !== msPerDiv && <> (hidden: stored at {fmtDiv(sn.msPerDiv)}/div)</>}
              {sn.triggered !== triggered && sn.msPerDiv === msPerDiv && <> (stored {sn.triggered ? "triggered" : "free running"}, so it may not line up)</>}
            </span>
          ))}
        </p>
      </figure>

      <AmpFront controls={ampControls}>
        {amp}
        <AmpRow>
        {ampLastRow}
        <AmpSection name="MONITOR">
          <AmpSlot label={(speed !== 1 || paused) && sound !== "off" ? "Sound (plays at 1× while running)" : "Sound"}>
            <span className="seg small" role="radiogroup" aria-label="Audio monitor">
              {([["off", "Off"], ["pop", "Hiss & pop"], ["tone", "Tone (Vm)"]] as const).map(([m, name]) => (
                <button key={m} id={`sound-${m}`} role="radio" aria-checked={sound === m} className={sound === m ? "on" : ""} onClick={() => changeSound(m)}>
                  {name}
                </button>
              ))}
            </span>
            {sound !== "off" && <Tip text={sound === "pop"
                ? <>An audio monitor, as on a rig: the recording noise is the <b>hiss</b>, each spike a <b>pop</b>. Raise the noise RMS for more hiss.</>
                : <>A tone whose <b>pitch follows true Vm</b>: four octaves from −90 to +40 mV. Drift glides, PSPs blip, spikes chirp.</>}>
                what you hear
              </Tip>}
          </AmpSlot>
          {sound !== "off" && <AmpDial label="Volume" unit="%" value={volume} min={0} max={100} step={5} digits={0} onChange={setVolume} />}
        </AmpSection>
        </AmpRow>
      </AmpFront>
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
  // center the levels in use, then snap the bottom to a whole division
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

