/**
 * The lab notebook: record runs, annotate them, and download a report.
 *
 * Runs are kept in this browser as a convenience (every storage access is
 * guarded, and the page works without it). The durable copy is the file the
 * student downloads: the notebook as JSON, or the report, which carries its runs
 * and loads back in. Nothing is sent anywhere.
 */
import { useEffect, useRef, useState } from "react";
import type { FamilySummary } from "../core/analysis.ts";
import type { ModelDef } from "../core/models.ts";
import type { Sweep } from "../core/simulate.ts";
import { buildReport, MAX_RUNS, parseRuns, recordRun, serializeRuns, settingsDiff, type RunRecord, type RunSettings } from "../core/report.ts";
import { CRITERIA } from "../core/threshold.ts";

const KEY = "gaba_excites.notebook";
const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

function loadStored(): RunRecord[] {
  try {
    const t = localStorage.getItem(KEY);
    return t ? parseRuns(t) : [];
  } catch {
    return [];
  }
}

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "report";

export function Notebook({ run, model, app }: {
  /** the last completed run and the settings that produced it; null while there is none */
  run: { sweeps: Sweep[]; summary: FamilySummary; settings: RunSettings; cell: { vRest: number; rinRest: number; rinAtHold: number } } | null;
  model: ModelDef;
  app: { version: string; updated: string };
}) {
  const [runs, setRuns] = useState<RunRecord[]>(loadStored);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [msg, setMsg] = useState<{ text: string; warn?: boolean } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, serializeRuns(runs));
    } catch {
      if (runs.length) setMsg({ text: "This browser would not keep the notebook. Save it as a file before you leave the page.", warn: true });
    }
  }, [runs]);

  const full = runs.length >= MAX_RUNS;
  const record = () => {
    if (!run || full) return;
    const rec = recordRun({ title: title.trim() || `Run ${runs.length + 1}`, note: note.trim(), settings: run.settings, model, cell: run.cell, sweeps: run.sweeps, summary: run.summary, app });
    setRuns([...runs, rec]);
    setTitle("");
    setNote("");
    setMsg({ text: `Recorded "${rec.title}".` });
  };
  const update = (i: number, patch: Partial<RunRecord>) => setRuns(runs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => setRuns(runs.filter((_, k) => k !== i));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= runs.length) return;
    const next = [...runs];
    [next[i], next[j]] = [next[j], next[i]];
    setRuns(next);
  };

  const report = () => {
    try {
      const html = buildReport(runs, { title: reportTitle.trim(), author: author.trim(), generatedAt: new Date(), app });
      download(`gaba_excites_${slug(reportTitle)}.html`, html, "text/html");
      setMsg({ text: "Report downloaded. Open it in a browser; print it to PDF if you need one." });
    } catch (e) {
      setMsg({ text: String((e as Error).message), warn: true });
    }
  };

  const load = async (f: File) => {
    try {
      const got = parseRuns(await f.text());
      const room = MAX_RUNS - runs.length;
      setRuns([...runs, ...got.slice(0, room)]);
      setMsg(got.length > room ? { text: `Loaded ${room} of ${got.length} runs: a notebook holds ${MAX_RUNS}.`, warn: true } : { text: `Loaded ${got.length} run${got.length === 1 ? "" : "s"}.` });
    } catch (e) {
      setMsg({ text: String((e as Error).message), warn: true });
    }
  };

  const ref = runs[0];
  return (
    <section className="card notebook" aria-label="Lab notebook">
      <div className="nb-head">
        <h2>Lab notebook</h2>
        <span className="small">Record runs, note what you changed and why, and download a report. Kept in this browser; nothing is sent anywhere.</span>
      </div>

      <div className="nb-record">
        <input type="text" placeholder={`Title for this run (Run ${runs.length + 1})`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-label="Run title" />
        <textarea placeholder="Notes: your question, prediction, what you changed, what you see" value={note} rows={2} maxLength={4000} onChange={(e) => setNote(e.target.value)} aria-label="Run notes" />
        <button onClick={record} disabled={!run || full}>Record this run</button>
        {full && <span className="small">The notebook holds {MAX_RUNS} runs; remove one to record another.</span>}
      </div>

      {runs.length > 0 && (
        <ol className="nb-runs">
          {runs.map((x, i) => {
            const diff = i > 0 && ref ? settingsDiff(ref.settings, x.settings) : [];
            const t1 = x.thresholds.find((t) => t.vps === 1);
            return (
              <li key={x.id}>
                <span className="sw" style={{ background: COLORS[i] }} />
                <div className="nb-run">
                  <input type="text" value={x.title} maxLength={120} aria-label={`Title of run ${i + 1}`} onChange={(e) => update(i, { title: e.target.value })} />
                  <div className="small">
                    {x.model.short} · rheobase {fmt(x.measures.rheobase)} pA · threshold {fmt(x.measures.threshold)} mV at 20 V/s
                    {t1 && !t1.hitFloor ? `, ${fmt(t1.v)} mV at 1 V/s` : ""} · Rin {fmt(x.measures.rinMeasured)} MΩ
                  </div>
                  {i > 0 && <div className="small">Changed from run 1: {diff.length ? diff.join("; ") : "nothing (a repeat)"}</div>}
                  <textarea value={x.note} rows={1} maxLength={4000} aria-label={`Notes for run ${i + 1}`} placeholder="Notes" onChange={(e) => update(i, { note: e.target.value })} />
                </div>
                <div className="nb-actions">
                  <button className="linkish" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move run ${i + 1} up`}>up</button>
                  <button className="linkish" onClick={() => move(i, 1)} disabled={i === runs.length - 1} aria-label={`Move run ${i + 1} down`}>down</button>
                  <button className="linkish" onClick={() => remove(i)} aria-label={`Remove run ${i + 1}`}>remove</button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="nb-report">
        <input type="text" placeholder="Report title" value={reportTitle} maxLength={160} onChange={(e) => setReportTitle(e.target.value)} aria-label="Report title" />
        <input type="text" placeholder="Your name (optional)" value={author} maxLength={120} onChange={(e) => setAuthor(e.target.value)} aria-label="Your name" />
        <button onClick={report} disabled={runs.length === 0}>Download report</button>
        <button className="linkish" onClick={() => download("gaba_excites_notebook.json", serializeRuns(runs), "application/json")} disabled={runs.length === 0}>save notebook</button>
        <button className="linkish" onClick={() => file.current?.click()}>load notebook or report</button>
        <input ref={file} type="file" accept=".json,.html,application/json,text/html" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
        {runs.length > 0 && <button className="linkish" onClick={() => { if (confirm("Remove every run from this notebook?")) setRuns([]); }}>clear</button>}
      </div>
      <p className="small">
        The report tabulates threshold at {CRITERIA.map((c) => `${c.vps}`).join(", ")} V/s, because the criterion changes the number: {CRITERIA.map((c) => `${c.vps} V/s, ${c.source}`).join("; ")}.
      </p>
      {msg && <p className={msg.warn ? "warn small" : "small"} aria-live="polite">{msg.text}</p>}
    </section>
  );
}
