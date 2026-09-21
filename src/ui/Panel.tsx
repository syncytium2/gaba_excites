import { useCallback, useId, useState } from "react";

/**
 * A collapsible control panel. The header is a real button (keyboard and
 * screen-reader operable, aria-expanded); `extra` sits beside it and stays
 * usable while collapsed — the PSC on/off checkboxes live there. A collapsed
 * panel shows `summary`, so closing a panel never hides what it is set to.
 */
export function Panel({ title, open, onToggle, summary, extra, className, children }: {
  title: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  summary?: React.ReactNode;
  extra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section className={"panel" + (open ? " open" : " closed") + (className ? " " + className : "")}>
      <div className="ph">
        {extra}
        <button type="button" className="ph-toggle" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <span className="ph-title">{title}</span>
          <svg className="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {!open && summary && <div className="ph-summary">{summary}</div>}
      <div id={id} className="pb" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

const STORE = "gaba_excites.panels";

/**
 * Which panels are open, remembered in this browser. Storage is a convenience
 * only: every read and write is guarded, and the defaults apply whenever it is
 * unavailable (private windows, blocked site data).
 */
export function usePanels(defaults: Record<string, boolean>) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, boolean>;
      return { ...defaults, ...saved };
    } catch {
      return defaults;
    }
  });
  const set = useCallback((key: string, value: boolean) => {
    setOpen((prev) => {
      if (prev[key] === value) return prev;
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        /* storage unavailable: still works for this visit */
      }
      return next;
    });
  }, []);
  return { open, set, toggle: (key: string) => set(key, !open[key]) };
}
