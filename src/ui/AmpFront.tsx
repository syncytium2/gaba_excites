import { useId, useState } from "react";
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
export function AmpFront({ children, controls }: { children: React.ReactNode; controls?: React.ReactNode }) {
  return (
    <section className="amp" aria-label="Amplifier front panel (fictional)">
      <div className="amp-badge">
        <span className="amp-brand" aria-hidden="true">GABA·EXCITES</span> <span className="amp-model" aria-hidden="true">Model 578</span>
        {controls && <span className="amp-badge-ctrls">{controls}</span>}
        <span className="amp-note" aria-hidden="true">current-clamp amplifier · fictional</span>
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

/**
 * The rig, as three panels below the recording window, each folding to one line:
 *
 *   AMPLIFIER    the box on the rack: clamp mode, holding, electrode, filter (and, on the scope, the audio monitor)
 *   ACQUISITION  the acquisition software: the protocol, and in voltage clamp what is measured
 *   SIMULATION   what a rig does not have a knob for: the cell, the bath (channel blocks), synaptic input, noise
 *
 * Split so that a simulated property is never mistaken for an amplifier's control (the cell's leak gL beside a
 * leak-subtraction setting, say), and so the filter sits on the amplifier, not among the noise sources (the
 * owner, 2026-10-29). Whether each is folded is remembered per browser.
 */
export interface RigPanel {
  rows: React.ReactNode;
  /** one line shown when folded */
  summary: string;
}

const PANELS = [
  { key: "amp", brand: "GABA·EXCITES", model: "Model 578", note: "amplifier · fictional", label: "Amplifier" },
  { key: "acq", brand: "ACQUISITION", model: "", note: "protocol and analysis, as in the acquisition software", label: "Acquisition" },
  { key: "sim", brand: "SIMULATION", model: "", note: "the cell, the bath, the room: what a rig has no knob for", label: "Simulation" },
] as const;

function readFolded(key: string): boolean {
  try {
    return localStorage.getItem(`gaba_excites.panel.${key}`) === "folded";
  } catch {
    return false;
  }
}

function useFolded(key: string): [boolean, (f: boolean) => void] {
  const [folded, setFolded] = useState(() => readFolded(key));
  const set = (f: boolean) => {
    setFolded(f);
    try {
      localStorage.setItem(`gaba_excites.panel.${key}`, f ? "folded" : "open");
    } catch {
      /* private window: the choice lasts the visit */
    }
  };
  return [folded, set];
}

export function RigPanels({ amplifier, acquisition, simulation, controls }: {
  amplifier: RigPanel;
  acquisition: RigPanel;
  simulation: RigPanel;
  /** the mode switch and Old school, in the amplifier's name strip */
  controls?: React.ReactNode;
}) {
  const content = { amp: amplifier, acq: acquisition, sim: simulation };
  return (
    <div className="rig">
      {PANELS.map((p) => (
        <RigPanelView key={p.key} spec={p} panel={content[p.key]} controls={p.key === "amp" ? controls : undefined} />
      ))}
    </div>
  );
}

function RigPanelView({ spec, panel, controls }: { spec: (typeof PANELS)[number]; panel: RigPanel; controls?: React.ReactNode }) {
  const [folded, setFolded] = useFolded(spec.key);
  const id = useId();
  return (
    <section className={`amp rig-panel rig-${spec.key}` + (folded ? " folded" : "")} id={`rig-${spec.key}`} aria-label={spec.label}>
      <div className="amp-badge">
        <button type="button" className="rig-fold" aria-expanded={!folded} aria-controls={id} onClick={() => setFolded(!folded)}
          title={folded ? `Open the ${spec.label.toLowerCase()} panel` : `Fold the ${spec.label.toLowerCase()} panel to one line`}>
          {folded ? "▸" : "▾"}
        </button>
        <span className="amp-brand" aria-hidden="true">{spec.brand}</span>
        {spec.model && <> <span className="amp-model" aria-hidden="true">{spec.model}</span></>}
        {controls && <span className="amp-badge-ctrls">{controls}</span>}
        {folded ? <span className="rig-summary">{panel.summary}</span> : <span className="amp-note" aria-hidden="true">{spec.note}</span>}
      </div>
      <div className="amp-sections" id={id} hidden={folded}>{panel.rows}</div>
    </section>
  );
}
