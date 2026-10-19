import { useId, useState } from "react";
import { TOUR, TOUR_IS_DRAFT, splitTerms, type TourSettings } from "../core/tour.ts";

/**
 * The guided tour: one part at a time, each with a "Try this" that sets the
 * controls. Everything is a native button or select, so it works from the
 * keyboard; what a button will change is said before it is pressed, and what
 * it did is announced politely to screen readers.
 */
export function Tour({ onApply }: { onApply: (s: TourSettings) => void }) {
  const [k, setK] = useState(0);
  const [done, setDone] = useState<string>("");
  const id = useId();
  const part = TOUR[k];
  const go = (n: number) => {
    setK(n);
    setDone("");
  };
  return (
    <div className="tour">
      {TOUR_IS_DRAFT && <p className="tour-draft">Draft text, written by Claude for Tony to approve or rewrite.</p>}
      <div className="tour-nav">
        <button type="button" onClick={() => go(k - 1)} disabled={k === 0} aria-label="Previous part">‹</button>
        <label className="select">
          <span className="sr-only">Tour part</span>
          <select id="tour-part" value={k} onChange={(e) => go(Number(e.target.value))}>
            {TOUR.map((p, i) => <option key={p.id} value={i}>{i + 1} of {TOUR.length}: {p.title}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => go(k + 1)} disabled={k === TOUR.length - 1} aria-label="Next part">›</button>
      </div>
      <h3 className="tour-title">{part.title}</h3>
      {part.body.map((para, i) => (
        <p key={i}>{splitTerms(para).map((s, j) => (j % 2 ? <dfn key={j}>{s}</dfn> : s))}</p>
      ))}
      <p className="tour-try" id={`${id}-try`}>{part.tryThis}</p>
      <button type="button" className="tour-button" aria-describedby={`${id}-try`}
        onClick={() => { onApply(part.settings); setDone(`Set: ${part.tryThis}`); }}>
        Try this
      </button>
      <p className="tour-look"><strong>Look for:</strong> {part.lookFor}</p>
      <p className="sr-only" aria-live="polite">{done}</p>
    </div>
  );
}
