/**
 * The cell models the app can run. A model is data: its channels with their
 * maximal conductances at a reference capacitance, reversal potentials, a
 * leak, an optional calcium pool, and the defaults and ranges the UI offers.
 * cell.ts turns a model plus the user's Cm and Rin into a runnable cell.
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
  /** published whole-cell values; `rin` is the published cell's Rin measured at rest (Ihold = 0) */
  defaults: { cm: number; rin: number; ihold: number };
  ranges: { rin: Range; cm: Range; ihold: Range; memNoise: Range };
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
 * Densities (mS/cm²) × 289.53 pF = nS.
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
  defaults: { cm: 289.53, rin: 32.13, ihold: 0 },
  ranges: {
    rin: { min: 10, max: 600, step: 1 },
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
  // Rin at rest of the published cell (g_L = 1 nS, 20 pF), active conductances
  // included: 505.9 MΩ. gnrh.test.ts recomputes it. Ihold −6 pA is the paper's
  // I_app, which holds the cell at −70 mV.
  defaults: { cm: 20, rin: 505.9, ihold: -6 },
  ranges: {
    rin: { min: 200, max: 5000, step: 10 },
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
