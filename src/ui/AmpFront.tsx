import { useId } from "react";
import { Knob, useNarrow } from "./Knob.tsx";
import { NumField } from "./NumField.tsx";

/**
 * The oscilloscope's front panel: a made-up amplifier, with GABA and
 * glutamate PSC generators beside the holding current. It makes no claim
 * about what real amplifiers can do: some (Sutter's dPatch, the owner found)
 * have dynamic clamp built in.
 *
 * Its dials are the same Knob as Old school's, each with a number box to type
 * into, bound to the same state as the side panels.
 */
export function AmpFront({ children }: { children: React.ReactNode }) {
  return (
    <section className="amp" aria-label="Amplifier front panel (fictional)">
      <div className="amp-badge" aria-hidden="true">
        <span className="amp-brand">GABA·EXCITES</span> <span className="amp-model">Model 578</span>
        <span className="amp-note">current-clamp amplifier · fictional</span>
      </div>
      <div className="amp-sections">{children}</div>
    </section>
  );
}

export function AmpSection({ name, children, power }: { name: string; children: React.ReactNode; power?: { on: boolean; onChange: (on: boolean) => void } }) {
  const id = useId();
  return (
    <div className={"amp-section" + (power && !power.on ? " amp-off" : "")} role="group" aria-labelledby={id}>
      <div className="amp-head">
        <span className="amp-name" id={id}>{name}</span>
        {power && <AmpSwitch label={`${name} on`} on={power.on} onChange={power.onChange} />}
      </div>
      <div className="amp-ctrls">{children}</div>
    </div>
  );
}

/** A toggle switch with a lamp: a real checkbox with role="switch", so it works from the keyboard. */
export function AmpSwitch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="amp-switch">
      <input type="checkbox" role="switch" checked={on} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="amp-lamp" aria-hidden="true" />
      <span className="amp-switch-text" aria-hidden="true">{on ? "ON" : "OFF"}</span>
    </label>
  );
}

/** A dial with its number box; on a phone, a plain number field (a dial is no way to set a value with a thumb). */
export function AmpDial(props: React.ComponentProps<typeof Knob>) {
  const narrow = useNarrow();
  return narrow ? <NumField {...props} /> : <Knob {...props} />;
}

/** One row of sections. Rows are divided by an engraved groove, and each row's controls share a bottom edge. */
export function AmpRow({ children }: { children: React.ReactNode }) {
  return <div className="amp-row">{children}</div>;
}

/**
 * Any control that is not a dial, in a cell the same height as a dial's, with its
 * name on the same line as the dials' names and its bottom on their bottom line.
 */
export function AmpSlot({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="amp-slot">
      <span className="amp-slot-label">{label}</span>
      <div className="amp-slot-body">{children}</div>
    </div>
  );
}

/** A row of push buttons that pick one value, such as Poisson / Regular. */
export function AmpChoice<T extends string | number>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <AmpSlot label={label}>
      <span className="seg small" role="radiogroup" aria-label={label}>
        {options.map(([v, name]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} disabled={disabled}
            onClick={() => onChange(v)}>{name}</button>
        ))}
      </span>
    </AmpSlot>
  );
}
