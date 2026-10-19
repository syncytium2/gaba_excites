import { useId } from "react";
import { Knob, useNarrow } from "./Knob.tsx";
import { NumField } from "./NumField.tsx";

/**
 * The oscilloscope's front panel: an amplifier that does not exist. Real
 * current-clamp amplifiers (Axoclamp, Axopatch, EPC-7) have no synapses built
 * in; this one has GABA and glutamate PSC generators beside the holding
 * current, so it says on its face that it is fictional.
 *
 * Its dials are the same Knob as Old school's, each with a number box to type
 * into, bound to the same state as the side panels.
 */
export function AmpFront({ children }: { children: React.ReactNode }) {
  return (
    <section className="amp" aria-label="Amplifier front panel (fictional)">
      <div className="amp-badge" aria-hidden="true">
        <span className="amp-brand">GABA·EXCITES</span> <span className="amp-model">Model 578</span>
        <span className="amp-note">current-clamp amplifier · fictional: no real amplifier has synapses built in</span>
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
