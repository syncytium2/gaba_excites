import { useEffect, useMemo, useRef, useState } from "react";
import type uPlot from "uplot";
import type { CellParams } from "../core/cell.ts";
import { DEFAULT_NOISE, type NoiseParams } from "../core/noise.ts";
import { FILTER_KHZ } from "../core/filter.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "../core/synapses.ts";
import { VC_PRESETS, vcPresetsFor } from "../core/protocol.ts";
import { fitBoltzmann, measureSweep, zeroCrossing, type VCMeasure, type VCPoint, type VCProtocol, type VCSweep } from "../core/vclamp.ts";
import { linePlot, type PlotTheme, type Series } from "../core/svgplot.ts";
import type { VCRequest, VCResponse } from "../vc-worker.ts";
import { AmpChoice, AmpDial, AmpRow, AmpSection, AmpSlot, RigPanels } from "./AmpFront.tsx";
import { Plot } from "./Plot.tsx";
import { Tip } from "./Tip.tsx";
import { axisOpts } from "./axis.ts";
import { useCurrentUnit, type CurrentUnit } from "./current.tsx";
import type { ChartColors } from "./palette.ts";

/** Limits that keep a family quick: a run is settled once, then every sweep. */
const MAX_SWEEPS = 30;
const MAX_SWEEP_MS = 3000;
/** after each command step, this much of the record is left out of the y autoscale: the capacitive transient */
const CAP_MS = 0.6;

const KINDS = [["peakIn", "Peak in"], ["peakOut", "Peak out"], ["mean", "Mean"], ["cursor", "Cursor"]] as const;
const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

/**
 * pA, or nA once currents are large: the pyramidal soma's sodium current is hundreds of nA.
 * With the current units switch on density, pA/pF at any size.
 */
function vcUnit(maxAbs: number, cu: CurrentUnit): { div: number; unit: string } {
  if (cu.density) return { div: cu.cm, unit: cu.label };
  return maxAbs >= 5000 ? { div: 1000, unit: "nA" } : { div: 1, unit: "pA" };
}

/**
 * Voltage-clamp mode. The cell, its channels and the integrator are the
 * current-clamp ones; the amplifier now holds the pipette at a command. Nothing
 * is drawn from the model's equations: the I–V and normalized curves exist only
 * once a protocol has run and the experimenter has chosen where to measure, and
 * they are measured on the RECORDED current (filtered, with noise), with the
 * true current and Vm available behind it (the owner's choices, 2026-10-29).
 */
export function VClampMode({ cell, simTop, simSummary, ampControls, pal, screenH = 460 }: {
  cell: CellParams;
  /** the simulation panel's one-line summary, as the app writes it; this adds the noise */
  simSummary: string;
  /** the simulation rows the app supplies: model, cell size and leak, channel blocks, a model's own knobs */
  simTop: React.ReactNode;
  /** the mode switch and Old school, in the amplifier's name strip */
  ampControls: React.ReactNode;
  pal: ChartColors;
  screenH?: number;
}) {
  const [presetId, setPresetId] = useState(VC_PRESETS[0].id);
  const [proto, setProto] = useState<VCProtocol>(VC_PRESETS[0].protocol);
  const [measures, setMeasures] = useState<VCMeasure[]>(VC_PRESETS[0].measures);
  const [norm, setNorm] = useState<"I" | "G">(VC_PRESETS[0].norm);
  const [erev, setErev] = useState(VC_PRESETS[0].erev ?? 50);
  const [fitOn, setFitOn] = useState(VC_PRESETS[0].fit ?? true);
  // An ideal clamp to begin with, so the first view is clean; the Rs dial is beside it (docs/process.md)
  const [rs, setRs] = useState(0);
  // 10 kHz, as current clamp opens: a lower filter blunts the fast sodium peak and moves the fitted G–V (vclamp.test.ts)
  const [noise, setNoise] = useState<NoiseParams>({ ...DEFAULT_NOISE, recSigma: 2, recFilter: 10 });
  const [showTrue, setShowTrue] = useState(false);
  const [xAxis, setXAxis] = useState<"cmd" | "vm">("cmd");
  const [seed, setSeed] = useState(1);
  const [result, setResult] = useState<{ sweeps: VCSweep[]; ms: number; protocol: VCProtocol } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preset = vcPresetsFor(cell.model).find((p) => p.id === presetId);

  const applyPreset = (id: string) => {
    const p = VC_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setProto(p.protocol);
    setMeasures(p.measures);
    setNorm(p.norm);
    setFitOn(p.fit ?? true);
    if (p.erev !== undefined) setErev(p.erev);
  };
  const putProto = (p: VCProtocol) => {
    setProto(p);
    setPresetId("custom");
  };

  // ------------------------------------------------------------ the run
  const valid = proto.segments.length > 0 && proto.vary.seg < proto.segments.length && proto.vary.count >= 1 && proto.vary.count <= MAX_SWEEPS;
  const longest = useMemo(() => {
    let t = 0;
    for (let k = 0; k < proto.vary.count; k++) {
      let s = 0;
      proto.segments.forEach((g, i) => (s += i === proto.vary.seg && proto.vary.what === "dur" ? Math.max(0, proto.vary.first + k * proto.vary.delta) : g.dur));
      t = Math.max(t, s);
    }
    return t;
  }, [proto]);
  const tooLong = longest > MAX_SWEEP_MS;

  const worker = useRef<Worker | null>(null);
  const lastId = useRef(0);
  const pending = useRef(proto);
  useEffect(() => {
    const w = new Worker(new URL("../vc-worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<VCResponse>) => {
      const r = ev.data;
      if (r.id !== lastId.current) return; // stale
      if (r.kind === "run") {
        setResult({ sweeps: r.sweeps, ms: r.ms, protocol: pending.current });
        setError(null);
      } else setError(r.message);
      setBusy(false);
    };
    worker.current = w;
    return () => w.terminate();
  }, []);
  const runKey = JSON.stringify({ cell, proto, rs, noise, seed });
  useEffect(() => {
    if (!valid || tooLong) return;
    setBusy(true);
    const h = setTimeout(() => {
      const id = ++lastId.current;
      pending.current = proto;
      const msg: VCRequest = {
        id,
        cell,
        inputs: { rs, noise, glu: { ...DEFAULT_GLU, enabled: false }, gaba: { ...DEFAULT_GABA, enabled: false } },
        protocol: proto,
        seed,
      };
      worker.current?.postMessage(msg);
    }, 90);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  // ------------------------------------------------------------ measuring
  const sweeps = result?.sweeps ?? [];
  const points: VCPoint[][] = useMemo(() => measures.map((m) => sweeps.map((sw) => measureSweep(sw, m))), [sweeps, measures]);
  const vary = result?.protocol.vary ?? proto.vary;
  const varied = vary.what;
  // x is the swept value: the command of the varied segment, or its duration. True Vm can stand in for the
  // command only where the measurement is taken in the varied segment itself (an I–V, not a prepulse family).
  const vmOk = (j: number) => varied === "v" && measures[j]?.seg === vary.seg;
  const xOf = (p: VCPoint, j = 0) => (xAxis === "vm" && vmOk(j) ? p.vm : p.value);
  const xLabel = varied === "dur" ? `segment ${vary.seg + 1} duration (ms)` : xAxis === "vm" && vmOk(0) ? "true Vm at the measurement (mV)" : `segment ${vary.seg + 1} command (mV)`;

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const pts of points) for (const p of pts) m = Math.max(m, Math.abs(p.i));
    return m;
  }, [points]);
  const cu = useCurrentUnit();
  const u = vcUnit(maxAbs, cu);

  // the first measurement, normalized: I/Imax, or G/Gmax with G = I/(V − E_rev); fitted where the varied thing is a voltage
  const normalized = useMemo(() => {
    const pts = points[0] ?? [];
    if (!pts.length) return null;
    const x = pts.map(xOf);
    const asG = norm === "G" && varied === "v";
    const raw = pts.map((p, i) => (asG ? p.i / (x[i] - erev) : p.i));
    // A conductance is positive: Gmax is the largest positive G. A point whose G comes out clearly negative is
    // not that conductance (at +40 mV the K⁺ current can outweigh what sodium is left, so "peak in" is outward);
    // it is drawn but not fitted. Near zero is a closed channel plus noise, and is fitted. A current keeps its
    // sign: Imax is the largest in magnitude.
    let big = 0;
    for (const r of raw) if (Number.isFinite(r) && (asG ? r > big : Math.abs(r) > Math.abs(big))) big = r;
    const y = raw.map((r) => (big !== 0 ? r / big : NaN));
    const ok = x.map((_, i) => Number.isFinite(x[i]) && Number.isFinite(y[i]) && (!asG || y[i] > -NEG_G));
    const dropped = asG ? y.filter((v) => Number.isFinite(v) && v <= -NEG_G).length : 0;
    const fx = x.filter((_, i) => ok[i]);
    const fy = y.filter((_, i) => ok[i]);
    const fit = varied === "v" && fitOn ? fitBoltzmann(fx, fy) : null;
    // where the measured current changes sign, by linear interpolation: a reversal potential, for a tail family
    const zero = varied === "v" ? zeroCrossing(x, pts.map((p) => p.i)) : NaN;
    return { x, y, fit, zero, dropped };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, norm, erev, xAxis, varied, fitOn]);

  // ------------------------------------------------------------ plots
  const theme: PlotTheme = { ink: pal.ink2, ink2: pal.ink2, grid: pal.grid, axis: pal.axis, surface: pal.surface };
  const colors = [pal.orange, pal.aqua];
  const ivSvg = useMemo(() => {
    if (!sweeps.length) return "";
    const series: Series[] = points.map((pts, j) => {
      const order = pts.map((p, i) => [xOf(p, j), i] as const).sort((a, b) => a[0] - b[0]);
      return { x: order.map(([x]) => x), y: order.map(([, i]) => pts[i].i / u.div), color: colors[j], dots: true, label: `M${j + 1}: ${KINDS.find((k) => k[0] === measures[j].kind)![1].toLowerCase()}` };
    });
    return linePlot({ series, xlabel: xLabel, ylabel: `${u.unit === "pA/pF" ? "measured I" : "measured current"} (${u.unit})`, hlines: [{ y: 0, color: pal.muted }], legend: true, theme, width: 520, height: 150 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, xAxis, pal, u.div, u.unit]);
  const normSvg = useMemo(() => {
    if (!normalized) return "";
    const order = normalized.x.map((x, i) => [x, i] as const).filter(([x]) => Number.isFinite(x)).sort((a, b) => a[0] - b[0]);
    const series: Series[] = [{ x: order.map(([x]) => x), y: order.map(([, i]) => normalized.y[i]), color: colors[0], dots: true, line: false, label: "M1, normalized" }];
    // every point on the plot: nothing is clipped
    const ys = normalized.y.filter(Number.isFinite);
    const yLo = Math.min(0, ...ys);
    const yHi = Math.max(1, ...ys);
    const f = normalized.fit;
    if (f && Number.isFinite(f.vHalf) && order.length) {
      const lo = order[0][0];
      const hi = order[order.length - 1][0];
      const xs: number[] = [];
      for (let v = lo; v <= hi; v += (hi - lo) / 100 || 1) xs.push(v);
      series.push({ x: xs, y: xs.map((v) => 1 / (1 + Math.exp((v - f.vHalf) / f.k))), color: pal.blue, label: "Boltzmann fit" });
    }
    return linePlot({ series, xlabel: xLabel, ylabel: norm === "G" && varied === "v" ? "G / Gmax" : "I / Imax", yrange: [Math.min(-0.1, yLo - 0.05), Math.max(1.1, yHi + 0.05)], legend: true, theme, width: 520, height: 150 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized, pal, norm]);

  // ------------------------------------------------------------ controls
  const segs = proto.segments;
  const setSeg = (i: number, patch: Partial<{ dur: number; v: number }>) => putProto({ ...proto, segments: segs.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const num = (v: number, set: (n: number) => void, w = 52, step = 1) => (
    <input className="amp-num" type="number" style={{ width: w }} value={v} step={step} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) set(n); }} />
  );
  const setMeasure = (j: number, patch: Partial<VCMeasure>) => {
    setMeasures(measures.map((m, i) => (i === j ? { ...m, ...patch } : m)));
    setPresetId("custom");
  };

  const status = !valid ? "check the protocol" : tooLong ? `sweeps are limited to ${MAX_SWEEP_MS} ms` : busy ? "simulating…" : result ? `${sweeps.length} sweeps simulated in ${Math.round(result.ms)} ms` : "";

  return (
    <>
      <div className="vc-layout">
        <figure className="card screen-card vc-traces">
          <figcaption>
            <span>Recorded current{showTrue ? ", true current and Vm dashed behind" : ""} <span className="status" aria-live="polite">{status}</span></span>
            <span className="check">
              <input id="vc-show-true" type="checkbox" checked={showTrue} onChange={(e) => setShowTrue(e.target.checked)} />
              <label htmlFor="vc-show-true">show</label>
              <Tip text={<>
                The <b>recorded</b> current is what the amplifier reports: through its filter, with its noise. Every measurement here
                is made on it, as on a rig. The simulation also knows the <b>true</b> current and the cell's <b>true Vm</b>. With Rs
                in the loop the cell is not at the command: the larger the current, the further it strays. Plot the I–V against true
                Vm to see where the cell really was.
              </>}>true current and Vm</Tip>
            </span>
          </figcaption>
          {sweeps.length > 0 && <VCTraces sweeps={sweeps} measures={measures} showTrue={showTrue} pal={pal} valueUnit={varied === "v" ? "mV" : "ms"} height={Math.max(330, screenH - 110)} />}
          <p className="legendline">
            Sweeps shade {pal.name === "dark" ? "dim → bright" : "light → dark"} with the varied value. {pal.name === "dark" ? <>Dotted gates mark where each measurement is taken, and the readout under the screen gives each one's extreme over the family.</> : <>Shaded windows show where each
            measurement is taken (<span style={{ color: colors[0] }}>■</span> M1, <span style={{ color: colors[1] }}>■</span> M2).</>} The
            capacitive transient after each command step is left out of the autoscale.
          </p>
          {error && <div className="warn" role="alert">Simulation failed: {error}</div>}
        </figure>
        <div className="vc-side">
          <figure className="card">
            <figcaption><span>Measured: {measures.map((m, j) => `M${j + 1} ${KINDS.find((k) => k[0] === m.kind)![1].toLowerCase()}`).join(", ")}</span></figcaption>
            {ivSvg ? <div className="svgplot" dangerouslySetInnerHTML={{ __html: ivSvg }} /> : <p className="legendline">Run a protocol to see what it measures.</p>}
          </figure>
          <figure className="card">
            <figcaption>
              <span>M1 normalized{normalized?.fit && Number.isFinite(normalized.fit.vHalf) ? `: V½ ${fmt(normalized.fit.vHalf)} mV, k ${fmt(normalized.fit.k)} mV` : ""}
                {normalized && !normalized.fit && Number.isFinite(normalized.zero) ? `: M1 reverses at ${fmt(normalized.zero)} mV` : ""}</span>
            </figcaption>
            {normSvg ? <div className="svgplot" dangerouslySetInnerHTML={{ __html: normSvg }} /> : null}
            <p className="legendline">
              {norm === "G" && varied === "v" ? <>G = I / (V − E_rev), E_rev {erev} mV, over its largest. </> : <>I over its largest. </>}
              {varied !== "v" ? "No fit: the varied value is a duration." : fitOn ? <>A Boltzmann, 1/(1 + exp((V − V½)/k)), is fitted by least squares{normalized && normalized.dropped > 0 ? <>, leaving out {normalized.dropped === 1 ? "the point" : `the ${normalized.dropped} points`} where G is negative: there the current measured is outward, not the conductance being normalized (block K⁺ under CHANNELS for a clean curve)</> : null}.</> : "No fit: a tail family is linear; where it crosses zero is the reversal of what was open."}
              {xAxis === "vm" && vmOk(0) && " Plotted against the cell's true Vm, not the command."}
              {xAxis === "vm" && !vmOk(0) && " True Vm applies where M1 is taken in the varied segment; here it is plotted against the command."}
            </p>
          </figure>
        </div>
      </div>

      <RigPanels controls={ampControls}
        amplifier={{
          rows: (
            <AmpRow>
          <AmpSection name="CLAMP">
            <AmpDial label="Rs" unit="MΩ" value={rs} min={0} max={30} step={0.5} digits={1} onChange={setRs}
              hint="Series resistance between the amplifier and the cell. 0 is an ideal clamp. Any Rs lets a large current pull the cell away from the command: turn it up on the activation protocol and watch the sodium current escape." />
          </AmpSection>
              <AmpSection name="FILTER">
            <AmpChoice label="Filter, kHz" value={noise.recFilter} options={FILTER_KHZ.map((f) => [f, f === 0 ? "Bypass" : String(f)] as const)} onChange={(recFilter) => setNoise({ ...noise, recFilter })} />
              </AmpSection>
            </AmpRow>
          ),
          summary: `Voltage clamp · Rs ${rs} MΩ${rs === 0 ? " (ideal)" : ""} · filter ${noise.recFilter ? `${noise.recFilter} kHz` : "bypass"}`,
        }}
        acquisition={{
          rows: (
            <>
              <AmpRow>
          <AmpSection name="PROTOCOL">
            <AmpSlot label="Preset">
              <Tip text={preset ? preset.note : "Your own protocol."}>
                <select id="vc-preset" aria-label="Voltage-clamp protocol" value={preset ? presetId : "custom"} onChange={(e) => applyPreset(e.target.value)}>
                  {vcPresetsFor(cell.model).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  {!preset && <option value="custom">Custom</option>}
                </select>
              </Tip>
            </AmpSlot>
            <AmpSlot label="Hold, mV">{num(proto.hold, (hold) => putProto({ ...proto, hold }))}</AmpSlot>
            <div className="vc-segs" role="group" aria-label="Segments">
              {segs.map((s, i) => {
                const varies = proto.vary.seg === i;
                return (
                  <div key={i} className={"vc-seg" + (varies ? " varies" : "")}>
                    <span className="amp-slot-label">{i + 1}{varies ? " ⇅" : ""}</span>
                    <span>{num(s.dur, (dur) => setSeg(i, { dur: Math.max(0, dur) }), 50)} ms</span>
                    <span>{num(s.v, (v) => setSeg(i, { v }), 50)} mV</span>
                    <span className="vc-seg-btns">
                      <button type="button" title="This segment varies" aria-pressed={varies} onClick={() => putProto({ ...proto, vary: { ...proto.vary, seg: i, first: proto.vary.what === "v" ? s.v : s.dur } })}>⇅</button>
                      {segs.length > 1 && <button type="button" title="Remove this segment" onClick={() => {
                        const rest = segs.filter((_, j) => j !== i);
                        const seg = proto.vary.seg > i ? proto.vary.seg - 1 : Math.min(proto.vary.seg, rest.length - 1);
                        putProto({ ...proto, segments: rest, vary: { ...proto.vary, seg } });
                      }}>−</button>}
                    </span>
                  </div>
                );
              })}
              {segs.length < 8 && <button type="button" className="vc-add" onClick={() => putProto({ ...proto, segments: [...segs, { dur: 10, v: proto.hold }] })}>+ segment</button>}
            </div>
            <AmpChoice label="Segment ⇅ varies its" value={proto.vary.what} options={[["v", "Voltage"], ["dur", "Duration"]] as const} onChange={(what) => putProto({ ...proto, vary: { ...proto.vary, what } })} />
            <AmpSlot label="First">{num(proto.vary.first, (first) => putProto({ ...proto, vary: { ...proto.vary, first } }))}</AmpSlot>
            <AmpSlot label="Increment">{num(proto.vary.delta, (delta) => putProto({ ...proto, vary: { ...proto.vary, delta } }))}</AmpSlot>
            <AmpSlot label="Sweeps">{num(proto.vary.count, (count) => putProto({ ...proto, vary: { ...proto.vary, count: Math.max(1, Math.min(MAX_SWEEPS, Math.round(count))) } }), 44)}</AmpSlot>
          </AmpSection>
              </AmpRow>
              <AmpRow>
          {measures.map((m, j) => (
            <AmpSection key={j} name={`MEASURE M${j + 1}`} power={j === 1 ? { on: true, onChange: () => { setMeasures(measures.slice(0, 1)); setPresetId("custom"); } } : undefined}>
              <AmpSlot label="In segment">
                <select aria-label={`M${j + 1} segment`} value={m.seg} onChange={(e) => setMeasure(j, { seg: Number(e.target.value) })}>
                  {segs.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
                </select>
              </AmpSlot>
              <AmpChoice label="Take" value={m.kind} options={KINDS} onChange={(kind) => setMeasure(j, { kind })} />
              <AmpSlot label="From, ms">{num(m.from, (from) => setMeasure(j, { from }), 52, 0.1)}</AmpSlot>
              {m.kind !== "cursor" && <AmpSlot label="To, ms">{num(m.to, (to) => setMeasure(j, { to }), 52, 0.1)}</AmpSlot>}
            </AmpSection>
          ))}
          {measures.length < 2 && (
            <AmpSection name="MEASURE M2" power={{ on: false, onChange: () => { setMeasures([...measures, { ...measures[0], kind: "mean" }]); setPresetId("custom"); } }}>
              <AmpSlot label="Off">{""}</AmpSlot>
            </AmpSection>
          )}
          <AmpSection name="ANALYSIS">
            <AmpChoice label="Normalize M1" value={norm} options={[["I", "I/Imax"], ["G", "G/Gmax"]] as const} onChange={setNorm} />
            {norm === "G" && <AmpSlot label="E_rev, mV">{num(erev, setErev)}</AmpSlot>}
            <AmpChoice label="Boltzmann fit" value={fitOn ? "on" : "off"} options={[["on", "On"], ["off", "Off"]] as const} onChange={(v) => setFitOn(v === "on")} />
            <AmpChoice label="Plot against" value={xAxis} options={[["cmd", "Command"], ["vm", "True Vm"]] as const} onChange={setXAxis} />
          </AmpSection>
              </AmpRow>
            </>
          ),
          summary: `${preset ? preset.label : "Custom protocol"} · hold ${proto.hold} mV · ${proto.vary.count} sweeps · ` + measures.map((m, j) => `M${j + 1} ${KINDS.find((k) => k[0] === m.kind)![1].toLowerCase()} in segment ${m.seg + 1}`).join(", "),
        }}
        simulation={{
          rows: (
            <>
              {simTop}
              <AmpRow>
                <AmpSection name="RECORDING NOISE">
            <AmpDial label="RMS" unit="pA" value={noise.recSigma} min={0} max={50} step={0.5} digits={1}
              hint="Current noise as it reads through a 10 kHz filter. Measurements are made on the recorded current, so noise moves them, as it would on a rig." onChange={(recSigma) => setNoise({ ...noise, recSigma })} />
            <AmpSlot label="Draw">
              <span className="amp-readout">#{seed}</span>
              <button type="button" onClick={() => setSeed(seed + 1)} title="A new draw of the noise; the cell is unchanged">New</button>
            </AmpSlot>
                </AmpSection>
              </AmpRow>
            </>
          ),
          summary: `${simSummary} · noise ${noise.recSigma} pA RMS`,
        }} />
      {sweeps.length > 0 && (
            <div className="tablewrap vc-table">
              <table>
                <thead><tr><th>{varied === "dur" ? "ms" : "mV"}</th>{points.map((_, j) => <th key={j}>M{j + 1} ({u.unit})</th>)}<th>true Vm (mV)</th></tr></thead>
                <tbody>
                  {sweeps.map((sw, k) => (
                    <tr key={k}><td>{sw.value}</td>{points.map((pts, j) => <td key={j}>{fmt(pts[k].i / u.div, u.div === 1 ? 1 : 2)}</td>)}<td>{fmt(points[0]?.[k]?.vm ?? NaN, 1)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </>
  );
}

/** the gates' colors on the tube: phosphor green for M1, a paler, bluer green for M2 */
const GATE = ["rgba(170, 255, 190, 0.95)", "rgba(150, 220, 255, 0.9)"];

/** below this, a normalized G is taken as not the conductance at all, and left out of the fit */
const NEG_G = 0.05;

/** The current traces of a family over the command, with each measurement's window shaded. */
function VCTraces({ sweeps, measures, showTrue, pal, valueUnit, height }: { sweeps: VCSweep[]; measures: VCMeasure[]; showTrue: boolean; pal: ChartColors; valueUnit: string; height: number }) {
  const cu = useCurrentUnit();
  const n = Math.max(...sweeps.map((s) => s.iRec.length));
  const dt = sweeps[0].sampleMs;
  // the y range without the capacitive transients
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of sweeps) {
    const skip = new Set<number>();
    for (const t of s.starts.concat(s.starts.length ? [s.starts[s.starts.length - 1]] : [])) for (let j = Math.round(t / dt); j <= Math.round((t + CAP_MS) / dt); j++) skip.add(j);
    for (let j = 0; j < s.iRec.length; j++) {
      if (skip.has(j)) continue;
      lo = Math.min(lo, s.iRec[j], showTrue ? s.iTrue[j] : Infinity);
      hi = Math.max(hi, s.iRec[j], showTrue ? s.iTrue[j] : -Infinity);
    }
  }
  const u = vcUnit(Math.max(Math.abs(lo), Math.abs(hi)), cu);
  const pad = 0.06 * (hi - lo || 1);
  const yr: [number, number] = [(lo - pad) / u.div, (hi + pad) / u.div];
  const t = new Float64Array(n);
  for (let j = 0; j < n; j++) t[j] = j * dt;
  const order = sweeps.map((s, k) => [s.value, k] as const).sort((a, b) => a[0] - b[0]);
  const rank = new Array<number>(sweeps.length);
  order.forEach(([, k], i) => (rank[k] = i));
  // Old school (the dark chart palette) draws the family on a green-phosphor tube, as the oscilloscope does
  const tube = pal.name === "dark";
  const color = (k: number) => {
    const f = rank[k] / Math.max(1, sweeps.length - 1);
    if (!tube) return pal.ramp[Math.round(f * (pal.ramp.length - 1))];
    // dim to bright phosphor with the varied value
    return `rgba(${Math.round(60 + 140 * f)}, 255, ${Math.round(110 + 100 * f)}, ${(0.45 + 0.55 * f).toFixed(2)})`;
  };
  const pad0 = (a: Float32Array, div = 1) => {
    const out: (number | null)[] = new Array(n).fill(null);
    for (let j = 0; j < a.length; j++) out[j] = a[j] / div;
    return out;
  };

  const iData: uPlot.AlignedData = [t, ...(showTrue ? sweeps.map((s) => pad0(s.iTrue, u.div)) : []), ...sweeps.map((s) => pad0(s.iRec, u.div))] as uPlot.AlignedData;
  const vData: uPlot.AlignedData = [t, ...(showTrue ? sweeps.map((s) => pad0(s.vm)) : []), ...sweeps.map((s) => pad0(s.vCmd))] as uPlot.AlignedData;
  const series = (label: string): uPlot.Series[] => [
    {},
    ...(showTrue ? sweeps.map((_, k) => ({ label: `true ${k}`, stroke: tube ? "rgba(217, 211, 194, 0.45)" : pal.muted, width: 1, dash: [4, 3] })) : []),
    ...sweeps.map((s, k) => ({ label: `${label} ${s.value}`, stroke: color(k), width: 1.25 })),
  ];
  const windows = (u0: uPlot) => {
    const ctx = u0.ctx;
    ctx.save();
    measures.forEach((m, j) => {
      ctx.fillStyle = j === 0 ? pal.orange : pal.aqua;
      ctx.globalAlpha = 0.14;
      // a window that moves from sweep to sweep (a varied duration before it) is filled once over its whole span
      const spans = sweeps
        .map((s) => {
          const a = (s.starts[m.seg] ?? 0) + m.from;
          return [a, (s.starts[m.seg] ?? 0) + (m.kind === "cursor" ? m.from : Math.max(m.from, m.to))] as const;
        })
        .sort((p, q) => p[0] - q[0]);
      const merged: [number, number][] = [];
      for (const [a, b] of spans) {
        const last = merged[merged.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else merged.push([a, b]);
      }
      for (const [a, b] of merged) {
        const x0 = u0.valToPos(a, "x", true);
        const x1 = Math.max(x0 + 2, u0.valToPos(b, "x", true));
        if (!tube) {
          ctx.fillRect(x0, u0.bbox.top, x1 - x0, u0.bbox.height);
          continue;
        }
        // a Tektronix measurement gate: two dotted bars and the gate's name at the top of the screen
        const pr = devicePixelRatio || 1;
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = GATE[j];
        ctx.lineWidth = pr;
        ctx.setLineDash([2 * pr, 3 * pr]);
        ctx.beginPath();
        for (const x of [x0, x1]) {
          ctx.moveTo(Math.round(x) + 0.5, u0.bbox.top);
          ctx.lineTo(Math.round(x) + 0.5, u0.bbox.top + u0.bbox.height);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `${10 * pr}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = GATE[j];
        ctx.fillText(`M${j + 1}`, x0 + 3 * pr, u0.bbox.top + 2 * pr);
      }
    });
    ctx.restore();
  };
  // The command strip names its own levels instead of carrying tick labels: the holding potential, and each
  // segment's level, or its range across the family where it varies.
  let vLo = Infinity;
  let vHi = -Infinity;
  for (const s of sweeps) for (const v of s.vCmd) { vLo = Math.min(vLo, v); vHi = Math.max(vHi, v); }
  const vSpan = vHi - vLo || 20;
  const vr: [number, number] = [vLo - 0.12 * vSpan, vHi + 0.55 * vSpan];
  const levels = sweeps[0].starts.map((_, i) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of sweeps) {
      const a = s.starts[i];
      const b = s.starts[i + 1] ?? s.vCmd.length * dt;
      const v = s.vCmd[Math.min(s.vCmd.length - 1, Math.round((a + b) / 2 / dt))];
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    // the span every sweep shares, so a label clears the edges of a segment whose start varies
    let t0 = -Infinity;
    let t1 = Infinity;
    for (const s of sweeps) {
      t0 = Math.max(t0, s.starts[i]);
      t1 = Math.min(t1, s.starts[i + 1] ?? s.vCmd.length * dt);
    }
    return { t0, t1, lo, hi };
  });
  const hold = levels[0]?.lo ?? NaN;
  const mv = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v));
  const labelLevels = (u0: uPlot) => {
    const ctx = u0.ctx;
    const pr = devicePixelRatio || 1;
    ctx.save();
    ctx.font = `${11 * pr}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = tube ? "#d9d3c2" : pal.ink2;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left"; // uPlot leaves the canvas right-aligned after its axes
    const right = u0.bbox.left + u0.bbox.width;
    levels.forEach((l, i) => {
      const x0 = u0.valToPos(l.t0, "x", true) + 3 * pr;
      const x1 = Math.min(right, u0.valToPos(l.t1, "x", true));
      const level = l.lo === l.hi ? mv(l.lo) : `${mv(l.lo)} to ${mv(l.hi)}`;
      // the first segment sits at the holding potential in every protocol here; the gutter tick names it when this does not fit
      const tries = i === 0 ? [`hold ${level} mV`, `hold ${level}`] : [`${level} mV`, level];
      const text = tries.find((t) => ctx.measureText(t).width <= x1 - x0 - 2 * pr);
      if (!text || x1 <= x0) return;
      ctx.fillText(text, x0, u0.valToPos(l.hi, "y", true) - 3 * pr);
    });
    ctx.restore();
  };
  // Both plots share one y-axis width, sized to their tick labels, so their time axes line up.
  const chars = Math.max(4, ...yr.map((y) => String(Math.round(y)).length + 1));
  const ySize = Math.round(chars * 6.6 + 10);
  const ink = tube ? "#d9d3c2" : pal.ink2;
  const grid = tube ? "rgba(110, 255, 140, 0.16)" : pal.grid;
  const yAxis = (label: string): uPlot.Axis => ({ ...axisOpts(pal, label, ySize), stroke: ink, grid: { stroke: grid, width: 1 }, labelSize: 14, labelGap: 0, gap: 3 });
  // the current plot has no time labels of its own: the command strip below carries the time axis
  const xBare: uPlot.Axis = { ...axisOpts(pal, "", 4), grid: { stroke: grid, width: 1 }, ticks: { show: false }, values: () => [], labelSize: 0 };
  const xTime: uPlot.Axis = { ...axisOpts(pal, "time (ms)", 18), stroke: ink, grid: { stroke: grid, width: 1 }, labelSize: 16, labelGap: 0, gap: 2 };
  const CMD_H = 64;
  const common = (w: number, h: number, axes: uPlot.Axis[], hooks?: uPlot.Hooks.Arrays): uPlot.Options => ({
    width: w,
    height: h,
    padding: [6, 8, 0, 0],
    legend: { show: false },
    cursor: { drag: { x: true, y: false } },
    scales: { x: { time: false } },
    axes,
    series: [],
    hooks,
  });
  // In the tube, a readout under the graticule as a Tektronix prints its measurements: each one's extreme over
  // the family, and the sweep it came from.
  const readout = tube
    ? measures.map((m, j) => {
        let best: VCPoint | null = null;
        for (const s of sweeps) {
          const p = measureSweep(s, m);
          const better = !best || (m.kind === "peakIn" ? p.i < best.i : m.kind === "peakOut" ? p.i > best.i : Math.abs(p.i) > Math.abs(best.i));
          if (better) best = p;
        }
        if (!best) return "";
        const name = { peakIn: "Min", peakOut: "Max", mean: "Mean", cursor: "Crsr" }[m.kind];
        const v = best.value;
        return `M${j + 1} ${name} ${(best.i / u.div).toFixed(Math.abs(best.i / u.div) < 10 ? 2 : 1).replace("-", "−")}${u.unit} @${valueUnit === "mV" && v > 0 ? "+" : ""}${String(+v.toFixed(1)).replace("-", "−")}${valueUnit}`;
      })
    : [];
  return (
    <div className={"vc-plots" + (tube ? " vc-tube" : "")}>
      <Plot className="vc-i" deps={[pal, showTrue, sweeps.length, u.unit, JSON.stringify(measures), yr[0], yr[1], height]} data={iData}
        options={(w) => ({ ...common(w, Math.max(160, height - CMD_H - 34), [xBare, yAxis(`current (${u.unit})`)], { draw: [windows] }), series: series("I"), scales: { x: { time: false }, y: { range: yr } } })} />
      <Plot className="vc-v" deps={[pal, showTrue, sweeps.length, ySize, vr[0], vr[1], JSON.stringify(levels)]} data={vData}
        options={(w) => ({ ...common(w, CMD_H + 34, [xTime, { ...yAxis("command"), grid: { show: false }, splits: () => [hold], values: () => [mv(hold)] }], { draw: [labelLevels] }), series: series("V"), scales: { x: { time: false }, y: { range: vr } } })} />
      {tube && (
        <div className="tek-readout" aria-label="Measurement readout">
          {readout.map((r, j) => <span key={j} style={{ color: GATE[j] }}>{r}</span>)}
        </div>
      )}
    </div>
  );
}
