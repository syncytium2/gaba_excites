import { createContext, useEffect, useId, useRef, useState } from "react";
import { Tip } from "./Tip.tsx";

/**
 * Old school: every ranged number control becomes a knurled knob. NumField
 * reads this context and hands itself over to Knob when it is on.
 */
export const KnobContext = createContext(false);

/** Phones get the ordinary fields even in Old school: a knob is no way to set a value with a thumb. */
export function useNarrow(): boolean {
  const q = "(max-width: 600px)";
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

interface Props {
  label: React.ReactNode;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  digits?: number;
  hint?: string;
  disabled?: boolean;
}

/** the knob turns through 270°, from 7:30 to 4:30 */
const SWEEP = 270;
/** pixels of drag for the whole range; Shift for a tenth of that speed */
const DRAG_PX = 220;
const KNURLS = 40;

/**
 * A knurled rotary knob. Drag it up or right to turn it clockwise (Shift for
 * fine), scroll it, or use the keyboard (arrows, Page Up/Down, Home/End). For
 * an exact value, double-click it or press Enter, type, and press Enter. To a
 * screen reader it is a slider with its value and unit.
 */
export function Knob({ label, value, unit, onChange, min, max, step, digits, hint, disabled }: Props) {
  const id = useId();
  const knob = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const drag = useRef<{ x: number; y: number; v: number } | null>(null);
  const live = useRef({ value, min, max, step, onChange, disabled });
  live.current = { value, min, max, step, onChange, disabled };

  const fmt = (v: number) => (digits === undefined ? String(+v.toFixed(6)) : v.toFixed(digits));
  const quantize = (v: number) => {
    const { min, max, step } = live.current;
    const q = Math.round((v - min) / step) * step + min;
    return +Math.min(max, Math.max(min, q)).toFixed(10);
  };
  const set = (v: number) => {
    const q = quantize(v);
    if (q !== live.current.value) live.current.onChange(q);
  };

  // the wheel needs a non-passive listener to stop the page scrolling under it
  useEffect(() => {
    const el = knob.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (live.current.disabled) return;
      e.preventDefault();
      const { value, step } = live.current;
      set(value + (e.deltaY < 0 || e.deltaX > 0 ? 1 : -1) * step * (e.ctrlKey || e.metaKey ? 10 : 1));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frac = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
  const angle = -SWEEP / 2 + SWEEP * frac;
  const startEdit = () => {
    if (disabled) return;
    setText(fmt(value));
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const v = Number(text);
    if (Number.isFinite(v)) set(v);
  };

  return (
    <div className={"numfield knobfield" + (disabled ? " disabled" : "")}>
      <div className="kf-label" id={`${id}-l`}>
        {label}
        {hint && <Tip text={hint}>{""}</Tip>}
      </div>
      <div
        ref={knob}
        className="knob"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={`${id}-l`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${fmt(value)}${unit ? " " + unit : ""}`}
        aria-disabled={disabled || undefined}
        onPointerDown={(e) => {
          if (disabled || editing) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, v: value };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const px = d.y - e.clientY + (e.clientX - d.x);
          set(d.v + (px / DRAG_PX) * (max - min) * (e.shiftKey ? 0.1 : 1));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={startEdit}
        onKeyDown={(e) => {
          if (disabled) return;
          const k = e.key;
          const big = Math.max(step, (max - min) / 20);
          const moves: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: big, PageDown: -big };
          if (k in moves) set(value + moves[k] * (e.shiftKey && k.startsWith("Arrow") ? 10 : 1));
          else if (k === "Home") set(min);
          else if (k === "End") set(max);
          else if (k === "Enter") startEdit();
          else return;
          e.preventDefault();
        }}
      >
        <svg viewBox="-32 -32 64 64" aria-hidden="true">
          {/* the engraved scale: 11 ticks over the sweep, min and max longer */}
          {Array.from({ length: 11 }, (_, i) => {
            const a = ((-SWEEP / 2 + (SWEEP * i) / 10 - 90) * Math.PI) / 180;
            const r0 = i % 5 === 0 ? 25.5 : 27;
            return <line key={i} className="k-tick" x1={r0 * Math.cos(a)} y1={r0 * Math.sin(a)} x2={30 * Math.cos(a)} y2={30 * Math.sin(a)} />;
          })}
          <g transform={`rotate(${angle})`}>
            <circle className="k-skirt" r="23" />
            {/* the knurling: fine ridges around the grip */}
            {Array.from({ length: KNURLS }, (_, i) => {
              const a = (2 * Math.PI * i) / KNURLS;
              return <line key={i} className="k-knurl" x1={17.2 * Math.cos(a)} y1={17.2 * Math.sin(a)} x2={20.5 * Math.cos(a)} y2={20.5 * Math.sin(a)} />;
            })}
            <circle className="k-grip" r="17" />
            <circle className="k-cap" r="12.5" />
            <line className="k-pointer" x1="0" y1="-5" x2="0" y2="-21.5" />
          </g>
        </svg>
      </div>
      {editing ? (
        <input
          className="kf-edit"
          autoFocus
          inputMode="decimal"
          aria-label={`${typeof label === "string" ? label : "value"}${unit ? ", " + unit : ""}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button type="button" className="kf-value" onClick={startEdit} disabled={disabled} title="Type an exact value">
          {fmt(value)}
          {unit && <span className="nf-unit"> {unit}</span>}
        </button>
      )}
    </div>
  );
}
