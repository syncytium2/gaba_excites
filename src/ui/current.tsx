/**
 * The current units switch: pA, or current density in pA/pF.
 *
 * At 1 µF/cm², which every model here assumes (cell.ts: 1 pF per 100 µm²),
 * pA/pF is the same number as µA/cm², the unit Hodgkin and Huxley wrote in.
 * Density takes the cell's size out, so cells of different Cm compare.
 *
 * Display only. Every current the app holds, sends to the worker and writes
 * to a CSV stays in pA; this module converts at the edge, by the Cm of the
 * cell that the number belongs to (a pinned curve keeps its own).
 */
import { createContext, useContext, useEffect, useState } from "react";
import { AmpDial, AmpSlot } from "./AmpFront.tsx";

export interface CurrentUnit {
  density: boolean;
  /** the Cm the conversion divides by, pF */
  cm: number;
  /** "pA" or "pA/pF" */
  label: string;
  /** a current in pA, in the display unit */
  show(pA: number): number;
  /** a value in the display unit, back to pA */
  toPA(x: number): number;
  /** a current in pA, as display text without the unit; `pAdigits` is the pA mode's own rounding */
  fmt(pA: number, pAdigits?: number): string;
  /** the same, with the unit */
  text(pA: number, pAdigits?: number): string;
}

/** three significant figures, trailing zeros dropped: 2.25, 0.0345, 12.5, 0 */
export function sig3(x: number): string {
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "0";
  const s = String(+x.toPrecision(3));
  return s.includes("e") ? x.toFixed(4) : s;
}

const minus = (s: string) => s.replace(/^-/, "−");

export function currentUnit(density: boolean, cm: number): CurrentUnit {
  const show = (pA: number) => (density ? pA / cm : pA);
  const fmt = (pA: number, pAdigits?: number) => {
    if (!Number.isFinite(pA)) return "—";
    if (density) return minus(sig3(pA / cm));
    return minus(pAdigits === undefined ? String(+pA.toFixed(4)) : pA.toFixed(pAdigits));
  };
  const label = density ? "pA/pF" : "pA";
  return {
    density,
    cm,
    label,
    show,
    toPA: (x) => (density ? +(x * cm).toFixed(4) : x),
    fmt,
    text: (pA, d) => `${fmt(pA, d)} ${label}`,
  };
}

export const CurrentContext = createContext<CurrentUnit>(currentUnit(false, 100));
export const useCurrentUnit = () => useContext(CurrentContext);

/** the largest of 1, 2, 5 × 10ⁿ not above x */
export function niceStep(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x));
  return [5, 2, 1].map((m) => m * p).find((s) => s <= x * (1 + 1e-9))!;
}

/** decimals that show a step exactly */
export function digitsFor(step: number): number {
  return Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)));
}

/**
 * A dial for an injected current. Value, range and step are in pA; in
 * density mode the dial shows them ÷ Cm, on a round step of its own.
 */
export function CurrentDial({ value, min, max, step, digits, unit, onChange, ...rest }: Omit<React.ComponentProps<typeof AmpDial>, "unit"> & { unit?: string }) {
  const u = useCurrentUnit();
  if (!u.density) return <AmpDial {...rest} value={value} min={min} max={max} step={step} digits={digits} unit={unit ?? "pA"} onChange={onChange} />;
  const st = niceStep((step ?? 1) / u.cm);
  return (
    <AmpDial {...rest} value={+(value / u.cm).toFixed(6)} min={(min ?? 0) / u.cm} max={(max ?? 0) / u.cm} step={st} digits={digitsFor(st)}
      unit="pA/pF" onChange={(x) => onChange(u.toPA(x))} />
  );
}

/**
 * The step list, typed in the display unit. The protocol keeps the list in pA;
 * while the field has focus it shows what was typed, so a half-typed "2." is
 * not rewritten under the cursor.
 */
export function CurrentList({ list, onChange }: { list: string; onChange: (pAList: string) => void }) {
  const u = useCurrentUnit();
  const shown = u.density
    ? list.split(/[\s,]+/).filter(Boolean).map((tok) => (Number.isFinite(+tok) ? sig3(+tok / u.cm) : tok)).join(", ")
    : list;
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [u.density, u.cm]);
  const toPA = (text: string) =>
    u.density ? text.split(/[\s,]+/).filter(Boolean).map((tok) => (tok !== "" && Number.isFinite(+tok) ? String(u.toPA(+tok)) : tok)).join(", ") : text;
  return (
    <AmpSlot label={`Steps, ${u.label}`}>
      <input className="amp-list" aria-label={`Steps, ${u.label}, comma or space separated`} value={draft ?? shown}
        onFocus={() => setDraft(shown)} onBlur={() => setDraft(null)}
        onChange={(e) => { setDraft(e.target.value); onChange(toPA(e.target.value)); }} />
    </AmpSlot>
  );
}
