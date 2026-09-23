/**
 * The cell models the app can run. A model is data: its channels with their
 * maximal conductances at a reference capacitance, reversal potentials, a
 * leak, an optional calcium pool, and the defaults and ranges the UI offers.
 * cell.ts turns a model plus the user's Cm and leak into a runnable cell.
 */

import {
  boltzmann,
  makeGated,
  makeKCa,
  makeKd,
  makeM,
  makeMarkovNa,
  makeNa,
  sigmoidRate,
  tauBell,
  tauGauss,
  type Channel,
} from "./channels.ts";

export type ModelId = "rs" | "gnrh";

export interface ModelChannel {
  channel: Channel;
  /** maximal conductance at the model's reference capacitance, nS */
  gbar: number;
  /** reversal potential, mV */
  erev: number;
  /** contributes to I_Ca, which feeds the calcium pool */
  carriesCa?: boolean;
}

/**
 * Cytosolic calcium (Adams 2018 Eq. 22):
 *   dCa/dt = f · (−α·I_Ca − kp·Ca² / (Kp² + Ca²))        Ca in µM, I in pA
 */
export interface CaPool {
  f: number;
  alpha: number;
  kp: number;
  Kp: number;
}

export interface Range {
  min: number;
  max: number;
  step: number;
}

export interface ModelDef {
  id: ModelId;
  label: string;
  /** one line for the UI under the selector */
  blurb: string;
  citation: string;
  doi: string;
  /** capacitance at which `gbar` values are stated, pF. Scaling Cm scales every gbar. */
  cmRef: number;
  eLeak: number;
  channels: () => ModelChannel[];
  pool?: CaPool;
  /**
   * published whole-cell values. `gLeak` is the model's own leak conductance in
   * nS at its published Cm; Rin is not a default because it is not an input —
   * it is measured from whatever cell the leak and channels make. `eGaba` is
   * the GABA_A reversal the GABA controls open on for this cell — adjustable in
   * the app like everything else.
   */
  defaults: { cm: number; gLeak: number; ihold: number; eGaba: number };
  /** where the eGaba default comes from */
  eGabaSource: string;
  /**
   * GABA PSC kinetics and size for this cell, where a measurement exists;
   * otherwise the generic defaults in synapses.ts apply. Rise 0 = instantaneous.
   */
  gabaKinetics?: { tauRise: number; tauDecay: number; gPeak: number };
  /** where the gabaKinetics come from, for the UI */
  gabaKineticsSource?: string;
  ranges: { gLeak: Range; cm: Range; ihold: Range; memNoise: Range };
  /** rheobase bisection tolerance, pA — 1 pA is fine resolution for one cell and coarse for the other */
  rheobaseTol: number;
  /** settle before each run, ms — long enough for the slowest gate */
  settleMs: number;
  /** how far to trust it, in one sentence, shown in the UI */
  validation: string;
}

// ---------------------------------------------------------------- RS pyramidal

/**
 * Regular-spiking pyramidal cell, ModelDB 123623 `sPY_template` (Pospischil et
 * al. 2008). diam = L = 96 µm → π·96² µm² = 28 953 µm² → 289.53 pF at 1 µF/cm².
 * Densities (mS/cm²) × 289.53 pF = nS. The leak is g_pas = 0.1 mS/cm², 28.95 nS,
 * which gives Rin = 32.1 MΩ at rest (cell.test.ts).
 */
const RS_CM = (Math.PI * 96 * 96) / 100;

export const RS: ModelDef = {
  id: "rs",
  label: "Cortical pyramidal (regular spiking)",
  blurb: "Pospischil et al. 2008: Traub INa and IKd, slow M-current for adaptation.",
  citation: "Pospischil M, Toledo-Rodriguez M, Monier C, et al. (2008) Biol Cybern 99:427–441",
  doi: "10.1007/s00422-008-0263-8",
  cmRef: RS_CM,
  eLeak: -70,
  channels: () => [
    { channel: makeNa(-55), gbar: 50 * RS_CM, erev: 50 },
    { channel: makeKd(-55), gbar: 5 * RS_CM, erev: -100 },
    { channel: makeM(1000), gbar: 0.07 * RS_CM, erev: -100 },
  ],
  defaults: { cm: 289.53, gLeak: 0.1 * RS_CM, ihold: 0, eGaba: -80 },
  eGabaSource: "−80 mV: a conventional hyperpolarizing GABA_A reversal for an adult cortical neuron (the owner's default)",
  ranges: {
    gLeak: { min: 0, max: 150, step: 0.5 },
    cm: { min: 20, max: 600, step: 1 },
    ihold: { min: -500, max: 1000, step: 5 },
    memNoise: { min: 0, max: 300, step: 5 },
  },
  rheobaseTol: 1,
  settleMs: 3000,
  validation: "Spike counts match NEURON running the original ModelDB mechanisms exactly; spike times within 0.2 ms.",
};

// ---------------------------------------------------------------- GnRH

/**
 * GnRH neuron, negative-feedback (OVX+E AM) parameter set of Adams C,
 * Stroberg W, DeFazio RA, Schnell S, Moenter SM (2018) J Neurosci 38:1249,
 * itself a modification of Moran et al. 2016 and LeBeau et al. 2000.
 * Conductances are Table 1's Step 2 ("g neg FB") column, stated for the
 * published Cm of 20 pF; gate parameters are Table 2 with I_A's V½
 * inactivation at −69.8 mV (Table 1, Step 2); I_NaF is Table 3.
 *
 * Transcribed from the paper, not from code — there is no public code to run
 * against. src/core/gnrh.test.ts checks it against what the paper reports.
 */
const EK_G = -101;
const ENA_G = 54;
const ECA_G = 82.5;

export const GNRH: ModelDef = {
  id: "gnrh",
  label: "GnRH neuron (mouse, negative feedback)",
  blurb: "Adams et al. 2018: Markov INaF, INaP, IA, IK, T- and HVA-type ICa, IS, Ih, IKCa, with a calcium pool.",
  citation: "Adams C, Stroberg W, DeFazio RA, Schnell S, Moenter SM (2018) J Neurosci 38:1249–1263",
  doi: "10.1523/JNEUROSCI.2988-17.2017",
  cmRef: 20,
  eLeak: -65,
  channels: () => [
    {
      channel: makeMarkovNa("naf", "INaF (Markov)", {
        alpha: sigmoidRate(55, 6.4, -15.9),
        beta: sigmoidRate(60, 32, 10),
        r3: sigmoidRate(30, 77.5, 12),
        r1: 1.0,
        r2: 0.2,
        r4: 0.05,
      }),
      gbar: 758,
      erev: ENA_G,
    },
    {
      channel: makeGated("nap", "INaP", [
        { name: "m", inf: boltzmann(-41.5, -3.0), tau: 0.4 },
        { name: "h", inf: boltzmann(-47.4, 8.2), tau: tauBell(67.3, -27.5, 67.3, 27.5, 574.5, 62.6) },
      ], (g, o) => g[o] * g[o + 1]),
      gbar: 0.39,
      erev: ENA_G,
    },
    {
      channel: makeGated("a", "IA", [
        { name: "m", inf: boltzmann(-29.4, -6.64), tau: tauBell(-2.91, 25.6, 65.3, -10.6, 1, 0.0527) },
        { name: "h1", inf: boltzmann(-69.8, 4.26), tau: 7.67 },
        { name: "h2", inf: boltzmann(-69.8, 4.26), tau: 100 },
      ], (g, o) => g[o] * (0.8 * g[o + 1] + 0.2 * g[o + 2])),
      gbar: 313,
      erev: EK_G,
    },
    {
      channel: makeGated("k", "IK", [
        { name: "m", inf: boltzmann(-19.7, -12.3), tau: tauBell(23.8, 18, 23.8, -18, 10.6, 0) },
      ], (g, o) => g[o] ** 4),
      gbar: 57,
      erev: EK_G,
    },
    {
      channel: makeGated("lva", "ILVA (T-type)", [
        { name: "m", inf: boltzmann(-51.4, -4.07), tau: tauBell(31.3, 10.1, 31.3, -10.1, 109, 0.0391) },
        { name: "h", inf: boltzmann(-80.1, 5.5), tau: 250 },
      ], (g, o) => g[o] * g[o] * g[o + 1]),
      gbar: 0.0679,
      erev: ECA_G,
      carriesCa: true,
    },
    {
      channel: makeGated("hva", "IHVA", [
        { name: "m", inf: boltzmann(-11, -7), tau: 0.816 },
        { name: "h1", inf: boltzmann(-36.6, 14.6), tau: 53.4 },
        { name: "h2", inf: boltzmann(-36.6, 14.6), tau: 728 },
      ], (g, o) => g[o] * (0.2 * g[o + 1] + 0.8 * g[o + 2])),
      gbar: 5.16,
      erev: ECA_G,
      carriesCa: true,
    },
    {
      channel: makeGated("s", "IS (slow inward)", [
        { name: "m", inf: boltzmann(-45, -12), tau: 1500 },
      ], (g, o) => g[o]),
      gbar: 0.18,
      erev: ECA_G,
      carriesCa: true,
    },
    {
      channel: makeGated("h", "Ih", [
        { name: "h1", inf: boltzmann(-77.4, 9.2), tau: tauGauss(-89.8, 11.6, 35.8, 7.6) },
        { name: "h2", inf: boltzmann(-77.4, 9.2), tau: tauGauss(-82.6, 25.7, 370.9, 54.1) },
      ], (g, o) => 0.384 * g[o] + 0.616 * g[o + 1]),
      gbar: 1,
      erev: -40,
    },
    { channel: makeKCa("kca", "IKCa", 1.0), gbar: 1.18, erev: EK_G },
  ],
  pool: { f: 0.0025, alpha: 0.00185, kp: 0.265, Kp: 1.2 },
  // g_L = 1 nS (Table 1). Rin at rest of the published cell, active
  // conductances included, is then 505.9 MΩ; gnrh.test.ts recomputes it.
  // Ihold −6 pA is the paper's I_app, which holds the cell at −70 mV.
  //
  // E_GABA −36.5 mV: measured in adult mouse GnRH neurons with gramicidin
  // perforated patch, which leaves intracellular chloride undisturbed —
  // "E_GABA measured 100 msec after GABA application was −36.5 ± 1.2 mV (n = 16
  // cells from 13 adult diestrous females)", DeFazio, Heger, Ojeda & Moenter
  // (2002) Mol Endocrinol 16:2872, doi:10.1210/me.2002-0163. Depolarized
  // relative to rest, which is why GABA excites these cells.
  defaults: { cm: 20, gLeak: 1, ihold: -6, eGaba: -36.5 },
  eGabaSource: "−36.5 ± 1.2 mV, gramicidin perforated patch in adult mouse GnRH neurons: DeFazio et al. (2002) Mol Endocrinol 16:2872",
  // GABA PSCs in adult female GnRH neurons, Jaime, DeFazio & Moenter (2026)
  // J Neuroendocrinol 38:e70144: isolated PSCs decay with τ = 9.9 ± 0.25 ms
  // (7.4 ± 0.13 ms at 3 weeks), recorded with a pipette chloride chosen to
  // match the gramicidin E_GABA, at 30–31 °C. Peak ≈ 1 nS: about −30 pA at
  // −70 mV (their Fig. 2B, read by eye) over a ~33.5 mV driving force; they
  // call 1–2 nS physiological. Instantaneous rise, as in their dynamic clamp.
  // Caveat (the owner's): decay τ depends on chloride, and intracellular
  // chloride in GnRH neurons was never measured directly — only E_GABA was —
  // so these are the best available, not ground truth. lit/notes/jaime2026.md.
  gabaKinetics: { tauRise: 0, tauDecay: 10, gPeak: 1 },
  gabaKineticsSource: "decay 10 ms (9.9 ± 0.25 ms, adult females), peak ≈ 1 nS, instantaneous rise: Jaime et al. (2026) J Neuroendocrinol 38:e70144",
  ranges: {
    gLeak: { min: 0, max: 5, step: 0.05 },
    cm: { min: 5, max: 60, step: 0.5 },
    ihold: { min: -50, max: 50, step: 1 },
    memNoise: { min: 0, max: 30, step: 0.5 },
  },
  rheobaseTol: 0.1,
  settleMs: 8000,
  validation:
    "Transcribed from the paper (no public code). Checked against the paper's reported rest (−70 mV at −6 pA) and its Fig. 7F spike counts.",
};

export const MODELS: Record<ModelId, ModelDef> = { rs: RS, gnrh: GNRH };
export const MODEL_LIST: ModelDef[] = [RS, GNRH];
