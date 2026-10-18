/**
 * The lab notebook: recorded runs, and the report a student hands in.
 *
 * A run is everything needed to say what was done and what came of it: the full
 * settings (enough to re-run it exactly, since the model is deterministic for a
 * given seed), the measurements, threshold at every criterion in CRITERIA, and
 * enough of the traces to draw the figures. The report is one self-contained
 * HTML file — inline SVG, inline styles, no script, nothing fetched — that opens
 * anywhere and prints to PDF. The runs ride along inside it as JSON, so a report
 * can be loaded back into the app.
 *
 * Pure TypeScript, no DOM: tested in report.test.ts.
 */
import type { CellParams } from "./cell.ts";
import type { ModelDef } from "./models.ts";
import type { NoiseParams } from "./noise.ts";
import type { Electrode, StepProtocol, Sweep } from "./simulate.ts";
import type { SynInput } from "./synapses.ts";
import type { FamilySummary } from "./analysis.ts";
import { detectSpikes } from "./analysis.ts";
import { CRITERIA, thresholdAt, type ThresholdAt } from "./threshold.ts";
import { esc, linePlot, type Series } from "./svgplot.ts";

export const RECORD_VERSION = 1;
/** a report compares at most this many runs: one categorical color each, never cycled */
export const MAX_RUNS = 8;
const RUN_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export interface RunSettings {
  cell: CellParams;
  ihold: number;
  electrode: Electrode;
  protocol: StepProtocol;
  glu: SynInput;
  gaba: SynInput;
  noise: NoiseParams;
  seed: number;
  /** the preset the protocol came from, if unchanged */
  preset?: string;
}

export interface Trace {
  amp: number;
  isRheobase: boolean;
  /** bin width, ms; min and max Vm in each bin, so spikes survive the decimation */
  binMs: number;
  min: number[];
  max: number[];
}

export interface RunRecord {
  v: number;
  id: string;
  title: string;
  note: string;
  recordedAt: string;
  app: { version: string; updated: string };
  model: { id: string; label: string; short: string; citation: string; doi: string; validation: string };
  settings: RunSettings;
  cell: { vRest: number; rinRest: number; rinAtHold: number };
  measures: {
    rheobase: number;
    /** threshold of the first spike at rheobase, at the app's 20 V/s */
    threshold: number;
    apPeak: number;
    apHalfWidth: number;
    rinMeasured: number;
    vHold: number;
    fiGain: number;
    latency: number;
  };
  thresholds: ThresholdAt[];
  fi: { amp: number; mean: number; initial: number }[];
  traces: Trace[];
  /** the first spike at rheobase, at full resolution, for the phase plot; t relative to the −20 mV crossing */
  spike: { dt: number; t0: number; tCross: number; vm: number[] } | null;
}

export interface RecordInput {
  title: string;
  note: string;
  settings: RunSettings;
  model: ModelDef;
  cell: { vRest: number; rinRest: number; rinAtHold: number };
  sweeps: Sweep[];
  summary: FamilySummary;
  app: { version: string; updated: string };
  /** for tests; defaults to now */
  now?: Date;
}

function r(v: number, d = 3): number {
  return Number.isFinite(v) ? +v.toFixed(d) : NaN;
}

/** Min/max decimation into `bins` bins: keeps every spike's peak and trough. */
export function decimate(vm: ArrayLike<number>, dt: number, bins: number): { binMs: number; min: number[]; max: number[] } {
  const n = vm.length;
  const per = Math.max(1, Math.ceil(n / bins));
  const min: number[] = [];
  const max: number[] = [];
  for (let i = 0; i < n; i += per) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i; j < Math.min(n, i + per); j++) {
      if (vm[j] < lo) lo = vm[j];
      if (vm[j] > hi) hi = vm[j];
    }
    min.push(r(lo, 2));
    max.push(r(hi, 2));
  }
  return { binMs: per * dt, min, max };
}

/** Up to `n` sweeps, evenly over amplitude, always including the lowest, the highest and the rheobase sweep. */
function pickSweeps(sweeps: Sweep[], rheobase: number, n = 8): Sweep[] {
  const by = [...sweeps].sort((a, b) => a.amp - b.amp);
  if (by.length <= n) return by;
  const keep = new Set<number>();
  for (let k = 0; k < n - 1; k++) keep.add(Math.round((k * (by.length - 1)) / (n - 2)));
  const ri = by.findIndex((s) => s.amp === rheobase);
  if (ri >= 0) keep.add(ri);
  return [...keep].sort((a, b) => a - b).map((i) => by[i]);
}

export function recordRun(inp: RecordInput): RunRecord {
  const { summary: s, settings, sweeps } = inp;
  const p = settings.protocol;
  const rheoSweep = sweeps.find((w) => w.amp === s.rheobase);
  let thresholds: ThresholdAt[] = CRITERIA.map((c) => ({ vps: c.vps, v: NaN, t: NaN, hitFloor: false }));
  let spike: RunRecord["spike"] = null;
  let latency = NaN;
  if (rheoSweep) {
    const dt = rheoSweep.sampleMs;
    const first = detectSpikes(rheoSweep.vm, dt).find((x) => x.t >= p.stepStart);
    if (first) {
      const floor = Math.round(p.stepStart / dt);
      const ic = Math.ceil(first.t / dt);
      latency = first.t - p.stepStart;
      thresholds = CRITERIA.map((c) => {
        const t = thresholdAt(rheoSweep.vm, dt, ic, c.vps, floor);
        return { ...t, v: r(t.v, 2), t: r(t.t, 3) };
      });
      const a = Math.max(floor, ic - Math.round(40 / dt));
      const b = Math.min(rheoSweep.vm.length, ic + Math.round(8 / dt));
      spike = { dt, t0: r((a - ic) * dt, 4), tCross: r(ic * dt, 4), vm: Array.from(rheoSweep.vm.subarray(a, b), (v) => r(v, 2)) };
    }
  }
  const now = inp.now ?? new Date();
  return {
    v: RECORD_VERSION,
    id: `${now.getTime().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    title: inp.title,
    note: inp.note,
    recordedAt: now.toISOString(),
    app: inp.app,
    model: { id: inp.model.id, label: inp.model.label, short: inp.model.short, citation: inp.model.citation, doi: inp.model.doi, validation: inp.model.validation },
    settings: JSON.parse(JSON.stringify(settings)),
    cell: { vRest: r(inp.cell.vRest), rinRest: r(inp.cell.rinRest), rinAtHold: r(inp.cell.rinAtHold) },
    measures: {
      rheobase: r(s.rheobase),
      threshold: r(s.threshold, 2),
      apPeak: r(s.apPeak, 2),
      apHalfWidth: r(s.apHalfWidth, 3),
      rinMeasured: r(s.rinMeasured),
      vHold: r(s.vHold, 2),
      fiGain: r(s.fiGain, 1),
      latency: r(latency, 2),
    },
    thresholds,
    fi: [...s.stats].sort((a, b) => a.amp - b.amp).map((x) => ({ amp: x.amp, mean: r(x.meanRate, 2), initial: r(x.initialRate, 2) })),
    traces: pickSweeps(sweeps, s.rheobase).map((w) => ({ amp: w.amp, isRheobase: w.amp === s.rheobase, ...decimate(w.vm, w.sampleMs, 500) })),
    spike,
  };
}

// ---------------------------------------------------------------- saving and loading

/** JSON cannot hold NaN; it travels as null and comes back as NaN. */
export function serializeRuns(runs: RunRecord[]): string {
  return JSON.stringify({ app: "gaba_excites", kind: "runs", v: RECORD_VERSION, runs });
}

const nanify = (x: unknown): unknown =>
  x === null ? NaN : Array.isArray(x) ? x.map(nanify) : typeof x === "object" ? Object.fromEntries(Object.entries(x as object).map(([k, v]) => [k, nanify(v)])) : x;

/**
 * Runs from a notebook file or from a report: a report carries its runs in a
 * <script type="application/json" id="gaba-excites-runs"> block. Throws with a
 * reason a student can read.
 */
export function parseRuns(text: string): RunRecord[] {
  let json = text.trim();
  if (json.startsWith("<")) {
    const m = /<script type="application\/json" id="gaba-excites-runs">([\s\S]*?)<\/script>/.exec(json);
    if (!m) throw new Error("This HTML file is not a gaba_excites report.");
    json = m[1].replace(/<\\\//g, "</");
  }
  let d: { app?: string; kind?: string; v?: number; runs?: unknown };
  try {
    d = JSON.parse(json);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  if (d.app !== "gaba_excites" || d.kind !== "runs" || !Array.isArray(d.runs)) throw new Error("This file is not a gaba_excites notebook.");
  if ((d.v ?? 0) > RECORD_VERSION) throw new Error("This notebook comes from a newer version of the app.");
  const runs = (nanify(d.runs) as RunRecord[]).filter((x) => x && typeof x === "object" && x.settings && x.measures && x.model);
  // keep null-valued strings intact (nanify turns null into NaN everywhere; these were never null)
  return runs.map((x) => ({ ...x, note: typeof x.note === "string" ? x.note : "", title: typeof x.title === "string" ? x.title : "" }));
}

// ---------------------------------------------------------------- what changed between runs

const NAMES: Record<string, string> = {
  "cell.model": "model",
  "cell.gLeak": "gL (nS)",
  "cell.cm": "Cm (pF)",
  ihold: "Ihold (pA)",
  "electrode.rs": "Rs (MΩ)",
  "electrode.cp": "pipette C (pF)",
  "electrode.bridge": "bridge balance",
  "protocol.stepStart": "step start (ms)",
  "protocol.stepDur": "step duration (ms)",
  "protocol.sweepMs": "sweep length (ms)",
  "protocol.amps": "steps (pA)",
  seed: "seed",
  preset: "preset",
};

function flatten(o: unknown, pre = "", out: Record<string, string> = {}): Record<string, string> {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) flatten(v, pre ? `${pre}.${k}` : k, out);
  } else if (Array.isArray(o)) {
    out[pre] = o.length > 4 ? `${o[0]} to ${o[o.length - 1]} (${o.length} steps)` : o.join(", ");
  } else out[pre] = typeof o === "number" ? String(+o.toPrecision(4)) : String(o);
  return out;
}

/** The settings that differ from the reference run, as "name: old → new". */
export function settingsDiff(ref: RunSettings, run: RunSettings): string[] {
  const a = flatten(ref);
  const b = flatten(run);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.filter((k) => a[k] !== b[k]).map((k) => `${NAMES[k] ?? k}: ${a[k] ?? "—"} → ${b[k] ?? "—"}`);
}

// ---------------------------------------------------------------- the report

export interface ReportMeta {
  title: string;
  author: string;
  generatedAt: Date;
  app: { version: string; updated: string };
}

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

function methods(runs: RunRecord[], meta: ReportMeta): string {
  const models = [...new Map(runs.map((x) => [x.model.id, x.model])).values()];
  const ms = models
    .map((m) => `${esc(m.label)} (${esc(m.citation)}, <a href="https://doi.org/${esc(m.doi)}">doi:${esc(m.doi)}</a>). ${esc(m.validation)}`)
    .join(" ");
  const crit = CRITERIA.map((c) => `${c.vps} V/s (${esc(c.source)})`).join("; ");
  return `<p>Simulations were run in gaba_excites version ${esc(meta.app.version)} (last commit ${esc(meta.app.updated)}), a browser
simulator of a single-compartment neuron in current clamp, integrated with an exponential (Rush–Larsen) scheme at a 0.01 ms
time step. Model${models.length > 1 ? "s" : ""}: ${ms}</p>
<p>Each run was a family of current steps from the holding current. Rheobase is the smallest step that fired a spike during
the step. Threshold is the membrane potential where dV/dt first reached a criterion on the upstroke of the first spike at
rheobase, found by walking back from the −20 mV crossing. It is reported at four criteria, because the criterion is a
convention and changes the number: ${crit}. A criterion that the charging after step onset already exceeds is marked
rather than reported. AP peak and half-width are of the same spike. Input resistance was measured from the steady-state
response to steps at or below 0 pA, and computed from the steady-state current–voltage relation at rest. All measurements
are made on the membrane potential, not on the recorded trace, so electrode settings and recording noise do not change
them. Each run lists its full settings; with the same seed, the app reproduces it exactly.</p>`;
}

function measuresTable(runs: RunRecord[]): string {
  const ref = runs[0];
  const cols: { label: string; get: (x: RunRecord) => number; d: number; unit: string }[] = [
    { label: "Rheobase", get: (x) => x.measures.rheobase, d: 1, unit: "pA" },
    ...CRITERIA.map((c, i) => ({ label: `Threshold @${c.vps} V/s`, get: (x: RunRecord) => (x.thresholds[i]?.hitFloor ? NaN : x.thresholds[i]?.v ?? NaN), d: 1, unit: "mV" })),
    { label: "AP peak", get: (x) => x.measures.apPeak, d: 1, unit: "mV" },
    { label: "Half-width", get: (x) => x.measures.apHalfWidth, d: 2, unit: "ms" },
    { label: "Latency at rheobase", get: (x) => x.measures.latency, d: 1, unit: "ms" },
    { label: "Rin measured", get: (x) => x.measures.rinMeasured, d: 1, unit: "MΩ" },
    { label: "Rin at rest", get: (x) => x.cell.rinRest, d: 1, unit: "MΩ" },
    { label: "Holding Vm", get: (x) => x.measures.vHold, d: 1, unit: "mV" },
    { label: "F–I gain", get: (x) => x.measures.fiGain, d: 0, unit: "Hz/nA" },
  ];
  const head = `<tr><th>Run</th>${cols.map((c) => `<th>${esc(c.label)}<br><span class="u">${c.unit}</span></th>`).join("")}</tr>`;
  const rows = runs
    .map((x, i) => {
      const cells = cols
        .map((c) => {
          const v = c.get(x);
          const d0 = c.get(ref);
          const delta = i > 0 && Number.isFinite(v) && Number.isFinite(d0) && Math.abs(v - d0) >= 0.5 * 10 ** -c.d ? `<span class="d">${v - d0 > 0 ? "+" : "−"}${f(Math.abs(v - d0), c.d)}</span>` : "";
          const flag = c.label.startsWith("Threshold") && !Number.isFinite(v) && x.thresholds.some((t) => t.hitFloor && `Threshold @${t.vps} V/s` === c.label) ? `<span class="flag" title="the charging after step onset already exceeds this criterion">ramp</span>` : f(v, c.d);
          return `<td>${flag}${delta}</td>`;
        })
        .join("");
      return `<tr><td><span class="sw" style="background:${RUN_COLORS[i]}"></span>${i + 1}. ${esc(x.title || `Run ${i + 1}`)}</td>${cells}</tr>`;
    })
    .join("");
  return `<table class="m">${head}${rows}</table><p class="small">Small numbers are the change from run 1. "ramp": the charging after step onset already exceeds that criterion, so it gives no threshold.</p>`;
}

function overlays(runs: RunRecord[]): string {
  const fi: Series[] = runs.map((x, i) => ({ x: x.fi.map((p) => p.amp), y: x.fi.map((p) => p.mean), color: RUN_COLORS[i], dots: true, label: `${i + 1}. ${x.title || `Run ${i + 1}`}` }));
  const withSpike = runs.map((x, i) => ({ x, i })).filter((o) => o.x.spike);
  const spikeT: Series[] = withSpike.map(({ x, i }) => ({ x: x.spike!.vm.map((_, k) => x.spike!.t0 + k * x.spike!.dt), y: x.spike!.vm, color: RUN_COLORS[i] }));
  const phase: Series[] = withSpike.map(({ x, i }) => {
    const v = x.spike!.vm;
    const dv = v.map((_, k) => (k > 0 && k < v.length - 1 ? (v[k + 1] - v[k - 1]) / (2 * x.spike!.dt) : NaN));
    return { x: v, y: dv, color: RUN_COLORS[i] };
  });
  const tmin = Math.max(-40, Math.min(...withSpike.map(({ x }) => x.spike!.t0)));
  return `<div class="grid2">
<figure>${linePlot({ series: fi, xlabel: "step (pA)", ylabel: "mean rate (Hz)", title: "F–I curves", legend: true })}</figure>
<figure>${linePlot({ series: phase, xlabel: "Vm (mV)", ylabel: "dV/dt (V/s)", title: "Phase plot, first spike at rheobase", hlines: CRITERIA.map((c) => ({ y: c.vps, color: "#898781" })), yrange: [-5, 60],
    marks: withSpike.flatMap(({ x, i }) => x.thresholds.filter((t) => !t.hitFloor).map((t) => ({ x: t.v, y: t.vps, color: RUN_COLORS[i] }))) })}<figcaption>Dashed lines: the threshold criteria (${CRITERIA.map((c) => c.vps).join(", ")} V/s).</figcaption></figure>
</div>
<figure>${linePlot({ series: spikeT, xlabel: "time from the −20 mV crossing (ms)", ylabel: "Vm (mV)", title: "First spike at rheobase, aligned", xrange: [tmin, 6], width: 1120, height: 280,
    marks: withSpike.flatMap(({ x, i }) => x.thresholds.filter((t) => !t.hitFloor && (t.vps === 1 || t.vps === 20))
      .map((t) => ({ x: t.t - x.spike!.tCross, y: t.v, color: RUN_COLORS[i], shape: t.vps === 1 ? ("circle" as const) : ("diamond" as const) }))) })}
<figcaption>○ threshold at 1 V/s, ◇ at 20 V/s.</figcaption></figure>`;
}

function runSection(x: RunRecord, i: number, ref: RunRecord): string {
  const s = x.settings;
  const traces: Series[] = x.traces.flatMap((t, k) => {
    const color = t.isRheobase ? RUN_COLORS[i] : ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"][Math.min(4, Math.floor((k * 5) / Math.max(1, x.traces.length)))];
    const tt = t.min.map((_, b) => b * t.binMs);
    return [
      { x: tt, y: t.max, color, width: t.isRheobase ? 1.6 : 1 },
      { x: tt, y: t.min, color, width: t.isRheobase ? 1.6 : 1 },
    ];
  });
  const diff = i === 0 ? [] : settingsDiff(ref.settings, s);
  const syn = (n: string, g: SynInput) => (g.enabled ? `${n} ${g.rate} Hz, ${g.gPeak} nS, ${g.tauRise}/${g.tauDecay} ms, E ${g.erev} mV, ${g.pattern}` : `${n} off`);
  const amps = s.protocol.amps;
  const crit = x.thresholds
    .map((t) => `<tr><td>${t.vps} V/s</td><td>${t.hitFloor ? `<span class="flag">ramp</span>` : f(t.v, 1) + " mV"}</td><td class="small">${esc(CRITERIA.find((c) => c.vps === t.vps)?.source ?? "")}</td></tr>`)
    .join("");
  return `<section class="run">
<h2><span class="sw" style="background:${RUN_COLORS[i]}"></span>${i + 1}. ${esc(x.title || `Run ${i + 1}`)}</h2>
<p class="small">Recorded ${esc(new Date(x.recordedAt).toLocaleString())} · ${esc(x.model.label)}</p>
${x.note ? `<div class="note">${esc(x.note).replace(/\n/g, "<br>")}</div>` : ""}
${i > 0 ? `<p><b>Changed from run 1:</b> ${diff.length ? diff.map(esc).join("; ") : "nothing (a repeat)"}</p>` : ""}
<p class="settings">Cm ${f(s.cell.cm, 1)} pF · gL ${f(s.cell.gLeak, 2)} nS · Ihold ${s.ihold} pA · rest ${f(x.cell.vRest, 1)} mV · Rin at rest ${f(x.cell.rinRest, 1)} MΩ ·
steps ${amps.length > 4 ? `${amps[0]} to ${amps[amps.length - 1]} pA (${amps.length})` : amps.join(", ") + " pA"}, ${s.protocol.stepDur} ms from ${s.protocol.stepStart} ms ·
${esc(syn("glutamate", s.glu))} · ${esc(syn("GABA", s.gaba))} · electrode Rs ${s.electrode.rs} MΩ, bridge ${Math.round(s.electrode.bridge * 100)}%, Cp ${s.electrode.cp} pF ·
membrane noise ${s.noise.memSigma} pA · seed ${s.seed}${s.preset ? ` · preset "${esc(s.preset)}"` : ""}</p>
<div class="grid2">
<figure>${linePlot({ series: traces, xlabel: "time (ms)", ylabel: "Vm (mV)", title: `Vm, ${x.traces.length} of ${amps.length} sweeps (rheobase sweep in color)` })}</figure>
<table class="c"><tr><th>Criterion</th><th>Threshold</th><th>Convention</th></tr>${crit}</table>
</div>
</section>`;
}

const CSS = `body{font:14px/1.45 system-ui,-apple-system,sans-serif;color:#0b0b0b;background:#fcfcfb;max-width:1160px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:22px 0 6px}a{color:#1f63b8}
.small{font-size:12px;color:#52514e}.u{font-weight:400;color:#898781;font-size:11px}
table{border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:4px 8px;border-bottom:1px solid #e1e0d9;text-align:right;vertical-align:top}
th:first-child,td:first-child{text-align:left}table.m{width:100%;font-size:12.5px}table.c td:last-child,table.c th:last-child{text-align:left}
.d{display:block;font-size:10.5px;color:#52514e}.flag{font-size:11px;color:#9a3412}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}@media(max-width:800px){.grid2{grid-template-columns:1fr}}
figure{margin:8px 0}figcaption{font-size:12px;color:#52514e}.note{border-left:3px solid #c3c2b7;padding:4px 10px;margin:6px 0;background:#f4f4f1}
.settings{font-size:12.5px;color:#52514e}section.run{break-inside:avoid;border-top:1px solid #e1e0d9;margin-top:18px}
@media print{body{margin:0;max-width:none}a{color:inherit}}`;

/** The report: one self-contained HTML document. */
export function buildReport(runs: RunRecord[], meta: ReportMeta): string {
  if (runs.length === 0) throw new Error("Record at least one run first.");
  const use = runs.slice(0, MAX_RUNS);
  const ref = use[0];
  const data = serializeRuns(use).replace(/<\//g, "<\\/");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title || "gaba_excites report")}</title><style>${CSS}</style></head><body>
<h1>${esc(meta.title || "gaba_excites report")}</h1>
<p class="small">${meta.author ? `${esc(meta.author)} · ` : ""}${esc(meta.generatedAt.toLocaleString())} · gaba_excites ${esc(meta.app.version)} · ${use.length} run${use.length > 1 ? "s" : ""}</p>
<h2>Results</h2>
${measuresTable(use)}
${overlays(use)}
<h2>Runs</h2>
${use.map((x, i) => runSection(x, i, ref)).join("\n")}
<h2>Methods</h2>
${methods(use, meta)}
<p class="small">The runs are embedded in this file; load it into gaba_excites (Notebook → Load) to see or re-run them.</p>
<script type="application/json" id="gaba-excites-runs">${data}</script>
</body></html>`;
}
