import { useEffect, useId, useState } from "react";

interface Props {
  label: React.ReactNode;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** show a range slider under the box, spanning [min, max] */
  slider?: boolean;
  /** decimals shown in the box when the value is not being edited */
  digits?: number;
  hint?: string;
  disabled?: boolean;
}

/**
 * A number box that commits on Enter or blur (so typing "-" or "1." is never
 * rejected mid-keystroke), with an optional slider that commits live.
 * Out-of-range entries are clamped, not refused.
 */
export function NumField({ label, value, unit, onChange, min, max, step = 1, slider, digits, hint, disabled }: Props) {
  const id = useId();
  const fmt = (v: number) => (digits === undefined ? String(v) : v.toFixed(digits));
  const [text, setText] = useState(fmt(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editing, digits]);

  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = () => {
    setEditing(false);
    const v = Number(text);
    if (Number.isFinite(v)) onChange(clamp(v));
    else setText(fmt(value));
  };

  return (
    <div className={"numfield" + (disabled ? " disabled" : "")}>
      <label htmlFor={id}>
        <span className="nf-label">{label}</span>
        <span className="nf-box">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={text}
            disabled={disabled}
            onFocus={() => setEditing(true)}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
                const v = clamp(Number((value + d).toFixed(6)));
                onChange(v);
                setText(fmt(v));
              }
            }}
          />
          {unit && <span className="nf-unit">{unit}</span>}
        </span>
      </label>
      {slider && min !== undefined && max !== undefined && (
        <input
          className="nf-slider"
          type="range"
          aria-label={typeof label === "string" ? label : undefined}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      {hint && <div className="nf-hint">{hint}</div>}
    </div>
  );
}
