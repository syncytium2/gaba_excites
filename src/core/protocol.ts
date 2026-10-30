/**
 * Building the list of step amplitudes, and the presets.
 *
 * Two ways to say which steps to run: a family (first, increment, count) or a
 * free list ("-100, 0, 250, 600"). Both end up as the same `amps` array.
 */

import { GNRH, type ModelId } from "./models.ts";
import type { StepProtocol } from "./simulate.ts";
import type { Pulse } from "./stream.ts";
import { DEFAULT_GABA, DEFAULT_GLU, type SynInput } from "./synapses.ts";
import type { VCMeasure, VCProtocol } from "./vclamp.ts";

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

/**
 * The family's increment is set on the amplifier as a dial, a range switch
 * and a sign: |delta| = dial × range. The protocol keeps one signed `delta`;
 * the range is how the dial reads it.
 */
export const INC_RANGES = [0.1, 1, 10] as const;
export type IncRange = (typeof INC_RANGES)[number];
export const INC_DIAL = { min: 1, max: 20, step: 0.5 };

/** Whether `range` shows |delta| exactly on the dial. */
export function incRangeFits(delta: number, range: IncRange): boolean {
  const n = Math.abs(delta) / range;
  const k = n / INC_DIAL.step;
  return n >= INC_DIAL.min - 1e-9 && n <= INC_DIAL.max + 1e-9 && Math.abs(k - Math.round(k)) < 1e-6;
}

/** The range to show `delta` in: `preferred` if it fits, else ×1, ×10, ×0.1 in that order, else ×1. */
export function incRangeFor(delta: number, preferred: IncRange = 1): IncRange {
  if (incRangeFits(delta, preferred)) return preferred;
  return ([1, 10, 0.1] as const).find((r) => incRangeFits(delta, r)) ?? 1;
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
  /** holding current the preset needs, pA; when absent the preset leaves Ihold alone */
  ihold?: number;
  /**
   * the model's own settings the preset's numbers were measured at (ModelDef.knobs), e.g. the squid axon's
   * temperature; when absent the preset leaves them alone
   */
  knobs?: Record<string, number>;
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

/**
 * The oscilloscope's starting pulse train, one per model, because a pulse
 * that makes one cell fire is far too big or too small for the other.
 * Pyramidal: 700 pA, above its 561 pA rheobase (gaba.test.ts). GnRH: 24 pA on
 * its −6 pA holding current, which fires 4 spikes in 500 ms (Adams et al.
 * 2018 Fig. 7F; gnrh.test.ts). LTS: 100 pA from its own rest, which fires a
 * pair (lts.test.ts). Off until ticked.
 */
export const SCOPE_PULSE: Record<ModelId, Pulse> = {
  rs: { enabled: false, amp: 700, width: 500, period: 1500 },
  fs: { enabled: false, amp: 800, width: 500, period: 1500 },
  lts: { enabled: false, amp: 100, width: 500, period: 1500 },
  gnrh: { enabled: false, amp: 24, width: 500, period: 1500 },
  // Beta cell: 1 pA, just above the 0.9 pA rheobase of the glucose-free cell
  // (R_GK = 0; beta-app.test.ts). It bursts on its own in glucose, so the
  // pulse is not its lesson; off until ticked.
  betamouse: { enabled: false, amp: 1, width: 500, period: 1500 },
  // Squid axon: 1000 pA (10 µA/cm²), above the 700 pA where it starts to fire
  // repetitively at 6.3 °C (tools/neuron_oracle_hh.py; hh.test.ts).
  hh: { enabled: false, amp: 1000, width: 500, period: 1500 },
};

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
    id: "fs-fi",
    model: "fs",
    label: "F–I family",
    note: "Rheobase is 385 pA, then the rate climbs steeply: 101 Hz at 800 pA, 191 Hz at 1.6 nA. Initial and final rates are the same, because this cell has no slow current to build up: it does not adapt. Pin the curve, switch to the pyramidal cell, and compare.",
    protocol: { ...FI, first: -200, delta: 200, count: 10 },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
  },
  {
    id: "fs-noadapt",
    model: "fs",
    label: "Same step, no adaptation",
    note: "800 pA, the step that takes the pyramidal cell from 43 Hz at its start to 10 Hz by its end as the M current builds. Here the rate starts at 101 Hz and is still 101 Hz at the end. Same INa and IKd as the pyramidal cell, at twice the K⁺ density, which also narrows the spike (half-width 0.56 against 0.70 ms); no M current, so nothing adapts.",
    protocol: { ...FI, mode: "list", list: "800" },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
  },
  // Squid axon: every number below is a spike count NEURON's hh mechanism
  // gives on the same patch, which hh.test.ts requires the port to match
  // exactly (src/core/oracle/neuron_hh.json), plus the rheobase it pins.
  {
    id: "hh-fi",
    model: "hh",
    label: "F–I family: no slow firing",
    note: "Rheobase is 225 pA (2.25 µA/cm²). Up to 600 pA the axon fires once or twice as the step starts, then stops. At 700 pA it fires all the way through, at 59 Hz; at 2 nA, 86 Hz. There is no slow firing in between: between 600 and 700 pA the rate jumps from zero to 59 Hz. Compare the cortical cells, whose rate climbs from near zero.",
    protocol: { ...FI, mode: "list", list: "200, 300, 500, 600, 700, 1000, 2000" },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
    knobs: { celsius: 6.3 },
  },
  {
    id: "hh-temp",
    model: "hh",
    label: "Warmed to 18.5 °C",
    note: "The same axon at 18.5 °C, where every rate runs about 3.8 times faster (Q₁₀ = 3, the paper's p. 519). 500 pA no longer fires at all; 1000 pA fires 150 spikes in the 800 ms step (188 Hz), against 55 at 6.3 °C; 2000 pA, 202. The spike itself is shorter: in the paper's Table 4, a spike's fall from its peak back to rest takes 2.21 ms at 6.3 °C and 0.61 ms at 18.5 °C, and this model gives the same to within 0.01 ms. Turn the temperature control to watch it change.",
    protocol: { ...FI, mode: "list", list: "500, 1000, 2000" },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
    knobs: { celsius: 18.5 },
  },
  {
    id: "hh-anode",
    model: "hh",
    label: "Anode break: release fires",
    note: "Steps of −200 to −500 pA for 800 ms, taking the axon only 2 to 7 mV below rest. Nothing fires during any step. On release, −200 pA does nothing; −300, −400 and −500 pA each fire one spike, 4.7–7.1 ms later. Hodgkin and Huxley's explanation (p. 537): “anodal polarization decreases the potassium conductance and removes inactivation”, so the membrane comes back to rest with less K⁺ current and more Na⁺ current than it had there. Their own calculation released the axon from 30 mV below rest, beyond E_K, which takes more current than the siren allows here; it gave a spike 112.1 mV high (Table 4), and this model gives 112.0 (the methods page has the comparison).",
    protocol: { ...FI, mode: "list", list: "-200, -300, -400, -500" },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
    knobs: { celsius: 6.3 },
  },
  {
    id: "lts-rebound",
    model: "lts",
    label: "Rebound: hyperpolarization excites",
    note: "Held at −64 mV by 60 pA, where the T-type Ca²⁺ channels sit inactivated. Step down for 500 ms: nothing fires during any step. On release, −25 pA (to −70 mV) does nothing; −50 pA (to −80 mV) fires a spike 88 ms later; −75 and −100 pA fire two. The hyperpolarization removed the inactivation, and the T current fired the cell on the way back. The table's “After step” column counts these spikes; the F–I curve counts only spikes during a step.",
    protocol: { mode: "list", first: 0, delta: -25, count: 5, list: "0, -25, -50, -75, -100", sweepMs: 1500, stepStart: 200, stepDur: 500 },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
    ihold: 60,
  },
  {
    id: "lts-rebound-rest",
    model: "lts",
    label: "No rebound from its own rest",
    note: "The same 500 ms steps down, from the cell's own rest at −84 mV (0 pA). Release from −95 mV fires nothing, though release from −80 mV fired the held cell. At −84 mV the T channels are already de-inactivated, so there is nothing for the hyperpolarization to remove. Whether hyperpolarization excites depends on where rest is.",
    protocol: { mode: "list", first: 0, delta: -10, count: 4, list: "0, -10, -20, -30", sweepMs: 1500, stepStart: 200, stepDur: 500 },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
    ihold: 0,
  },
  {
    id: "lts-burst",
    model: "lts",
    label: "Bursts from rest",
    note: "From its own rest (−84 mV) the T channels are ready, so depolarization sets off a calcium-driven burst. Rheobase is 39 pA. At 100 pA it fires a pair 25 ms apart, then nothing more. At 150 pA it fires a pair, then slows to a few spikes 200 ms apart. Rin at rest is 446 MΩ, with a leak reversing at −85 mV.",
    protocol: { mode: "family", first: 0, delta: 50, count: 5, list: "", sweepMs: 1000, stepStart: 100, stepDur: 800 },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
    ihold: 0,
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
  {
    // The beta cell is the oscilloscope's (ModelDef.scopeOnly): its rhythms run
    // 30 s to 5 min, longer than any step sweep. This preset exists so the
    // app's model switch and reset have a protocol to hold; it is never run.
    id: "beta-none",
    model: "betamouse",
    label: "None: this cell is shown on the oscilloscope",
    note: "The beta cell fires on its own in glucose, with rhythms from 30 s to 5 min, so it is shown on the oscilloscope, not in step sweeps.",
    protocol: { mode: "list", first: 0, delta: 1, count: 1, list: "0", sweepMs: 1000, stepStart: 0, stepDur: 0 },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
    ihold: 0,
  },
];

export function presetsFor(model: ModelId): Preset[] {
  return PRESETS.filter((p) => p.model === model);
}

/**
 * The oscilloscope's presets for a cell whose lessons are its own rhythms: a
 * setting of the model's knobs, and a time base and speed to watch them at.
 * Like the step presets, each belongs to one model and quotes numbers the
 * tests measure (beta.test.ts, beta-bursts.test.ts, beta-glycolytic.test.ts),
 * all from Bertram et al. (2004).
 */
export interface ScopePattern {
  id: string;
  model: ModelId;
  label: string;
  /** what to look at; it quotes measured numbers */
  note: string;
  knobs: Record<string, number>;
  msPerDiv: number;
  speed: number;
}

export const SCOPE_PATTERNS: ScopePattern[] = [
  {
    id: "beta-fast",
    model: "betamouse",
    label: "Regular bursting (Fig. 3)",
    note: "Glucose high enough (R_GK 0.4) that glycolysis holds steady. Bursts of spikes every 32 s, set by calcium alone: each burst raises Ca²⁺, which opens K(Ca) channels and, more slowly, raises ADP to open K_ATP channels, until the cell falls silent and both recover.",
    knobs: { rGK: 0.4, gKATP: 25, gKCa: 0.6 },
    msPerDiv: 5000,
    speed: 10,
  },
  {
    id: "beta-compound",
    model: "betamouse",
    label: "Compound bursting (Fig. 5)",
    note: "Lower glucose (R_GK 0.2) and glycolysis oscillates on its own, about every 5 min. Each pulse of glycolysis raises ATP, closes K_ATP and starts an episode of a few bursts about 32 s apart; then a long silence until the next pulse.",
    knobs: { rGK: 0.2, gKATP: 25, gKCa: 0.6 },
    msPerDiv: 60000,
    speed: 30,
  },
  {
    id: "beta-accordion",
    model: "betamouse",
    label: "Accordion bursting (Fig. 6)",
    note: "As compound bursting, with a little less K_ATP (23 nS): the bursts never stop, but their spacing swells and shrinks, between about 18 and 30 s, with each glycolytic pulse.",
    knobs: { rGK: 0.2, gKATP: 23, gKCa: 0.6 },
    msPerDiv: 60000,
    speed: 30,
  },
  {
    id: "beta-glycolytic",
    model: "betamouse",
    label: "Glycolytic bursting (Fig. 7)",
    note: "Less K(Ca) (100 pS) than calcium needs to end a burst, so each glycolytic pulse sets off one long burst, about every 5.6 min, which ends only when calcium has slowed ATP production enough to reopen K_ATP.",
    knobs: { rGK: 0.2, gKATP: 27, gKCa: 0.1 },
    msPerDiv: 60000,
    speed: 30,
  },
];

export function patternsFor(model: ModelId): ScopePattern[] {
  return SCOPE_PATTERNS.filter((p) => p.model === model);
}

// ---------------------------------------------------------------- voltage clamp

/**
 * A voltage-clamp preset: a protocol and where to measure it, as an
 * experimenter would set them up. Most are the standard protocols, so they
 * apply to every model; their notes say what to look at and quote no measured
 * number, so no cell's number shows on another (the rule for step presets).
 * A preset that reproduces one paper's experiment names its model and is
 * offered only on that cell.
 * Nothing is drawn until the protocol runs: the curves come only from what is
 * measured (the owner's choice, 2026-10-29).
 */
export interface VCPreset {
  id: string;
  /** set for a preset that belongs to one cell (a paper's own protocol); absent, it suits every model */
  model?: ModelId;
  label: string;
  note: string;
  protocol: VCProtocol;
  /** one or two measurements: the first is the one normalized and fitted */
  measures: VCMeasure[];
  /** how the first measurement is normalized: by its largest value (I/Imax) or as a conductance (G/Gmax) */
  norm: "I" | "G";
  /** the reversal G = I/(V − E_rev) uses, mV */
  erev?: number;
  /** fit a Boltzmann to the normalized first measurement (not for a tail family, which is linear) */
  fit?: boolean;
}

export const VC_PRESETS: VCPreset[] = [
  {
    id: "vc-act",
    label: "Activation (I–V)",
    note: "Steps from −80 mV to +40 mV. M1 takes Peak −, the most negative current, early in each step: the peak inward Na⁺ current, where the cell has it. M2 takes the Mean at the end, the sustained current (mostly K⁺). Normalized as G/Gmax, with E_rev = +50 mV, the sodium reversal of the cortical cells.",
    protocol: { hold: -80, segments: [{ dur: 10, v: -80 }, { dur: 50, v: 0 }, { dur: 20, v: -80 }], vary: { seg: 1, what: "v", first: -80, delta: 10, count: 13 } },
    measures: [
      { seg: 1, from: 0.2, to: 10, kind: "peakIn" },
      { seg: 1, from: 40, to: 50, kind: "mean" },
    ],
    norm: "G",
    erev: 50,
  },
  {
    id: "vc-inact",
    label: "Steady-state inactivation",
    note: "A 100 ms prepulse from −120 to −10 mV, then the same test step to 0 mV. The peak current at the test shrinks as the prepulse inactivates the channels; normalized to its largest, it traces the availability curve. After the most depolarized prepulses the K⁺ current, still open, outweighs what sodium is left: block the K⁺ channels, as TEA or Cs⁺ would, for a clean curve.",
    protocol: { hold: -80, segments: [{ dur: 10, v: -80 }, { dur: 100, v: -120 }, { dur: 10, v: 0 }, { dur: 10, v: -80 }], vary: { seg: 1, what: "v", first: -120, delta: 10, count: 12 } },
    measures: [{ seg: 2, from: 0.2, to: 5, kind: "peakIn" }],
    norm: "I",
  },
  {
    id: "vc-tails",
    label: "Tail currents",
    note: "A step to +20 mV opens the channels; then a family of tail potentials. Measured just after the step back, before the channels close, the tail current is linear in the tail potential, and where it crosses zero is the reversal potential of what was open.",
    protocol: { hold: -80, segments: [{ dur: 10, v: -80 }, { dur: 20, v: 20 }, { dur: 50, v: -100 }, { dur: 10, v: -80 }], vary: { seg: 2, what: "v", first: -100, delta: 10, count: 9 } },
    measures: [{ seg: 2, from: 0.5, to: 1.5, kind: "mean" }],
    norm: "I",
    fit: false,
  },
  {
    id: "vc-recovery",
    label: "Recovery from inactivation",
    note: "Two steps to 0 mV with a gap at −80 mV that lengthens from sweep to sweep. The second step's peak grows back as the channels recover during the gap; its time course is the recovery. Fast channels recover in a few milliseconds, so the gaps start short.",
    protocol: { hold: -80, segments: [{ dur: 10, v: -80 }, { dur: 20, v: 0 }, { dur: 0.2, v: -80 }, { dur: 10, v: 0 }, { dur: 10, v: -80 }], vary: { seg: 2, what: "dur", first: 0.2, delta: 0.4, count: 12 } },
    measures: [{ seg: 3, from: 0.2, to: 5, kind: "peakIn" }],
    norm: "I",
  },
  // Hodgkin & Huxley (1952) J Physiol 117:500, Figs. 3 and 6: the conductance families the model was fitted to.
  // Their depolarizations, 6 to 109 mV from rest, were uneven; these are the same range in even steps.
  {
    id: "hh-vc-gk",
    model: "hh",
    label: "K⁺ conductance (Hodgkin & Huxley Fig. 3)",
    note: "The experiment behind the potassium equations. Hodgkin and Huxley's Fig. 3 (p. 508) follows the rise of K⁺ conductance during depolarizations of 6 to 109 mV from rest, on axon 17 at 6–7 °C; here, steps of 10 to 110 mV from −65 mV. They removed the sodium current by replacing sodium with choline: block INa with its switch under CHANNELS for the same view. M1 is the current at the end of each step, as conductance with E_K = −77 mV. The rise starts slowly and then speeds up, which is why they raised n to the fourth power (pp. 506–507).",
    protocol: { hold: -65, segments: [{ dur: 5, v: -65 }, { dur: 12, v: 0 }, { dur: 5, v: -65 }], vary: { seg: 1, what: "v", first: -55, delta: 10, count: 11 } },
    measures: [{ seg: 1, from: 10, to: 12, kind: "mean" }],
    norm: "G",
    erev: -77,
  },
  {
    id: "hh-vc-gna",
    model: "hh",
    label: "Na⁺ conductance (Hodgkin & Huxley Fig. 6)",
    note: "The experiment behind the sodium equations. Hodgkin and Huxley's Fig. 6 (p. 513) shows sodium conductance during the same depolarizations, rising and then falling as it inactivates; here, steps of 10 to 100 mV from −65 mV. Block IK under CHANNELS to see the sodium current alone. M1 takes Peak −, the most negative current, as conductance with E_Na = +50 mV. Steps much past +35 mV sit so close to E_Na that the current, and the conductance worked out from it, become small and noisy.",
    protocol: { hold: -65, segments: [{ dur: 5, v: -65 }, { dur: 12, v: 0 }, { dur: 5, v: -65 }], vary: { seg: 1, what: "v", first: -55, delta: 10, count: 10 } },
    measures: [{ seg: 1, from: 0.1, to: 4, kind: "peakIn" }],
    norm: "G",
    erev: 50,
  },
];

/** The voltage-clamp presets a model is offered: the standard ones, and any that belong to it. */
export function vcPresetsFor(model: ModelId): VCPreset[] {
  return VC_PRESETS.filter((p) => !p.model || p.model === model);
}
