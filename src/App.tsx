import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type uPlot from "uplot";
import { buildCell, cellRinAt, publishedParams, type CellParams } from "./core/cell.ts";
import { MODELS, MODEL_LIST, type ModelId } from "./core/models.ts";
import { DEFAULT_NOISE, type NoiseParams } from "./core/noise.ts";
import { DEFAULT_ELECTRODE, type Electrode, type Sweep } from "./core/simulate.ts";
import type { FamilySummary } from "./core/analysis.ts";
import { PRESETS, presetsFor, toProtocol, MAX_SWEEPS, SCOPE_PULSE, type ProtocolForm } from "./core/protocol.ts";
import type { SynInput } from "./core/synapses.ts";
import type { Pulse } from "./core/stream.ts";
import type { CellInfo, Request, Response } from "./worker.ts";
import { NumField } from "./ui/NumField.tsx";
import { Plot } from "./ui/Plot.tsx";
import { PhasePlot } from "./ui/PhasePlot.tsx";
import { Panel, usePanels } from "./ui/Panel.tsx";
import { Tip } from "./ui/Tip.tsx";
import { ScopeMode } from "./ui/ScopeMode.tsx";
import { Siren } from "./ui/Siren.tsx";
import { KnobContext } from "./ui/Knob.tsx";
import { describe as describeTrip, ExtremeWatch, limitsFor, type ExtremeKind } from "./core/extremes.ts";
import { AQUA, AXIS, BLUE, GRID, INK2, MUTED, ORANGE, rampColor } from "./ui/palette.ts";
import { BORN, UPDATED, VERSION, fmtStamp } from "./version.ts";
import { Notebook } from "./ui/Notebook.tsx";
import { Tour } from "./ui/Tour.tsx";
import { AmpChoice, AmpDial, AmpFront, AmpRow, AmpSection, AmpSlot } from "./ui/AmpFront.tsx";
import { TOUR, tourInputs, type TourControl, type TourSettings } from "./core/tour.ts";

// The app opens on the tour's first part: the GnRH cell in the oscilloscope,
// held near −61 mV, with GABA PSCs on (the owner, 2026-10-19).
const OPENING = TOUR[0].settings;
const opening = tourInputs(OPENING);
import type { RunSettings } from "./core/report.ts";

interface Result {
  sweeps: Sweep[];
  summary: FamilySummary;
  cell: CellInfo;
  ms: number;
  protocol: ReturnType<typeof toProtocol>;
  /** the settings that produced this result, for the notebook */
  settings: RunSettings;
}

interface Pin {
  label: string;
  points: { amp: number; rate: number }[];
}

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

export function App() {
  const [cell, setCell] = useState<CellParams>(opening.cell);
  const [ihold, setIhold] = useState(opening.ihold);
  const [electrode, setElectrode] = useState<Electrode>(DEFAULT_ELECTRODE);
  const [presetId, setPresetId] = useState(opening.presetId);
  const [form, setForm] = useState<ProtocolForm>(opening.form);
  const [glu, setGlu] = useState<SynInput>(opening.glu);
  const [gaba, setGaba] = useState<SynInput>(opening.gaba);
  const [seed, setSeed] = useState(1);
  // Recording noise on by default at a typical whole-cell level: it touches the
  // trace only, so no measurement moves. Membrane noise starts off.
  const [noise, setNoise] = useState<NoiseParams>({ ...DEFAULT_NOISE, recSigma: 0.2 });
  const [showVm, setShowVm] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refined, setRefined] = useState<{ value: number; tol: number; key: string } | null>(null);
  // Playback: sweeps drawn one at a time, in amplitude order, 0.5 s apart.
  // null when not playing; otherwise how many are shown so far.
  const [play, setPlay] = useState<number | null>(null);
  const playAfterRun = useRef(false);
  // bumped to re-run an unchanged protocol, so a tour part can always play it
  const [runNonce, setRunNonce] = useState(0);
  // Step protocol, or the oscilloscope: the cell running continuously, every control live
  const [mode, setMode] = useState<"steps" | "scope">(OPENING.mode);
  const [pulse, setPulse] = useState<Pulse>(SCOPE_PULSE[OPENING.model]);
  // Old school: the oscilloscope as a green-phosphor instrument, with knobs and meters.
  // Remembered in this browser as a convenience only; every access is guarded.
  const [oldSchoolPref, setOldSchoolPref] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gaba_excites.oldschool") === "1";
    } catch {
      return false;
    }
  });
  const setOldSchool = (on: boolean) => {
    setOldSchoolPref(on);
    try {
      localStorage.setItem("gaba_excites.oldschool", on ? "1" : "0");
    } catch {
      /* storage unavailable: still works for this visit */
    }
  };
  const oldSchool = mode === "scope" && oldSchoolPref;

  const protocol = useMemo(() => toProtocol(form), [form]);
  // The left panels collapse. The ones you reach for first start open.
  const panels = usePanels({ tour: true });

  // ------------------------------------------------------------ worker
  const worker = useRef<Worker | null>(null);
  const lastId = useRef(0);
  const pendingProto = useRef(protocol);
  const pendingSettings = useRef<RunSettings | null>(null);
  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<Response>) => {
      const r = ev.data;
      if (r.id !== lastId.current && r.kind === "run") return; // stale
      if (r.kind === "run") {
        setResult({ sweeps: r.sweeps, summary: r.summary, cell: r.cell, ms: r.ms, protocol: pendingProto.current, settings: pendingSettings.current! });
        setBusy(false);
        if (playAfterRun.current) {
          playAfterRun.current = false;
          setPlay(1);
        } else setPlay(null);
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

  const runKey = JSON.stringify({ cell, ihold, electrode, protocol, glu, gaba, seed, noise, runNonce });
  useEffect(() => {
    if (mode === "scope" || protocol.amps.length === 0) return;
    setBusy(true);
    const h = setTimeout(() => {
      const id = ++lastId.current;
      pendingProto.current = protocol;
      pendingSettings.current = { cell, ihold, electrode, protocol, glu, gaba, noise, seed, preset: PRESETS.find((p) => p.id === presetId)?.label };
      const msg: Request = { kind: "run", id, cell, inputs: { ihold, electrode, glu, gaba, noise }, protocol, seed };
      worker.current?.postMessage(msg);
    }, 90);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, mode]);

  const refineRheobase = () => {
    if (!result) return;
    const s = result.summary;
    const byAmp = [...s.stats].sort((a, b) => a.amp - b.amp);
    const hi = s.rheobase;
    const below = byAmp.filter((x) => x.amp < hi && x.nInStep === 0);
    const lo = below.length ? below[below.length - 1].amp : Math.min(0, hi - 100);
    setRefined({ value: NaN, tol: NaN, key: runKey });
    const msg: Request = { kind: "rheobase", id: lastId.current, cell, inputs: { ihold, electrode, glu, gaba, noise }, protocol, seed, lo, hi, tol: model.rheobaseTol };
    worker.current?.postMessage(msg);
  };

  const switchModel = (id: ModelId) => {
    const m = MODELS[id];
    const p = presetsFor(id)[0];
    setCell(publishedParams(id));
    setIhold(m.defaults.ihold);
    setPulse({ ...SCOPE_PULSE[id], enabled: pulse.enabled }); // the pulse that suits this cell, still on if it was
    setPresetId(p.id);
    setForm(p.protocol);
    setGlu(p.glu);
    setGaba(p.gaba);
    setNoise({ ...noise, memSigma: 0 }); // membrane noise is in pA, and the right scale differs by ~10× between cells
    setPins([]);
    setSelected(null);
    setRefined(null);
  };

  // The published cell at its default holding current, with both PSC generators
  // back to this cell's defaults: off, with its own kinetics and E_GABA.
  const resetCell = () => {
    const t = tourInputs({ model: cell.model, mode, ihold: MODELS[cell.model].defaults.ihold });
    setCell(t.cell);
    setIhold(t.ihold);
    setGlu(t.glu);
    setGaba(t.gaba);
    setPresetId("custom");
  };

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setForm(p.protocol);
    setGlu(p.glu);
    setGaba(p.gaba);
    setSelected(null);
  };

  // A tour part sets the controls to exactly what tour.test.ts measured.
  const applyTour = (s: TourSettings) => {
    const t = tourInputs(s);
    if (t.cell.model !== cell.model) setPins([]);
    setCell(t.cell);
    setIhold(t.ihold);
    setPresetId(t.presetId);
    setForm(t.form);
    setGlu(t.glu);
    setGaba(t.gaba);
    setPulse({ ...SCOPE_PULSE[s.model], enabled: false });
    setNoise({ ...noise, memSigma: 0 });
    setMode(s.mode);
    setSelected(null);
    setRefined(null);
    if (s.play) {
      playAfterRun.current = true;
      setRunNonce((n) => n + 1);
    }
  };

  useEffect(() => {
    if (play === null || !result) return;
    if (play >= result.sweeps.length) {
      const h = setTimeout(() => setPlay(null), 500);
      return () => clearTimeout(h);
    }
    const h = setTimeout(() => setPlay(play + 1), 500);
    return () => clearTimeout(h);
  }, [play, result]);

  // ------------------------------------------------------------ derived
  const playing = play !== null && result !== null;
  const shown = useMemo(() => {
    if (!result || play === null) return result;
    const order = [...result.sweeps].sort((a, b) => a.amp - b.amp);
    return { ...result, sweeps: order.slice(0, Math.max(1, play)) };
  }, [result, play]);
  const playRanges = useMemo(() => {
    if (!result) return undefined;
    let vLo = Infinity, vHi = -Infinity, iLo = Infinity, iHi = -Infinity;
    for (const s of result.sweeps) {
      for (const v of s.vRec) { if (v < vLo) vLo = v; if (v > vHi) vHi = v; }
      for (const i of s.iCmd) { if (i < iLo) iLo = i; if (i > iHi) iHi = i; }
    }
    const pad = (lo: number, hi: number): [number, number] => [lo - 0.05 * (hi - lo || 1), hi + 0.05 * (hi - lo || 1)];
    return { v: pad(vLo, vHi), i: pad(iLo, iHi) };
  }, [result]);
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
  const model = MODELS[cell.model];
  const presets = presetsFor(cell.model);
  // Rin is measured from the cell the leak and channels make, so τm is too.
  // Computed here rather than taken from the last run, so it is right in either mode.
  const built = useMemo(() => {
    const c = buildCell(cell);
    return { cell: c, vRest: c.vRest, rinRest: c.rinRest, rinAtHold: cellRinAt(c, ihold), areaUm2: c.areaUm2 };
  }, [cell, ihold]);
  const limits = useMemo(() => limitsFor(built.cell, MODELS[cell.model], [glu, gaba]), [built, cell.model, glu, gaba]);
  // The siren, step mode: any sweep of the last run driven past a real cell (src/core/extremes.ts)
  const stepReasons = useMemo(() => {
    if (!result) return [];
    const seen = new Map<ExtremeKind, { text: string; amps: number[] }>();
    for (const s of result.sweeps) {
      const w = new ExtremeWatch(limits);
      w.feed(s.vm, s.iCmd, 0, s.sampleMs);
      for (const trip of w.trips.values()) {
        const e = seen.get(trip.kind) ?? { text: describeTrip(trip, limits), amps: [] };
        e.amps.push(s.amp);
        seen.set(trip.kind, e);
      }
    }
    return [...seen.values()].map((e) => `${e.text} (step${e.amps.length > 1 ? "s" : ""} ${e.amps.join(", ")} pA)`);
  }, [result, limits]);
  const [scopeReasons, setScopeReasons] = useState<string[]>([]);
  const [readoutSlot, setReadoutSlot] = useState<HTMLElement | null>(null);
  // One screen height for both modes, so the amplifier below the screen stays in
  // place when the mode switches. It depends on the window alone, with a fixed
  // allowance for the amplifier: a mode whose amplifier is taller (its stimulus
  // row wraps on a narrow window) extends further down, and its top never moves.
  const AMP_ALLOWANCE = 400;
  const [screenH, setScreenH] = useState(460);
  useLayoutEffect(() => {
    const fig = document.querySelector(".figures");
    const bar = fig?.querySelector(".modebar");
    if (!fig || !bar) return;
    const fit = () => {
      const top = fig.getBoundingClientRect().top + window.scrollY;
      const h = window.innerHeight - top - bar.getBoundingClientRect().height - AMP_ALLOWANCE - 2 * 14;
      setScreenH(Math.round(Math.max(380, Math.min(560, h))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const rinRest = built.rinRest;
  const tauM = (rinRest * cell.cm) / 1000;
  const preset = presets.find((p) => p.id === presetId);
  const refinedValid = refined && refined.key === runKey ? refined : null;

  const pinCurrent = () => {
    if (!summary) return;
    const label = `Pin ${pins.length + 1}: ${model.short}, gL ${fmt(cell.gLeak, 2)} nS (Rin ${fmt(rinRest, 0)} MΩ), Cm ${fmt(cell.cm, 0)} pF` +
      (gaba.enabled ? `, GABA ${gaba.erev} mV` : "") + (glu.enabled ? ", glu on" : "") + (ihold ? `, Ihold ${ihold} pA` : "") + (noise.memSigma ? `, noise ${noise.memSigma} pA` : "");
    setPins([...pins, { label, points: summary.stats.map((s) => ({ amp: s.amp, rate: s.meanRate })).sort((a, b) => a.amp - b.amp) }].slice(-4));
  };

  const downloadCsv = () => {
    if (!summary || !result) return;
    const head = [
      `# gaba_excites ${VERSION}; model: ${model.label} (${model.citation})`,
      `# leak ${cell.gLeak} nS, Rin at rest ${fmt(rinRest, 2)} MOhm (measured), Cm ${cell.cm} pF, Ihold ${ihold} pA, Rs ${electrode.rs} MOhm, Cp ${electrode.cp} pF, bridge ${electrode.bridge * 100}%`,
      `# step ${protocol.stepStart}-${protocol.stepStart + protocol.stepDur} ms of ${protocol.sweepMs} ms`,
      `# glutamate ${glu.enabled ? `${glu.rate} Hz ${glu.gPeak} nS rise ${glu.tauRise} decay ${glu.tauDecay} ms E ${glu.erev} mV ${glu.pattern}` : "off"}`,
      `# GABA ${gaba.enabled ? `${gaba.rate} Hz ${gaba.gPeak} nS rise ${gaba.tauRise} decay ${gaba.tauDecay} ms E ${gaba.erev} mV ${gaba.pattern}` : "off"}`,
      `# noise: recording ${noise.recSigma} mV RMS at ${noise.recBandwidth} kHz, hum ${noise.humAmp} mV at ${noise.humHz} Hz; membrane ${noise.memSigma} pA SD, tau ${noise.memTau} ms`,
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

  // The controls a tour part shows in its own card: the same state as the amplifier.
  const tourControl = (c: TourControl) => {
    const r = model.ranges;
    switch (c) {
      case "ihold":
        return <NumField label="Ihold (holding current)" unit="pA" value={ihold} min={r.ihold.min} max={r.ihold.max} step={0.5} slider digits={1} onChange={setIhold} />;
      case "gLeak":
        return <NumField label="gL (leak)" unit="nS" value={cell.gLeak} min={r.gLeak.min} max={r.gLeak.max} step={r.gLeak.step} slider digits={2} onChange={(gLeak) => setCell({ ...cell, gLeak })} />;
      case "cm":
        return <NumField label="Cm (cell size)" unit="pF" value={cell.cm} min={r.cm.min} max={r.cm.max} step={r.cm.step} slider digits={1} onChange={(cm) => setCell({ ...cell, cm })} />;
      case "eGaba":
        return <NumField label="E_GABA" unit="mV" value={gaba.erev} min={-100} max={0} step={0.5} slider digits={1} onChange={(erev) => { setGaba({ ...gaba, erev }); setPresetId("custom"); }} />;
      case "play":
        return mode === "steps" ? <button type="button" onClick={() => setPlay(1)} disabled={!result || busy}>Play the sweeps again</button> : null;
    }
  };

  // The amplifier front's own sections: the cell and the two PSC generators.
  // Dial ranges suit the cell: a GnRH neuron's GABA runs at a few Hz, not hundreds.
  const synRange = cell.model === "gnrh" ? { rate: 50, rateStep: 1, g: 10, gStep: 0.1 } : { rate: 2000, rateStep: 10, g: 50, gStep: 0.5 };
  const PATTERNS = [["poisson", "Poisson"], ["regular", "Regular"]] as const;
  const putForm = (patch: Partial<ProtocolForm>) => { setForm({ ...form, ...patch }); setPresetId("custom"); };
  const synDials = (name: string, syn: SynInput, set: (s: SynInput) => void, withErev: boolean) => {
    const put = (patch: Partial<SynInput>) => { set({ ...syn, ...patch }); setPresetId("custom"); };
    return (
      <AmpSection name={name} power={{ on: syn.enabled, onChange: (on) => put({ enabled: on }) }}>
        <AmpDial label="Rate" unit="Hz" value={syn.rate} min={0} max={synRange.rate} step={synRange.rateStep} digits={0} disabled={!syn.enabled} onChange={(rate) => put({ rate })} />
        <AmpDial label="Peak g" unit="nS" value={syn.gPeak} min={0} max={synRange.g} step={synRange.gStep} digits={1} disabled={!syn.enabled} onChange={(gPeak) => put({ gPeak })} />
        <AmpDial label="τ rise" unit="ms" value={syn.tauRise} min={0} max={10} step={0.1} digits={1} disabled={!syn.enabled} onChange={(tauRise) => put({ tauRise })} />
        <AmpDial label="τ decay" unit="ms" value={syn.tauDecay} min={0.5} max={100} step={0.5} digits={1} disabled={!syn.enabled} onChange={(tauDecay) => put({ tauDecay })} />
        {withErev && <AmpDial label="E_GABA" unit="mV" value={syn.erev} min={-100} max={0} step={0.5} digits={1} disabled={!syn.enabled} onChange={(erev) => put({ erev })} />}
        <AmpChoice label="Timing" value={syn.pattern} options={PATTERNS} disabled={!syn.enabled} onChange={(pattern) => put({ pattern })} />
      </AmpSection>
    );
  };
  const ampSections = (
    <>
      <AmpRow>
        <AmpSection name="MODEL">
          <AmpSlot label="Cell">
            <select id="model-select" aria-label="Cell model" value={cell.model} onChange={(e) => switchModel(e.target.value as ModelId)}>
              {MODEL_LIST.map((m) => <option key={m.id} value={m.id}>{m.short}</option>)}
            </select>
          </AmpSlot>
          <AmpSlot label="Reset">
            <button type="button" onClick={resetCell} title="The published cell at its default holding current; both PSC generators back to this cell's defaults (off)">Cell + PSCs</button>
          </AmpSlot>
        </AmpSection>
        <AmpSection name="CELL">
          <AmpDial label="Ihold" unit="pA" value={ihold} min={model.ranges.ihold.min} max={model.ranges.ihold.max} step={cell.model === "gnrh" ? 0.5 : model.ranges.ihold.step} digits={1} onChange={setIhold} />
          <AmpDial label="gL (leak)" unit="nS" value={cell.gLeak} min={model.ranges.gLeak.min} max={model.ranges.gLeak.max} step={model.ranges.gLeak.step} digits={2} onChange={(gLeak) => setCell({ ...cell, gLeak })} />
          <AmpDial label="Cm (size)" unit="pF" value={cell.cm} min={model.ranges.cm.min} max={model.ranges.cm.max} step={model.ranges.cm.step} digits={1} onChange={(cm) => setCell({ ...cell, cm })} />
          <AmpSlot label="Rin · τm at rest">
            <Tip text={<>
              Measured, never set: <b>Rin at rest</b> comes from the leak plus the channels open at rest, and <b>τm = Rin·Cm</b>.
              Rest {fmt(built.vRest, 1)} mV; Rin at the holding current {fmt(built.rinAtHold, 1)} MΩ; area {Math.round(built.areaUm2).toLocaleString()} µm².
              {!Number.isFinite(built.vRest) && <> No stable rest: with this leak the channels keep the cell depolarized, so rest and Rin are undefined.</>}
            </>}>
              <span className="amp-readout">{fmt(rinRest, 0)} <small>MΩ</small></span>
              <span className="amp-readout">{fmt(tauM, 1)} <small>ms</small></span>
            </Tip>
          </AmpSlot>
        </AmpSection>
        <AmpSection name="ELECTRODE">
          <AmpDial label="Rs" unit="MΩ" value={electrode.rs} min={0} max={100} step={1} digits={0} onChange={(rs) => setElectrode({ ...electrode, rs })} />
          <AmpDial label="Bridge" unit="%" value={Math.round(electrode.bridge * 100)} min={0} max={100} step={5} digits={0} onChange={(b) => setElectrode({ ...electrode, bridge: b / 100 })} />
          <AmpDial label="Pipette C" unit="pF" value={electrode.cp} min={0} max={20} step={0.5} digits={1} onChange={(cp) => setElectrode({ ...electrode, cp })} />
        </AmpSection>
        <AmpSection name="MEMBRANE NOISE">
          <AmpDial label="σ" unit="pA" value={noise.memSigma} min={model.ranges.memNoise.min} max={model.ranges.memNoise.max} step={model.ranges.memNoise.step} digits={1} onChange={(memSigma) => setNoise({ ...noise, memSigma })} />
          <AmpDial label="τ" unit="ms" value={noise.memTau} min={0.5} max={100} step={0.5} digits={1} onChange={(memTau) => setNoise({ ...noise, memTau })} />
        </AmpSection>
      </AmpRow>
      <AmpRow>
        {synDials("GABA PSC", gaba, setGaba, true)}
        {synDials("GLUTAMATE PSC", glu, setGlu, false)}
        <AmpSection name="RANDOM DRAW">
          <AmpSlot label="Draw">
            <span className="amp-readout" aria-live="polite">#{seed}</span>
            <button type="button" onClick={() => setSeed(seed + 1)} title="New PSC timing and noise; the cell is unchanged">New</button>
          </AmpSlot>
        </AmpSection>
      </AmpRow>
    </>
  );
  // The last row starts with the stimulus (pulses on the scope, steps in step mode) and the
  // recording noise; the scope adds its audio monitor after them.
  const ampLastRow = (
    <>
        {mode === "steps" ? (
        <AmpSection name="STEPS">
          <AmpSlot label="Protocol">
            <select id="preset-select" aria-label="Step protocol preset" value={presetId} onChange={(e) => applyPreset(e.target.value)}>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              {!preset && <option value={presetId}>Custom</option>}
            </select>
          </AmpSlot>
          <AmpChoice label="Steps as" value={form.mode} options={[["family", "Family"], ["list", "List"]] as const} onChange={(m) => putForm({ mode: m })} />
          {form.mode === "family" ? <>
            <AmpDial label="First" unit="pA" value={form.first} min={model.ranges.ihold.min} max={model.ranges.ihold.max} step={cell.model === "gnrh" ? 1 : 10} digits={cell.model === "gnrh" ? 1 : 0} onChange={(first) => putForm({ first })} />
            <AmpDial label="Increment" unit="pA" value={form.delta} min={cell.model === "gnrh" ? 0.5 : 5} max={cell.model === "gnrh" ? 10 : 200} step={cell.model === "gnrh" ? 0.5 : 5} digits={cell.model === "gnrh" ? 1 : 0} onChange={(delta) => putForm({ delta })} />
            <AmpDial label="Sweeps" unit="" value={form.count} min={1} max={MAX_SWEEPS} step={1} digits={0} onChange={(count) => putForm({ count })} />
          </> : (
            <AmpSlot label="Steps, pA">
              <input className="amp-list" aria-label="Steps, pA, comma or space separated" value={form.list} onChange={(e) => putForm({ list: e.target.value })} />
            </AmpSlot>
          )}
          <AmpDial label="Step at" unit="ms" value={form.stepStart} min={0} max={2000} step={10} digits={0} onChange={(stepStart) => putForm({ stepStart })} />
          <AmpDial label="Duration" unit="ms" value={form.stepDur} min={0} max={5000} step={50} digits={0} onChange={(stepDur) => putForm({ stepDur })} />
          <AmpDial label="Sweep" unit="ms" value={form.sweepMs} min={100} max={10000} step={100} digits={0} onChange={(sweepMs) => putForm({ sweepMs })} />
        </AmpSection>
        ) : (
        <AmpSection name="PULSES" power={{ on: pulse.enabled, onChange: (on) => setPulse({ ...pulse, enabled: on }) }}>
          <AmpDial label="Amplitude" unit="pA" value={pulse.amp} min={-3 * limits.iBound} max={3 * limits.iBound} step={cell.model === "gnrh" ? 1 : 10} digits={0} disabled={!pulse.enabled} onChange={(amp) => setPulse({ ...pulse, amp })} />
          <AmpDial label="Width" unit="ms" value={pulse.width} min={1} max={2000} step={10} digits={0} disabled={!pulse.enabled} onChange={(width) => setPulse({ ...pulse, width })} />
          <AmpDial label="Period" unit="ms" value={pulse.period} min={10} max={10000} step={50} digits={0} disabled={!pulse.enabled} onChange={(period) => setPulse({ ...pulse, period })} />
        </AmpSection>
        )}
        <AmpSection name="RECORDING NOISE">
          <AmpDial label="RMS" unit="mV" value={noise.recSigma} min={0} max={3} step={0.05} digits={2} onChange={(recSigma) => setNoise({ ...noise, recSigma })} />
          <AmpDial label="Bandwidth" unit="kHz" value={noise.recBandwidth} min={0.2} max={20} step={0.5} digits={1} onChange={(recBandwidth) => setNoise({ ...noise, recBandwidth })} />
          <AmpDial label="Line hum" unit="mV" value={noise.humAmp} min={0} max={3} step={0.05} digits={2} onChange={(humAmp) => setNoise({ ...noise, humAmp })} />
          <AmpChoice label="Mains" value={noise.humHz} options={[[50, "50 Hz"], [60, "60 Hz"]] as const} onChange={(humHz) => setNoise({ ...noise, humHz })} />
        </AmpSection>
    </>
  );

  // The mode switch, and Old school in scope mode: in the amplifier's name strip.
  const ampControls = (
    <>
      <div className="seg" role="radiogroup" aria-label="Mode">
        <button id="mode-steps" role="radio" aria-checked={mode === "steps"} className={mode === "steps" ? "on" : ""} onClick={() => setMode("steps")}>
          Step protocol
        </button>
        <button id="mode-scope" role="radio" aria-checked={mode === "scope"} className={mode === "scope" ? "on" : ""} onClick={() => setMode("scope")}>
          Oscilloscope
        </button>
      </div>
      {mode === "scope" && (
        <label className="check oldschool-toggle">
          <input id="old-school" type="checkbox" checked={oldSchoolPref} onChange={(e) => setOldSchool(e.target.checked)} />
          Old school
        </label>
      )}
    </>
  );

  // ------------------------------------------------------------ render
  return (
    <div className={"page" + (oldSchool ? " old-school" : "")}>
      <header className="topbar">
        <h1>gaba_excites</h1>
        <span className="tagline">Current-clamp excitability, simulated in your browser. Nothing leaves your machine.</span>
        <nav className="toplinks">
          <a href="https://tonydefazio.com/">← tonydefazio.com</a> · <a href="/methods">Methods &amp; models</a> · <a href="/lit">Sources</a> · <a href="https://github.com/syncytium2/gaba_excites">code</a> ·{" "}
          <a href="/fall-2026/" title="The site as UM Physiol 578 used it for the excitability homework, fall 2026, kept unchanged">Fall 2026 classroom version</a>
        </nav>
        <span className="stamp" title={`Born ${fmtStamp(BORN)}`}>v{VERSION} · updated {fmtStamp(UPDATED)}</span>
      </header>

      <KnobContext.Provider value={oldSchool}>
      <div className="layout">
        <aside className="tools">
          <Panel title="Guided tour" open={panels.open.tour} onToggle={() => panels.toggle("tour")} className="tour-panel"
            summary="Why does GABA excite GnRH neurons? Open to start.">
            <Tour onApply={applyTour} control={tourControl} />
          </Panel>

        </aside>

        <main className={"figures" + (mode === "scope" ? " pinned" : "")} style={{ "--screen-h": `${screenH}px` } as React.CSSProperties}>
          <div className="modebar">
            {mode === "scope" && <div className="readout-slot" ref={setReadoutSlot} />}
            {mode === "steps" && <StepReadouts summary={playing ? undefined : summary} rinRest={rinRest} rinHold={built.rinAtHold} refined={refinedValid} onRefine={refineRheobase} tol={model.rheobaseTol} />}
            <Siren reasons={mode === "scope" ? scopeReasons : stepReasons} />
            {error && <div className="warn" role="alert">Simulation failed: {error}</div>}
          </div>

          {mode === "scope" ? (
            <ScopeMode cell={cell} inputs={{ ihold, electrode, glu, gaba, noise, pulse }} seed={seed} limits={limits} onExtremes={setScopeReasons} oldSchool={oldSchool}
              amp={ampSections} ampLastRow={ampLastRow} ampControls={ampControls} readoutSlot={readoutSlot} screenH={screenH} />
          ) : (
            <>

            {!(result && sweeps.length > 0) && (
              <figure className="card screen-card">
                <figcaption><span>Recorded voltage <span className="status" aria-live="polite">{busy ? "simulating…" : ""}</span></span></figcaption>
              </figure>
            )}
            {result && sweeps.length > 0 && (
              <>
                <figure className="card screen-card">
                  <figcaption>
                    <span>Recorded voltage{showVm ? ", with true Vm of the selected sweep dashed" : ""}
                      <span className="status" aria-live="polite">{busy ? "simulating…" : `${sweeps.length} sweeps simulated in ${Math.round(result.ms)} ms`}</span>
                    </span>
                    <span className="play-status" aria-live="polite">
                      {playing && shown ? `Sweep ${shown.sweeps.length} of ${sweeps.length}: ${shown.sweeps[shown.sweeps.length - 1].amp} pA` : ""}
                    </span>
                    <button type="button" onClick={() => (playing ? setPlay(null) : setPlay(1))}>{playing ? "Show all" : "Play sweeps"}</button>
                    <span className="check">
                      <input id="show-vm" type="checkbox" checked={showVm} onChange={(e) => setShowVm(e.target.checked)} />
                      <label htmlFor="show-vm">show</label>
                      <Tip text={<>
                        <b>True Vm</b> is the membrane potential itself. The <b>recorded</b> trace is what the amplifier reports, taken at the
                        pipette: Vm, plus I·Rs from series resistance (less what bridge balance removes), smoothed by pipette capacitance, plus
                        recording noise. At a rig you only ever see the recorded trace; the simulation knows both. Every number on this page is
                        measured on true Vm.
                      </>}>true Vm</Tip>
                    </span>
                  </figcaption>
                  {playing && shown ? (
                    <TracePlots result={shown} rank={shown.sweeps.map((_, k) => k)} sel={shown.sweeps.length - 1} showVm={showVm} synOn={synOn} onSelect={() => {}} ranges={playRanges} screenH={screenH} />
                  ) : (
                    <TracePlots result={result} rank={rank} sel={sel} showVm={showVm} synOn={synOn} onSelect={setSelected} screenH={screenH} />
                  )}
                  <p className="legendline">
                    Sweeps shade light → dark with step amplitude; {playing && shown
                      ? <><span style={{ color: ORANGE }}>■</span> the newest sweep ({shown.sweeps[shown.sweeps.length - 1].amp} pA).</>
                      : <><span style={{ color: ORANGE }}>■</span> the selected sweep ({sweeps[sel]?.amp} pA). Hover to read values, click a trace to select it.</>}
                    {synOn && <> Conductances are the selected sweep's: <span style={{ color: ORANGE }}>■</span> glutamate, <span style={{ color: AQUA }}>■</span> GABA.</>}
                  </p>
                </figure>
              </>
            )}

            <AmpFront controls={ampControls}>
              {ampSections}
              <AmpRow>{ampLastRow}</AmpRow>
            </AmpFront>

            {result && sweeps.length > 0 && (
              <>

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
                      Mean rate is spikes in the step ÷ its duration; initial rate is 1 / the first interspike interval. Steps below
                      0 pA are left off; they are in the table.
                      {pins.map((p, i) => <span key={i} className="pinlabel"><br /><span className="dash">- -</span> {p.label}</span>)}
                    </p>
                  </figure>
                  <figure className="card">
                    <figcaption><span>Phase plot, {sweeps[sel]?.amp} pA</span></figcaption>
                    <PhasePlot vm={sweeps[sel].vm} dt={sweeps[sel].sampleMs} color={ORANGE} />
                  </figure>
                </div>

                <SweepTable summary={summary!} sel={sel} onSelect={setSelected} />

                <Notebook run={busy ? null : { sweeps, summary: summary!, settings: result.settings, cell: result.cell }} model={MODELS[result.settings.cell.model]} app={{ version: VERSION, updated: UPDATED }} />
              </>
            )}
            </>
          )}
        </main>
      </div>

      </KnobContext.Provider>

      <footer>
        <p>
          Model: {model.label} — {model.citation}, <a href={`https://doi.org/${model.doi}`}>doi:{model.doi}</a>. {model.validation}{" "}
          Measurements are taken on the true membrane potential, not on the recorded trace, so electrode settings and recording noise
          never move them.
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

// ------------------------------------------------------------------ noise

// ------------------------------------------------------------------ stats

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

function TracePlots({ result, rank, sel, showVm, synOn, onSelect, ranges, screenH = 460 }: {
  result: Result; rank: number[]; sel: number; showVm: boolean; synOn: boolean; onSelect: (k: number) => void;
  /** fixed axes, so a family drawn one sweep at a time does not rescale as it grows */
  ranges?: { v: [number, number]; i: [number, number] };
  /** the screen card's height: the voltage plot takes what the others leave */
  screenH?: number;
}) {
  const iH = synOn ? 60 : 100;
  const gH = synOn ? 84 : 0;
  // the card's title, legend and padding, and the time label when there is no g plot
  const vH = Math.max(100, screenH - 102 - iH - gH - (synOn ? 0 : 22));
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

  // The plots share one time axis, so only the bottom one labels it.
  const base = (w: number, h: number, yLabel: string, series: uPlot.Series[], extra?: Partial<uPlot.Options>, showX = true): uPlot.Options => ({
    width: w,
    height: h,
    legend: { show: false },
    cursor: { sync: { key: SYNC }, drag: { x: true, y: false }, focus: { prox: 12 } },
    focus: { alpha: 0.35 },
    scales: { x: { time: false } },
    axes: [showX ? axisOpts("", 30) : { ...axisOpts("", 0), show: false }, axisOpts(yLabel, 56)],
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

  const structKey = `${sw.length}|${sel}|${showVm}|${colors.join()}|${n}|${vH}`;
  return (
    <div className="traces">
      <Plot className="plot" data={vData} deps={[structKey]}
        options={(w) => base(w, vH, "V recorded (mV)", vSeries, { hooks: { init: [clickHook], setSeries: [focusHook] }, ...(ranges && { scales: { x: { time: false }, y: { range: ranges.v } } }) }, false)} />
      <Plot className="plot" data={iData} deps={[structKey]}
        options={(w) => base(w, iH, "I (pA)", order.map((k) => ({ label: `${sw[k].amp} pA`, stroke: colors[k], width: k === sel ? 2 : 1 })), ranges && { scales: { x: { time: false }, y: { range: ranges.i } } }, !synOn)} />
      {synOn && (
        <Plot className="plot" data={gData} deps={[structKey, synOn]}
          options={(w) => base(w, gH, "g syn (nS)", [
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
  // The F–I curve starts at 0 pA: hyperpolarizing steps fire nothing and belong
  // to the Rin measurement. They stay in the table below.
  const stats = [...summary.stats].filter((s) => s.amp >= 0).sort((a, b) => a.amp - b.amp);
  const xs = Array.from(new Set([...stats.map((s) => s.amp), ...pins.flatMap((p) => p.points.filter((q) => q.amp >= 0).map((q) => q.amp))])).sort((a, b) => a - b);
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
        scales: {
          x: { time: false, range: (_u, _lo, hi) => [0, Math.max(hi ?? 0, 1)] },
          y: { range: (_u, _lo, hi) => [0, Math.max(10, hi * 1.08)] },
        },
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

/**
 * The step protocol's readouts on one line, in the mode bar, as the scope's are.
 * Each name carries its explanation on hover and focus. Rheobase keeps its
 * "refine" link and the refined value, a result someone asked for.
 */
function StepReadouts({ summary, rinRest, rinHold, refined, onRefine, tol }: {
  summary?: FamilySummary; rinRest: number; rinHold: number; refined: { value: number; tol: number } | null; onRefine: () => void; tol: number;
}) {
  const s = summary;
  const d = tol < 1 ? 1 : 0; // decimals that the refinement actually resolves
  const amp = (v: number) => fmt(v, Number.isInteger(v) ? 0 : 1);
  const item = (name: string, note: React.ReactNode, value: string, unit: string) => (
    <span><Tip text={note}>{name}</Tip> <b>{value}</b> {unit}</span>
  );
  return (
    <span className="readline">
      <span>
        <Tip text={s && !Number.isFinite(s.rheobase) ? "No step fired." : "The smallest step that fired."}>Rheobase</Tip> <b>{s ? amp(s.rheobase) : "—"}</b> pA{" "}
        <small>
          {refined ? (Number.isFinite(refined.value) ? `(refined ${fmt(refined.value, d)} ± ${fmt(refined.tol, d)})` : "(refining…)")
            : s && Number.isFinite(s.rheobase) ? <button className="linkish" onClick={onRefine}>refine to {tol} pA</button> : null}
        </small>
      </span>
      {item("Threshold", "First spike, where dV/dt reaches 20 V/s.", s ? fmt(s.threshold, 1) : "—", "mV")}
      {item("AP peak", "First spike at rheobase.", s ? fmt(s.apPeak, 0) : "—", "mV")}
      {item("Half-width", "At half the threshold-to-peak height.", s ? fmt(s.apHalfWidth, 2) : "—", "ms")}
      {item("Rin", s && Number.isFinite(s.rinMeasured)
        ? `Measured from steps ≤ 0 pA at the holding Vm. Steady-state slope: ${fmt(rinRest, 0)} MΩ at rest${Math.abs(rinHold - rinRest) > 0.02 * rinRest ? `, ${fmt(rinHold, 0)} MΩ at Ihold` : ""}.`
        : "Needs two steps ≤ 0 pA.", s ? fmt(s.rinMeasured, 0) : "—", "MΩ")}
      {item("Holding Vm", "Before the step.", s ? fmt(s.vHold, 1) : "—", "mV")}
      {item("F–I gain", "Slope over the sweeps that fired.", s ? fmt(s.fiGain, 0) : "—", "Hz/nA")}
    </span>
  );
}
