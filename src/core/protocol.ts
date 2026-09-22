/**
 * Building the list of step amplitudes, and the presets.
 *
 * Two ways to say which steps to run: a family (first, increment, count) or a
 * free list ("-100, 0, 250, 600"). Both end up as the same `amps` array.
 */

import { GNRH, type ModelId } from "./models.ts";
import type { StepProtocol } from "./simulate.ts";
import { DEFAULT_GABA, DEFAULT_GLU, type SynInput } from "./synapses.ts";

export interface ProtocolForm {
  mode: "family" | "list";
  first: number;
  delta: number;
  count: number;
  list: string;
  sweepMs: number;
  stepStart: number;
  stepDur: number;
}

export const MAX_SWEEPS = 40;

export function parseList(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, MAX_SWEEPS);
}

export function amplitudes(f: ProtocolForm): number[] {
  if (f.mode === "list") return parseList(f.list);
  const n = Math.max(1, Math.min(MAX_SWEEPS, Math.round(f.count)));
  return Array.from({ length: n }, (_, k) => f.first + k * f.delta);
}

export function toProtocol(f: ProtocolForm): StepProtocol {
  const sweepMs = Math.max(10, f.sweepMs);
  const stepStart = Math.max(0, Math.min(f.stepStart, sweepMs));
  return {
    sweepMs,
    stepStart,
    stepDur: Math.max(0, Math.min(f.stepDur, sweepMs - stepStart)),
    amps: amplitudes(f),
  };
}

export interface Preset {
  id: string;
  /** presets quote measured numbers, so each belongs to exactly one model */
  model: ModelId;
  label: string;
  /** one sentence: what to look at */
  note: string;
  protocol: ProtocolForm;
  glu: SynInput;
  gaba: SynInput;
}

const FI: ProtocolForm = {
  mode: "family",
  first: -200,
  delta: 100,
  count: 13,
  list: "-200, -100, 0, 500, 550, 600, 650, 700",
  sweepMs: 1000,
  stepStart: 100,
  stepDur: 800,
};

/**
 * GABA as it is in a GnRH neuron: depolarizing (E_GABA −36.5 mV), with the
 * measured PSC kinetics and size. models.ts holds both values and their
 * sources. Off until ticked.
 */
const GNRH_GABA: SynInput = { ...DEFAULT_GABA, erev: GNRH.defaults.eGaba, ...GNRH.gabaKinetics };

export const PRESETS: Preset[] = [
  {
    id: "fi",
    model: "rs",
    label: "F–I family",
    note: "Hyperpolarizing steps give Rin; depolarizing ones cross threshold and trace out the F–I curve. Watch the M current stretch the interspike intervals.",
    protocol: FI,
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
  },
  {
    id: "threshold",
    model: "rs",
    label: "Threshold, fine steps",
    note: "10 pA steps around rheobase. The first spike arrives late and alone; a few pA more and it comes early and brings company.",
    protocol: { ...FI, first: 540, delta: 10, count: 11 },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
  },
  {
    id: "barrage",
    model: "rs",
    label: "Synaptic barrage",
    note: "No step, just background input: 1000 glutamate events a second (think a thousand synapses at 1 Hz each) drive irregular firing near 11 Hz. Now tick GABA at 400 Hz: about 2 Hz.",
    protocol: { ...FI, mode: "list", list: "0", sweepMs: 2000, stepStart: 0, stepDur: 2000 },
    glu: { ...DEFAULT_GLU, enabled: true, rate: 1000, gPeak: 3 },
    gaba: { ...DEFAULT_GABA, rate: 400 },
  },
  {
    id: "shunt",
    model: "rs",
    label: "GABA depolarizes, yet inhibits",
    note: "E_GABA −60 mV is 10 mV above rest, so every IPSP here is depolarizing — and rheobase still rises, from 561 pA with GABA off to about 600 pA, because the open conductance shunts the step. Click “refine to 1 pA”, then untick GABA and refine again.",
    protocol: FI,
    glu: DEFAULT_GLU,
    gaba: { ...DEFAULT_GABA, enabled: true, rate: 200, gPeak: 3, erev: -60 },
  },
  {
    id: "crossover",
    model: "rs",
    label: "GABA's crossover point",
    note: "At E_GABA ≈ −50 mV this GABA neither helps nor hinders: rheobase is 561 pA with or without it. That is ~11 mV below spike threshold, not at it — what matters is where Vm sits while the step charges toward threshold. Try −55 and −45.",
    protocol: { ...FI, first: 500, delta: 10, count: 11 },
    glu: DEFAULT_GLU,
    gaba: { ...DEFAULT_GABA, enabled: true, rate: 200, gPeak: 3, erev: -50, pattern: "regular" },
  },
  {
    id: "excites",
    model: "rs",
    label: "GABA excites",
    note: "E_GABA −35 mV, above spike threshold: the same conductance now lowers rheobase to ~400 pA. Drag E_GABA down through −50 and watch it change sides.",
    protocol: FI,
    glu: DEFAULT_GLU,
    gaba: { ...DEFAULT_GABA, enabled: true, rate: 200, gPeak: 3, erev: -35 },
  },
  {
    id: "gnrh-fi",
    model: "gnrh",
    label: "Excitability, as in Adams et al. 2018",
    note: "The paper's protocol: 500 ms steps of 0–30 pA in 2 pA increments, on top of −6 pA holding current that sits the cell at −70 mV; three hyperpolarizing steps are added so Rin can be measured. This cell fires its first spike at 18 pA, and only after 400 ms.",
    protocol: { mode: "family", first: -6, delta: 2, count: 19, list: "", sweepMs: 800, stepStart: 100, stepDur: 500 },
    glu: DEFAULT_GLU,
    gaba: GNRH_GABA,
  },
  {
    id: "gnrh-7f",
    model: "gnrh",
    label: "Fig. 7F steps (6 pA)",
    note: "The steps behind the paper's Fig. 7F, where the model is fit to the negative-feedback data: 0, 6, 12, 18, 24, 30 pA give 0, 0, 0, 1, 4 and 6 spikes, here as in the paper.",
    protocol: { mode: "family", first: 0, delta: 6, count: 6, list: "", sweepMs: 800, stepStart: 100, stepDur: 500 },
    glu: DEFAULT_GLU,
    gaba: GNRH_GABA,
  },
  {
    id: "gnrh-threshold",
    model: "gnrh",
    label: "Threshold, fine steps",
    note: "0.5 pA steps around rheobase (about 17 pA). At −70 mV this cell's Rin is 386 MΩ, so half a picoamp is 0.2 mV at steady state — and still decides whether it fires. Watch the latency: near threshold the first spike comes hundreds of milliseconds into the step.",
    protocol: { mode: "family", first: 14, delta: 0.5, count: 11, list: "", sweepMs: 800, stepStart: 100, stepDur: 500 },
    glu: DEFAULT_GLU,
    gaba: GNRH_GABA,
  },
];

export function presetsFor(model: ModelId): Preset[] {
  return PRESETS.filter((p) => p.model === model);
}
