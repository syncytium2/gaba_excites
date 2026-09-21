import { useEffect, useMemo, useRef, useState } from "react";
import type uPlot from "uplot";
import { PUBLISHED_RS, type CellParams } from "./core/cell.ts";
import { DEFAULT_ELECTRODE, type Electrode, type Sweep } from "./core/simulate.ts";
import type { FamilySummary } from "./core/analysis.ts";
import { PRESETS, toProtocol, MAX_SWEEPS, type ProtocolForm } from "./core/protocol.ts";
import type { SynInput } from "./core/synapses.ts";
import type { CellInfo, Request, Response } from "./worker.ts";
import { NumField } from "./ui/NumField.tsx";
import { Plot } from "./ui/Plot.tsx";
import { PhasePlot } from "./ui/PhasePlot.tsx";
import { AQUA, AXIS, BLUE, GRID, INK2, MUTED, ORANGE, rampColor } from "./ui/palette.ts";
import { BORN, UPDATED, VERSION, fmtStamp } from "./version.ts";

interface Result {
  sweeps: Sweep[];
  summary: FamilySummary;
  cell: CellInfo;
  ms: number;
  protocol: ReturnType<typeof toProtocol>;
}

interface Pin {
  label: string;
  points: { amp: number; rate: number }[];
}

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

export function App() {
  const [cell, setCell] = useState<CellParams>(PUBLISHED_RS);
  const [ihold, setIhold] = useState(0);
  const [electrode, setElectrode] = useState<Electrode>(DEFAULT_ELECTRODE);
  const [presetId, setPresetId] = useState("fi");
  const preset0 = PRESETS[0];
  const [form, setForm] = useState<ProtocolForm>(preset0.protocol);
  const [glu, setGlu] = useState<SynInput>(preset0.glu);
  const [gaba, setGaba] = useState<SynInput>(preset0.gaba);
  const [seed, setSeed] = useState(1);
  const [showVm, setShowVm] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refined, setRefined] = useState<{ value: number; tol: number; key: string } | null>(null);

  const protocol = useMemo(() => toProtocol(form), [form]);

  // ------------------------------------------------------------ worker
  const worker = useRef<Worker | null>(null);
  const lastId = useRef(0);
  const pendingProto = useRef(protocol);
  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<Response>) => {
      const r = ev.data;
      if (r.id !== lastId.current && r.kind === "run") return; // stale
      if (r.kind === "run") {
        setResult({ sweeps: r.sweeps, summary: r.summary, cell: r.cell, ms: r.ms, protocol: pendingProto.current });
        setBusy(false);
        setError(null);
      } else if (r.kind === "rheobase") {
        setRefined((prev) => (prev ? { ...prev, value: r.rheobase, tol: r.tolerance } : prev));
      } else {
        setError(r.message);
        setBusy(false);
      }
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  const runKey = JSON.stringify({ cell, ihold, electrode, protocol, glu, gaba, seed });
  useEffect(() => {
    if (protocol.amps.length === 0) return;
    setBusy(true);
    const h = setTimeout(() => {
      const id = ++lastId.current;
      pendingProto.current = protocol;
      const msg: Request = { kind: "run", id, cell, inputs: { ihold, electrode, glu, gaba }, protocol, seed };
      worker.current?.postMessage(msg);
    }, 90);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  const refineRheobase = () => {
    if (!result) return;
    const s = result.summary;
    const byAmp = [...s.stats].sort((a, b) => a.amp - b.amp);
    const hi = s.rheobase;
    const below = byAmp.filter((x) => x.amp < hi && x.nInStep === 0);
    const lo = below.length ? below[below.length - 1].amp : Math.min(0, hi - 100);
    setRefined({ value: NaN, tol: NaN, key: runKey });
    const msg: Request = { kind: "rheobase", id: lastId.current, cell, inputs: { ihold, electrode, glu, gaba }, protocol, seed, lo, hi };
    worker.current?.postMessage(msg);
  };

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setForm(p.protocol);
    setGlu(p.glu);
    setGaba(p.gaba);
    setSelected(null);
  };

  // ------------------------------------------------------------ derived
  const sweeps = result?.sweeps ?? [];
  const summary = result?.summary;
  const rank = useMemo(() => {
    const order = sweeps.map((s, k) => [s.amp, k] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(sweeps.length);
    order.forEach(([, k], i) => (r[k] = i));
    return r;
  }, [sweeps]);
  const sel = selected !== null && selected < sweeps.length ? selected : defaultSelection(summary);
  const synOn = glu.enabled || gaba.enabled;
  const tauM = (cell.rin * cell.cm) / 1000;
  const preset = PRESETS.find((p) => p.id === presetId);
  const refinedValid = refined && refined.key === runKey ? refined : null;

  const pinCurrent = () => {
    if (!summary) return;
    const label = `Pin ${pins.length + 1}: Rin ${fmt(cell.rin, 0)} MΩ, Cm ${fmt(cell.cm, 0)} pF` +
      (gaba.enabled ? `, GABA ${gaba.erev} mV` : "") + (glu.enabled ? ", glu on" : "") + (ihold ? `, Ihold ${ihold} pA` : "");
    setPins([...pins, { label, points: summary.stats.map((s) => ({ amp: s.amp, rate: s.meanRate })).sort((a, b) => a.amp - b.amp) }].slice(-4));
  };

  const downloadCsv = () => {
    if (!summary || !result) return;
    const head = [
      `# gaba_excites ${VERSION}`,
      `# Rin ${cell.rin} MOhm, Cm ${cell.cm} pF, Ihold ${ihold} pA, Rs ${electrode.rs} MOhm, Cp ${electrode.cp} pF, bridge ${electrode.bridge * 100}%`,
      `# step ${protocol.stepStart}-${protocol.stepStart + protocol.stepDur} ms of ${protocol.sweepMs} ms`,
      `# glutamate ${glu.enabled ? `${glu.rate} Hz ${glu.gPeak} nS rise ${glu.tauRise} decay ${glu.tauDecay} ms E ${glu.erev} mV ${glu.pattern}` : "off"}`,
      `# GABA ${gaba.enabled ? `${gaba.rate} Hz ${gaba.gPeak} nS rise ${gaba.tauRise} decay ${gaba.tauDecay} ms E ${gaba.erev} mV ${gaba.pattern}` : "off"}`,
      `# seed ${seed}; measurements on Vm`,
      "step_pA,spikes_in_step,mean_rate_Hz,initial_rate_Hz,final_rate_Hz,latency_ms,v_baseline_mV,v_steady_mV",
    ];
    const rows = [...summary.stats]
      .sort((a, b) => a.amp - b.amp)
      .map((s) => [s.amp, s.nInStep, s.meanRate, s.initialRate, s.finalRate, s.latency, s.vBaseline, s.vSteady].map((v) => (Number.isFinite(v) ? +(+v).toFixed(4) : "")).join(","));
    const blob = new Blob([[...head, ...rows].join("\n") + "\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gaba_excites_fi.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ------------------------------------------------------------ render
  return (
    <div className="page">
      <header>
        <h1>
          gaba_excites
          <span className="stamp" title={`Born ${BORN} · last commit ${UPDATED}`}>
            v{VERSION} · born {fmtStamp(BORN)}
          </span>
        </h1>
        <div className="tagline">Current-clamp excitability, simulated in your browser</div>
        <p className="privacy">
          A cortical pyramidal cell (Pospischil et al. 2008) · runs entirely on your machine, nothing is sent anywhere ·{" "}
          <a href="/methods">Methods &amp; model</a> · <a href="https://github.com/syncytium2/gaba_excites">source</a>
        </p>
      </header>

      <div className="layout">
        <aside className="tools">
          <section className="panel">
            <h2>Cell</h2>
            <NumField label="Rin" unit="MΩ" value={cell.rin} min={10} max={600} step={1} slider digits={1}
              onChange={(rin) => setCell({ ...cell, rin })} />
            <NumField label="Cm" unit="pF" value={cell.cm} min={20} max={600} step={1} slider digits={1}
              onChange={(cm) => setCell({ ...cell, cm })} />
            <NumField label="Ihold" unit="pA" value={ihold} min={-500} max={1000} step={5} slider
              onChange={setIhold} />
            <div className="derived">
              <div>τm = Rin·Cm = <b>{fmt(tauM, 1)} ms</b></div>
              {result && (
                <>
                  <div>leak gL = {fmt(result.cell.gLeak, 2)} nS · rest {fmt(result.cell.vRest, 1)} mV</div>
                  <div>area {Math.round(result.cell.areaUm2).toLocaleString()} µm² · Rin at Ihold {fmt(result.cell.rinAtHold, 1)} MΩ</div>
                </>
              )}
              {result?.cell.rinClamped && (
                <div className="warn">This Rin is out of reach: the channels open at rest alone conduct more than 1/Rin. Using the smallest possible leak.</div>
              )}
            </div>
            <button className="linkish" onClick={() => { setCell(PUBLISHED_RS); setIhold(0); }}>
              Reset to the published cell
            </button>
          </section>

          <section className="panel">
            <h2>Electrode</h2>
            <NumField label="Rs" unit="MΩ" value={electrode.rs} min={0} max={100} step={1} slider
              onChange={(rs) => setElectrode({ ...electrode, rs })} />
            <NumField label="Bridge balance" unit="%" value={Math.round(electrode.bridge * 100)} min={0} max={100} step={5} slider
              onChange={(b) => setElectrode({ ...electrode, bridge: b / 100 })} />
            <NumField label="Pipette C" unit="pF" value={electrode.cp} min={0} max={20} step={0.5} slider
              hint="Left over after capacitance neutralization. With 0 pF, Rs only offsets the record."
              onChange={(cp) => setElectrode({ ...electrode, cp })} />
          </section>

          <section className="panel">
            <h2>Protocol</h2>
            <label className="select">
              <span>Preset</span>
              <select value={presetId} onChange={(e) => applyPreset(e.target.value)}>
                {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                {!preset && <option value={presetId}>Custom</option>}
              </select>
            </label>
            {preset && <p className="note">{preset.note}</p>}
            <div className="seg" role="radiogroup" aria-label="How to specify the steps">
              {(["family", "list"] as const).map((m) => (
                <button key={m} role="radio" aria-checked={form.mode === m} className={form.mode === m ? "on" : ""}
                  onClick={() => { setForm({ ...form, mode: m }); setPresetId("custom"); }}>
                  {m === "family" ? "Family" : "List"}
                </button>
              ))}
            </div>
            {form.mode === "family" ? (
              <div className="row3">
                <NumField label="First" unit="pA" value={form.first} step={10} onChange={(first) => { setForm({ ...form, first }); setPresetId("custom"); }} />
                <NumField label="Increment" unit="pA" value={form.delta} step={5} onChange={(delta) => { setForm({ ...form, delta }); setPresetId("custom"); }} />
                <NumField label="Sweeps" value={form.count} min={1} max={MAX_SWEEPS} step={1} onChange={(count) => { setForm({ ...form, count }); setPresetId("custom"); }} />
              </div>
            ) : (
              <label className="listfield">
                <span>Steps, pA (comma or space separated)</span>
                <textarea rows={2} value={form.list} onChange={(e) => { setForm({ ...form, list: e.target.value }); setPresetId("custom"); }} />
              </label>
            )}
            <div className="row3">
              <NumField label="Step at" unit="ms" value={form.stepStart} min={0} step={10} onChange={(stepStart) => { setForm({ ...form, stepStart }); setPresetId("custom"); }} />
              <NumField label="Duration" unit="ms" value={form.stepDur} min={0} step={50} onChange={(stepDur) => { setForm({ ...form, stepDur }); setPresetId("custom"); }} />
              <NumField label="Sweep" unit="ms" value={form.sweepMs} min={10} max={10000} step={100} onChange={(sweepMs) => { setForm({ ...form, sweepMs }); setPresetId("custom"); }} />
            </div>
            <div className="small">{protocol.amps.length} sweep{protocol.amps.length === 1 ? "" : "s"}: {protocol.amps.slice(0, 12).join(", ")}{protocol.amps.length > 12 ? ", …" : ""} pA</div>
          </section>

          <SynPanel title="Glutamate" color={ORANGE} syn={glu} erevEditable={false}
            onChange={(g) => { setGlu(g); setPresetId("custom"); }} />
          <SynPanel title="GABA" color={AQUA} syn={gaba} erevEditable
            onChange={(g) => { setGaba(g); setPresetId("custom"); }} />
          {synOn && (
            <section className="panel compact">
              <div className="seedrow">
                <span className="small">Barrage #{seed}: the same events whatever you change about the cell; each sweep gets its own</span>
                <button onClick={() => setSeed(seed + 1)}>New barrage</button>
              </div>
            </section>
          )}
        </aside>

        <main className="figures">
          <div className="status" aria-live="polite">
            {error ? <span className="warn">Simulation failed: {error}</span> : busy ? "simulating…" : result ? `${sweeps.length} sweeps simulated in ${Math.round(result.ms)} ms` : ""}
          </div>

          <Stats summary={summary} rinSet={cell.rin} refined={refinedValid} onRefine={refineRheobase} />

          {result && sweeps.length > 0 && (
            <>
              <figure className="card">
                <figcaption>
                  <span>Recorded voltage{showVm ? ", with true Vm of the selected sweep dashed" : ""}</span>
                  <label className="check"><input type="checkbox" checked={showVm} onChange={(e) => setShowVm(e.target.checked)} /> show true Vm</label>
                </figcaption>
                <TracePlots result={result} rank={rank} sel={sel} showVm={showVm} synOn={synOn} onSelect={setSelected} />
                <p className="legendline">
                  Sweeps shade light → dark with step amplitude; <span style={{ color: ORANGE }}>■</span> the selected sweep ({sweeps[sel]?.amp} pA). Hover to read values, click a trace to select it.
                  {synOn && <> Conductances are the selected sweep's: <span style={{ color: ORANGE }}>■</span> glutamate, <span style={{ color: AQUA }}>■</span> GABA.</>}
                </p>
              </figure>

              <div className="twoup">
                <figure className="card">
                  <figcaption>
                    <span>F–I curve</span>
                    <span className="btns">
                      <button onClick={pinCurrent} disabled={!summary}>Pin this curve</button>
                      {pins.length > 0 && <button className="linkish" onClick={() => setPins([])}>clear pins</button>}
                      <button className="linkish" onClick={downloadCsv}>CSV</button>
                    </span>
                  </figcaption>
                  <FIPlot summary={summary!} pins={pins} />
                  <p className="legendline">
                    Mean rate is spikes in the step ÷ its duration; initial rate is 1 / the first interspike interval.
                    {pins.map((p, i) => <span key={i} className="pinlabel"><br /><span className="dash">- -</span> {p.label}</span>)}
                  </p>
                </figure>
                <figure className="card">
                  <figcaption><span>Phase plot, {sweeps[sel]?.amp} pA</span></figcaption>
                  <PhasePlot vm={sweeps[sel].vm} dt={sweeps[sel].sampleMs} color={ORANGE} />
                </figure>
              </div>

              <SweepTable summary={summary!} sel={sel} onSelect={setSelected} />
            </>
          )}
        </main>
      </div>

      <footer>
        <p>
          Model: the regular-spiking pyramidal cell of Pospischil M, Toledo-Rodriguez M, Monier C, et al. (2008) Minimal Hodgkin–Huxley
          type models for different classes of cortical and thalamic neurons. <i>Biol Cybern</i> 99:427–441, ported from ModelDB 123623
          and checked spike-for-spike against NEURON. Measurements are taken on the true membrane potential, not on the recorded trace.
        </p>
        <p>
          By <a href="https://tonydefazio.com/">Tony DeFazio</a> · MIT licensed · <a href="https://github.com/syncytium2/gaba_excites">github.com/syncytium2/gaba_excites</a> ·
          born {fmtStamp(BORN)}, last commit {fmtStamp(UPDATED)}
        </p>
      </footer>
    </div>
  );
}

function defaultSelection(s?: FamilySummary): number {
  if (!s || s.stats.length === 0) return 0;
  // the rheobase sweep if there is one: that is where threshold lives
  const k = s.stats.findIndex((x) => x.amp === s.rheobase);
  return k >= 0 ? k : s.stats.length - 1;
}

// ------------------------------------------------------------------ synapses

function SynPanel({ title, color, syn, erevEditable, onChange }: {
  title: string; color: string; syn: SynInput; erevEditable: boolean; onChange: (s: SynInput) => void;
}) {
  return (
    <section className={"panel syn" + (syn.enabled ? "" : " off")}>
      <h2>
        <label className="check">
          <input type="checkbox" checked={syn.enabled} onChange={(e) => onChange({ ...syn, enabled: e.target.checked })} />
          <span className="swatch" style={{ background: color }} /> {title} PSCs
        </label>
      </h2>
      <div className="row2">
        <NumField label="Rate" unit="Hz" value={syn.rate} min={0} max={2000} step={10} disabled={!syn.enabled} onChange={(rate) => onChange({ ...syn, rate })} />
        <NumField label="Peak g" unit="nS" value={syn.gPeak} min={0} max={100} step={0.5} disabled={!syn.enabled} onChange={(gPeak) => onChange({ ...syn, gPeak })} />
        <NumField label="τ rise" unit="ms" value={syn.tauRise} min={0} max={50} step={0.1} disabled={!syn.enabled} onChange={(tauRise) => onChange({ ...syn, tauRise })} />
        <NumField label="τ decay" unit="ms" value={syn.tauDecay} min={0.1} max={500} step={0.5} disabled={!syn.enabled} onChange={(tauDecay) => onChange({ ...syn, tauDecay })} />
      </div>
      {erevEditable ? (
        <NumField label="E_GABA" unit="mV" value={syn.erev} min={-100} max={0} step={1} slider disabled={!syn.enabled}
          onChange={(erev) => onChange({ ...syn, erev })} />
      ) : (
        <div className="small">E_glu = {syn.erev} mV (AMPA-like, fixed)</div>
      )}
      <div className="seg small" role="radiogroup" aria-label={`${title} timing`}>
        {(["poisson", "regular"] as const).map((p) => (
          <button key={p} role="radio" aria-checked={syn.pattern === p} disabled={!syn.enabled} className={syn.pattern === p ? "on" : ""}
            onClick={() => onChange({ ...syn, pattern: p })}>
            {p === "poisson" ? "Poisson" : "Regular"}
          </button>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ stats

function Stats({ summary, rinSet, refined, onRefine }: {
  summary?: FamilySummary; rinSet: number; refined: { value: number; tol: number } | null; onRefine: () => void;
}) {
  const s = summary;
  return (
    <div className="stats">
      <Tile label="Rheobase" value={s ? fmt(s.rheobase, 0) : "—"} unit="pA"
        sub={refined ? (Number.isFinite(refined.value) ? `refined: ${fmt(refined.value, 0)} ± ${fmt(refined.tol, 0)} pA` : "refining…")
          : s && Number.isFinite(s.rheobase) ? <button className="linkish" onClick={onRefine}>refine to 1 pA</button> : "no step fired"} />
      <Tile label="Threshold" value={s ? fmt(s.threshold, 1) : "—"} unit="mV" sub="first spike, dV/dt ≥ 20 V/s" />
      <Tile label="AP peak · half-width" value={s ? `${fmt(s.apPeak, 0)} · ${fmt(s.apHalfWidth, 2)}` : "—"} unit="mV · ms" />
      <Tile label="Rin, measured" value={s ? fmt(s.rinMeasured, 1) : "—"} unit="MΩ"
        sub={s && Number.isFinite(s.rinMeasured) ? `set ${fmt(rinSet, 1)}; from steps ≤ 0 pA` : "needs two steps ≤ 0 pA"} />
      <Tile label="Holding Vm" value={s ? fmt(s.vHold, 1) : "—"} unit="mV" sub="before the step" />
      <Tile label="F–I gain" value={s ? fmt(s.fiGain, 0) : "—"} unit="Hz/nA" sub="slope over sweeps that fired" />
    </div>
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

// ------------------------------------------------------------------ traces

const SYNC = uPlotSyncKey();
function uPlotSyncKey() {
  return "t";
}

function axisOpts(label: string, size = 50): uPlot.Axis {
  return {
    label,
    stroke: INK2,
    size,
    labelSize: 18,
    font: "11px system-ui, -apple-system, sans-serif",
    labelFont: "12px system-ui, -apple-system, sans-serif",
    grid: { stroke: GRID, width: 1 },
    ticks: { stroke: AXIS, width: 1, size: 4 },
  };
}

function TracePlots({ result, rank, sel, showVm, synOn, onSelect }: {
  result: Result; rank: number[]; sel: number; showVm: boolean; synOn: boolean; onSelect: (k: number) => void;
}) {
  const sw = result.sweeps;
  const n = sw[0].vRec.length;
  const dt = sw[0].sampleMs;
  const t = useMemo(() => Float64Array.from({ length: n }, (_, i) => i * dt), [n, dt]);
  const colors = sw.map((_, k) => (k === sel ? ORANGE : rampColor(rank[k], sw.length)));
  // draw the selected sweep last so it sits on top
  const order = [...sw.keys()].filter((k) => k !== sel).concat(sel);

  const vData = useMemo<uPlot.AlignedData>(() => {
    const d: (Float32Array | Float64Array)[] = [t, ...order.map((k) => sw[k].vRec)];
    if (showVm) d.push(sw[sel].vm);
    return d as unknown as uPlot.AlignedData;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, sel, showVm, t]);

  const iData = useMemo<uPlot.AlignedData>(
    () => [t, ...order.map((k) => sw[k].iCmd)] as unknown as uPlot.AlignedData,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, sel, t],
  );
  const gData = useMemo<uPlot.AlignedData>(
    () => [t, sw[sel].gGlu, sw[sel].gGaba] as unknown as uPlot.AlignedData,
    [result, sel, t, sw],
  );

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const orderRef = useRef(order);
  orderRef.current = order;

  const base = (w: number, h: number, yLabel: string, series: uPlot.Series[], extra?: Partial<uPlot.Options>): uPlot.Options => ({
    width: w,
    height: h,
    legend: { show: false },
    cursor: { sync: { key: SYNC }, drag: { x: true, y: false }, focus: { prox: 12 } },
    focus: { alpha: 0.35 },
    scales: { x: { time: false } },
    axes: [axisOpts("", 30), axisOpts(yLabel, 56)],
    series: [{ label: "t (ms)" }, ...series],
    ...extra,
  });

  const vSeries: uPlot.Series[] = order.map((k) => ({
    label: `${sw[k].amp} pA`,
    stroke: colors[k],
    width: k === sel ? 2 : 1,
    value: (_u, v) => (v == null ? "—" : v.toFixed(1) + " mV"),
  }));
  if (showVm) vSeries.push({ label: "Vm", stroke: ORANGE, width: 1.25, dash: [4, 3] });

  // uPlot reports the series nearest the cursor through setSeries(…, {focus}).
  // Remember it, and make a click on the plot select that sweep.
  const focused = useRef<number | null>(null);
  const focusHook = (_u: uPlot, idx: number | null, o: uPlot.Series) => {
    if ((o as { focus?: boolean }).focus !== undefined) focused.current = idx;
  };
  const clickHook = (u: uPlot) => {
    u.over.addEventListener("click", () => {
      const idx = focused.current;
      const k = idx != null && idx > 0 ? orderRef.current[idx - 1] : undefined;
      if (k !== undefined) onSelectRef.current(k);
    });
  };

  const structKey = `${sw.length}|${sel}|${showVm}|${colors.join()}|${n}`;
  return (
    <div className="traces">
      <Plot className="plot" data={vData} deps={[structKey]}
        options={(w) => base(w, 320, "V recorded (mV)", vSeries, { hooks: { init: [clickHook], setSeries: [focusHook] } })} />
      <Plot className="plot" data={iData} deps={[structKey]}
        options={(w) => base(w, 110, "I (pA)", order.map((k) => ({ label: `${sw[k].amp} pA`, stroke: colors[k], width: k === sel ? 2 : 1 })))} />
      {synOn && (
        <Plot className="plot" data={gData} deps={[structKey, synOn]}
          options={(w) => base(w, 110, "g syn (nS)", [
            { label: "g glutamate", stroke: ORANGE, width: 1 },
            { label: "g GABA", stroke: AQUA, width: 1 },
          ], { axes: [axisOpts("time (ms)", 40), axisOpts("g syn (nS)", 56)] })} />
      )}
      {!synOn && <div className="xlabel">time (ms)</div>}
    </div>
  );
}

// ------------------------------------------------------------------ F–I

function FIPlot({ summary, pins }: { summary: FamilySummary; pins: Pin[] }) {
  const stats = [...summary.stats].sort((a, b) => a.amp - b.amp);
  const xs = Array.from(new Set([...stats.map((s) => s.amp), ...pins.flatMap((p) => p.points.map((q) => q.amp))])).sort((a, b) => a - b);
  const at = (pts: { amp: number; v: number }[]) => xs.map((x) => pts.find((p) => p.amp === x)?.v ?? null);
  const data = [
    xs,
    at(stats.map((s) => ({ amp: s.amp, v: s.meanRate }))),
    at(stats.map((s) => ({ amp: s.amp, v: Number.isFinite(s.initialRate) ? s.initialRate : NaN })).filter((p) => Number.isFinite(p.v))),
    ...pins.map((p) => at(p.points.map((q) => ({ amp: q.amp, v: q.rate })))),
  ] as unknown as uPlot.AlignedData;

  const series: uPlot.Series[] = [
    { label: "I (pA)" },
    { label: "mean rate", stroke: BLUE, width: 2, points: { show: true, size: 8, fill: BLUE, stroke: "#fcfcfb", width: 2 }, spanGaps: true, value: (_u, v) => (v == null ? "—" : v.toFixed(1) + " Hz") },
    { label: "initial rate", stroke: ORANGE, width: 1.5, dash: [5, 3], points: { show: true, size: 8, fill: ORANGE, stroke: "#fcfcfb", width: 2 }, spanGaps: true, value: (_u, v) => (v == null ? "—" : v.toFixed(1) + " Hz") },
    ...pins.map((_p, i): uPlot.Series => ({ label: `pin ${i + 1}`, stroke: MUTED, width: 1.5, dash: [3, 3], spanGaps: true, points: { show: true, size: 6, fill: MUTED } })),
  ];
  const key = `${pins.length}|${xs.join()}`;
  return (
    <Plot className="plot" data={data} deps={[key]}
      options={(w) => ({
        width: w,
        height: 260,
        legend: { show: true, live: true },
        cursor: { drag: { x: false, y: false } },
        scales: { x: { time: false }, y: { range: (_u, _lo, hi) => [0, Math.max(10, hi * 1.08)] } },
        axes: [axisOpts("step current (pA)", 40), axisOpts("firing rate (Hz)", 50)],
        series,
      })} />
  );
}

// ------------------------------------------------------------------ table

function SweepTable({ summary, sel, onSelect }: { summary: FamilySummary; sel: number; onSelect: (k: number) => void }) {
  return (
    <figure className="card">
      <figcaption><span>Per sweep (click a row to select it)</span></figcaption>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Step (pA)</th><th>Spikes</th><th>Mean (Hz)</th><th>Initial (Hz)</th><th>Final (Hz)</th>
              <th>Latency (ms)</th><th>V before (mV)</th><th>V steady (mV)</th>
            </tr>
          </thead>
          <tbody>
            {summary.stats.map((s, k) => (
              <tr key={k} className={k === sel ? "sel" : ""} onClick={() => onSelect(k)}>
                <td>{s.amp}</td><td>{s.nInStep}</td><td>{fmt(s.meanRate)}</td><td>{fmt(s.initialRate)}</td><td>{fmt(s.finalRate)}</td>
                <td>{fmt(s.latency)}</td><td>{fmt(s.vBaseline)}</td><td>{fmt(s.vSteady)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
