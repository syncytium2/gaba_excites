/**
 * The guided tour: named parts, each a short text and a "Try this" that sets
 * the controls. Every part runs on the GnRH cell, so every number quoted here
 * belongs to that model, and tour.test.ts pins each one.
 *
 * DRAFT. All text below is Claude's, written 2026-10-19 for the owner to
 * approve or rewrite line by line. Do not deploy it as his words.
 *
 * In the text, [[term]] marks the place a term is first defined; the panel
 * renders it as <dfn>.
 */

import { publishedParams, type CellParams } from "./cell.ts";
import { MODELS, type ModelId } from "./models.ts";
import { presetsFor, type ProtocolForm } from "./protocol.ts";
import { DEFAULT_GABA, DEFAULT_GLU, type SynInput } from "./synapses.ts";

export const TOUR_IS_DRAFT = true;

export interface TourSettings {
  model: ModelId;
  mode: "steps" | "scope";
  /** holding current, pA */
  ihold: number;
  /** overrides of the published cell; anything left out is published */
  gLeak?: number;
  cm?: number;
  /** step-protocol preset for this model; its synapses are replaced by the ones below */
  presetId?: string;
  /** on when given, off when left out; the model's own GABA kinetics apply */
  glu?: Partial<SynInput>;
  gaba?: Partial<SynInput>;
}

export interface TourPart {
  id: string;
  title: string;
  /** paragraphs */
  body: string[];
  /** what the button changes, said plainly before it is pressed */
  tryThis: string;
  lookFor: string;
  settings: TourSettings;
}

/**
 * The opening's holding current. +7.5 pA holds this cell at −61.4 mV, where it
 * stays silent for a minute with no input; +8.5 pA fires on its own. The owner
 * chose a rest near −60 mV (docs/process.md, 2026-10-19).
 */
export const OPENING_IHOLD = 7.5;

export const TOUR: TourPart[] = [
  {
    id: "puzzle",
    title: "The puzzle",
    body: [
      "GABA is called the brain's inhibitory transmitter: released onto a neuron, it usually makes that neuron less likely to fire. In 2002 we recorded from GnRH neurons, the cells that drive reproduction, and found the opposite. GABA excited them (DeFazio, Heger, Ojeda & Moenter 2002).",
      "This is a model GnRH neuron. GABA arrives at random, about three times a second. Each arrival makes a [[postsynaptic potential]] (PSP): a small, brief change in the cell's voltage caused by one synapse.",
    ],
    tryThis: "Opens the oscilloscope on the GnRH cell, held near −61 mV by a small steady current, with GABA arriving about three times a second.",
    lookFor: "Most PSPs push the voltage up a few millivolts and fade. Now and then one sets off an action potential, the tall spike. The rest of this tour is about why.",
    settings: { model: "gnrh", mode: "scope", ihold: OPENING_IHOLD, gaba: { rate: 3 } },
  },
  {
    id: "rest",
    title: "A resting cell",
    body: [
      "The trace is the [[membrane potential]] (Vm): the voltage inside the cell relative to outside, in millivolts (mV). A neuron that is left alone settles at its [[resting potential]]. Moving Vm up, toward zero, is called depolarizing; moving it down is hyperpolarizing.",
      "With no input and no current injected, this model cell rests at −67.5 mV.",
    ],
    tryThis: "Turns GABA off and the holding current to zero.",
    lookFor: "A flat line at −67.5 mV. Nothing happens until something pushes the cell.",
    settings: { model: "gnrh", mode: "scope", ihold: 0 },
  },
  {
    id: "threshold",
    title: "Find threshold",
    body: [
      "In [[current clamp]] you inject current through the electrode and watch the voltage. Current is measured in picoamperes (pA); a GnRH neuron needs only tens of them. A [[current step]] switches the current on for a while and off again, and each run of the protocol is one [[sweep]].",
      "This is Adams et al.'s (2018) protocol: 500 ms steps from 0 to 30 pA in 2 pA increments, on a −6 pA holding current that sits the cell at −70 mV. Small steps only depolarize the cell. The smallest current that makes it fire is its [[rheobase]]. With 2 pA steps, the first to fire here is 18 pA. The voltage where the spike takes off is its [[threshold]]. Both are measures of excitability, and they need not agree.",
    ],
    tryThis: "Switches to the step protocol, with the Adams et al. steps.",
    lookFor: "The Rheobase and Threshold tiles, and how late the first spike comes on the smallest step that fires.",
    settings: { model: "gnrh", mode: "steps", ihold: -6, presetId: "gnrh-fi" },
  },
  {
    id: "leak",
    title: "Change the leak",
    body: [
      "Some channels are open all the time and let a little current through. Together they are the [[leak]]. Their [[conductance]] (gL, in nanosiemens, nS) says how easily current flows. The more conductance, the less the voltage moves for a given current: the cell's [[input resistance]] (Rin) falls.",
    ],
    tryThis: "Doubles the leak, from 1 to 2 nS. Same steps as before.",
    lookFor: "Smaller responses to the same steps, and rheobase up from 18 to 28 pA. Drag gL in the Cell panel to see it move both ways.",
    settings: { model: "gnrh", mode: "steps", ihold: -6, presetId: "gnrh-fi", gLeak: 2 },
  },
  {
    id: "size",
    title: "Make the cell bigger",
    body: [
      "The membrane stores charge, as a capacitor does. Its [[capacitance]] (Cm, in picofarads, pF) grows with the cell's surface area. In this simulator, Cm stands for the cell's size: doubling it doubles the area and every voltage-gated channel with it. The leak stays at the gL you set.",
      "A bigger cell takes longer to charge. That time is the [[membrane time constant]], τm = Rin × Cm.",
    ],
    tryThis: "Doubles Cm, from 20 to 40 pF, with the leak back at 1 nS. Same steps.",
    lookFor: "Slower charging at the start of each step, and rheobase up from 18 to 26 pA.",
    settings: { model: "gnrh", mode: "steps", ihold: -6, presetId: "gnrh-fi", cm: 40 },
  },
  {
    id: "synapses",
    title: "Add synaptic input",
    body: [
      "Back to the oscilloscope, with the cell near −61 mV. Glutamate is the brain's main excitatory transmitter. Each arrival opens channels for a few milliseconds.",
      "Which way a PSP goes depends on the channel's [[reversal potential]]: the voltage at which current through it changes direction. The current always pushes Vm toward the reversal potential. For glutamate that is about 0 mV, far above rest, so every glutamate PSP goes up.",
    ],
    tryThis: "Turns on glutamate, about three arrivals a second, with GABA off.",
    lookFor: "Upward PSPs, with a spike now and then, much as in the puzzle. GABA did the same job glutamate does here.",
    settings: { model: "gnrh", mode: "scope", ihold: OPENING_IHOLD, glu: { rate: 3, gPeak: 1 } },
  },
  {
    id: "slide",
    title: "Slide GABA's reversal potential",
    body: [
      "GABA's channels pass mostly chloride, so GABA's reversal potential, [[E_GABA]], depends on how much chloride the cell keeps inside. Most adult neurons keep little, which puts E_GABA below rest. Their GABA PSPs go down, away from threshold: that is inhibition.",
      "GnRH neurons keep more. Measured without disturbing the cell's chloride, their E_GABA is −36.5 mV, above rest (DeFazio et al. 2002).",
    ],
    tryThis: "Sets E_GABA to −70 mV, as in a typical adult neuron, with GABA about five times a second. Then drag E_GABA up in the GABA panel.",
    lookFor: "The PSPs flip from down to up as E_GABA passes the cell's voltage, near −61 mV. Up is not yet exciting: below about −55 mV they never reach threshold. Spikes appear between about −50 and −45 mV, and at −36.5 mV roughly one PSP in six fires the cell.",
    settings: { model: "gnrh", mode: "scope", ihold: OPENING_IHOLD, gaba: { rate: 5, erev: -70 } },
  },
  {
    id: "where-rest",
    title: "Where is rest?",
    body: [
      "This tour held the cell near −61 mV. Real GnRH neurons' resting potential depends on how it is measured. Gramicidin perforated patch, which leaves the cell's chloride alone, gives about −51 to −59 mV. On-cell estimates, which leave the cell unopened, give about −70 to −73 mV. Adams et al. built this model at −70 mV.",
    ],
    tryThis: "Holds the cell at −70 mV (−6 pA), with GABA as GnRH neurons have it: E_GABA −36.5 mV, about five times a second.",
    lookFor: "Every GABA PSP still pushes the voltage up, yet none reaches threshold. Whether GABA fires a GnRH neuron depends on two voltages: E_GABA, and where the cell rests.",
    settings: { model: "gnrh", mode: "scope", ihold: -6, gaba: { rate: 5 } },
  },
];

/**
 * What a part's "Try this" sets. The app applies exactly this, and
 * tour.test.ts measures exactly this, so the text and the screen agree.
 */
export function tourInputs(s: TourSettings): { cell: CellParams; ihold: number; presetId: string; form: ProtocolForm; glu: SynInput; gaba: SynInput } {
  const m = MODELS[s.model];
  const preset = presetsFor(s.model).find((p) => p.id === s.presetId) ?? presetsFor(s.model)[0];
  const cell = { ...publishedParams(s.model), ...(s.gLeak !== undefined && { gLeak: s.gLeak }), ...(s.cm !== undefined && { cm: s.cm }) };
  const gabaBase: SynInput = { ...DEFAULT_GABA, erev: m.defaults.eGaba, ...m.gabaKinetics, enabled: false };
  return {
    cell,
    ihold: s.ihold,
    presetId: preset.id,
    form: preset.protocol,
    glu: s.glu ? { ...DEFAULT_GLU, ...s.glu, enabled: true } : { ...DEFAULT_GLU, enabled: false },
    gaba: s.gaba ? { ...gabaBase, ...s.gaba, enabled: true } : gabaBase,
  };
}

/** Split a paragraph on [[term]] marks: even indexes are plain text, odd ones terms. */
export function splitTerms(text: string): string[] {
  return text.split(/\[\[([^\]]+)\]\]/);
}
