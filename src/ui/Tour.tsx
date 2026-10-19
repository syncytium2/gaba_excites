import { useId, useState } from "react";
import { TOUR, TOUR_IS_DRAFT, splitTerms, type TourControl, type TourSettings } from "../core/tour.ts";

/**
 * The guided tour: one part at a time, each with a "Try this" that sets the
 * controls. Everything is a native button or select, so it works from the
 * keyboard; what a button will change is said before it is pressed, and what
 * it did is announced politely to screen readers.
 *
 * Each part shows its own controls in the card (the same state as the panels),
 * so nobody scrolls away from the plot to find them. Once "Try this" has been
 * pressed the explanation folds away, leaving the controls and "Look for".
 */
export function Tour({ onApply, control }: { onApply: (s: TourSettings) => void; control: (c: TourControl) => React.ReactNode }) {
  const [k, setK] = useState(0);
  const [done, setDone] = useState("");
  const [applied, setApplied] = useState(false);
  const [textOpen, setTextOpen] = useState(true);
  const id = useId();
  const part = TOUR[k];
  const go = (n: number) => {
    setK(n);
    setDone("");
    setApplied(false);
    setTextOpen(true);
  };
  const apply = () => {
    onApply(part.settings);
    setDone(`Set: ${part.tryThis}`);
    setApplied(true);
    setTextOpen(false);
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
      <div id={`${id}-text`} hidden={!textOpen}>
        {part.body.map((para, i) => (
          <p key={i}>{splitTerms(para).map((s, j) => (j % 2 ? <dfn key={j}>{s}</dfn> : s))}</p>
        ))}
        <p className="tour-try" id={`${id}-try`}>{part.tryThis}</p>
      </div>
      {applied && (
        <button type="button" className="linkish tour-more" aria-expanded={textOpen} aria-controls={`${id}-text`} onClick={() => setTextOpen(!textOpen)}>
          {textOpen ? "Hide text" : "Show text"}
        </button>
      )}
      <button type="button" className="tour-button" aria-describedby={`${id}-try`} onClick={apply}>
        {applied ? "Try this again" : "Try this"}
      </button>
      {applied && part.controls.length > 0 && <div className="tour-controls">{part.controls.map((c) => <div key={c}>{control(c)}</div>)}</div>}
      <p className="tour-look"><strong>Look for:</strong> {part.lookFor}</p>
      <p className="sr-only" aria-live="polite">{done}</p>
    </div>
  );
}
