import { useId } from "react";

/**
 * A small red siren that blinks while the model is driven somewhere a real
 * cell would not go (src/core/extremes.ts). Nothing is shown otherwise. The
 * reasons sit behind it as a hover, focus and tap explanation, and the label
 * is announced to screen readers when it appears. With reduced motion the
 * light stays on rather than blinking.
 */
export function Siren({ reasons }: { reasons: string[] }) {
  const id = useId();
  if (reasons.length === 0) return null;
  return (
    <span className="siren tip" tabIndex={0} aria-describedby={id} role="status">
      <svg className="siren-light" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 13 V8 a5 5 0 0 1 10 0 V13 Z" />
        <rect x="1.5" y="13" width="13" height="2" rx="0.5" />
      </svg>
      <span className="siren-label">Unphysiologic</span>
      <span role="tooltip" id={id} className="tip-body">
        <b>The model is being driven past what a real cell would do.</b>
        <ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        It will still compute an answer, which is worth seeing, but do not read it as physiology.
      </span>
    </span>
  );
}
