/**
 * The human pancreatic beta cell: Riz M, Braun M, Pedersen MG (2014) "Mathematical modeling of heterogeneous
 * electrophysiological responses in human β-cells", PLoS Comput Biol 10:e1003389,
 * doi:10.1371/journal.pcbi.1003389, which adds SK channels, submembrane and cytosolic calcium, and a GABA_A
 * current to Pedersen MG (2010) "A biophysical model of electrical activity in human β-cells", Biophys J
 * 99:3200–3207, doi:10.1016/j.bpj.2010.09.004.
 *
 * Transcribed from the papers: Riz 2014 Eqs. 13–34 and Table 1, Pedersen 2010 Eqs. 1–9 and Table 1;
 * lit/notes/riz2014.md holds the transcription. Pedersen built the voltage-gated currents from the
 * voltage-clamp recordings of human beta cells by Braun et al. (2008) Diabetes 57:1618: peak I–V curves for
 * activation, Braun's own inactivation fits. Riz's glycolytic oscillator (its Fig. 6) is not ported.
 *
 * Units: the papers give currents in pA/pF and conductances in nS/pF, with Cm = 10 pF. Here conductances are
 * nS at that 10 pF, so each density is × 10; the app's Cm control scales them all.
 *
 * Pedersen 2010 is this model with the SK current off, HERG on (0.2 nS/pF), g_K(ATP) = 0.015 nS/pF and the
 * P/Q-type activation slope −10 mV instead of −6 (his Table 1 and code): `humanBeta(PEDERSEN_2010)`.
 */

import { boltzmann, makeGated, type Channel, type GateSpec } from "./channels.ts";
import { rizPool } from "./pools.ts";
import type { ModelDef } from "./models.ts";

/** Every parameter of the model, as the papers state them (densities per pF). Riz 2014 Table 1. */
export const RIZ_2014 = {
  VK: -75, VNa: 70, VCa: 65, VCl: -40,
  gSK: 0.1, kSK: 0.57, nSK: 5.2,
  gBK: 0.02, tmBK: 2, VmBK: 0, nmBK: -10, BBK: 20,
  gKv: 1.0, tmKv0: 2, VmKv: 0, nmKv: -10,
  gHERG: 0, VmHERG: -30, nmHERG: -10, VhHERG: -42, nhHERG: 17.5, tmHERG: 100, thHERG: 50,
  gNa: 0.4, thNa: 2, VmNa: -18, nmNa: -5, VhNa: -42, nhNa: 6,
  gCaL: 0.14, thCaL: 20, VmCaL: -25, nmCaL: -6, phiCaL: 57,
  gCaPQ: 0.17, VmCaPQ: -10, nmCaPQ: -6,
  gCaT: 0.05, thCaT: 7, VmCaT: -40, nmCaT: -4, VhCaT: -64, nhCaT: 8,
  gKATP: 0.01, gGABAR: 0,
  gLeak: 0.015, VLeak: -30,
  // calcium, Eqs. 14–15 and 32–34: µM, ms, litres
  f: 0.01, alpha: 5.18e-15, volC: 1.15e-12, volM: 1e-13, B: 0.1,
  jSercaMax: 0.06, kSerca: 0.27, jPmcaMax: 0.021, kPmca: 0.5, jLeak: 0.00094, jNcx0: 0.01867,
};
export type HumanParams = typeof RIZ_2014;

/** Pedersen 2010: no SK, HERG on, more K_ATP (6 mM glucose), the P/Q-type slope of his Table 1. */
export const PEDERSEN_2010: Partial<HumanParams> = { gSK: 0, gHERG: 0.2, gKATP: 0.015, nmCaPQ: -10 };

/** Cm, pF: "Cm = 10 pF is the capacitance of the plasma membrane" (Riz 2014, citing Braun et al. 2008). */
export const HUMAN_CM = 10;

/** "Instantaneous" activation: a gate with τ = 1e-9 ms, set to m∞ at the new V each step, as for the mouse cell. */
const INSTANT = 1e-9;

/**
 * τ_mKv(V), Riz 2014 Eq. 31 (Pedersen 2010 Eq. 8): τ_mKv,0 + 10·exp((−20 mV − V)/6 mV) ms for V ≥ −26.6 mV,
 * τ_mKv,0 + 30 ms below. (The authors' code writes τ_mKv,0 + 10·exp(min(ln 3, (−20 − V)/6)), which differs
 * from the paper by the 0.13% jump at −26.6 mV that 10·e^1.1 ≠ 30 leaves.)
 */
export function tauKv(tm0: number): (v: number) => number {
  return (v) => (v >= -26.6 ? tm0 + 10 * Math.exp((-20 - v) / 6) : tm0 + 30);
}

/**
 * L-type inactivation, Riz 2014 Eq. 30 (Pedersen 2010 Eq. 7): inactivation proportional to the activated L-type
 * current, h∞ = max(0, min(1, 1 + m∞(V)·(V − V_Ca)/57 mV)).
 */
export function hCaLInf(p: HumanParams): (v: number) => number {
  const m = boltzmann(p.VmCaL, p.nmCaL);
  return (v) => Math.max(0, Math.min(1, 1 + (m(v) * (v - p.VCa)) / p.phiCaL));
}

/**
 * BK, Riz 2014 Eq. 17 (Pedersen 2010 Eq. 9): I_BK = g_BK·m_BK·(−I_Ca(V) + B_BK)·(V − V_K), g_BK in nS/pA.
 * The channels sit in the Ca²⁺ channels' microdomain, so their Ca²⁺ is taken as proportional to the Ca²⁺
 * current; B_BK (pA/pF) is the Ca²⁺-independent part. Written here as conductance g_BK·B_BK (nS/pF) times an
 * open fraction m_BK·(−I_Ca + B_BK)/B_BK, which is 1 at m_BK = 1 with no Ca²⁺ current and above 1 during a spike.
 */
export function makeHumanBK(p: HumanParams): Channel {
  const gate = makeGated("bk", "IBK", [{ name: "m", inf: boltzmann(p.VmBK, p.nmBK), tau: p.tmBK }], (g, o) => g[o]);
  const drive = (iCa: number | undefined) => {
    if (iCa === undefined) throw new Error("IBK reads the cell's Ca²⁺ current, and was not given it");
    return (-iCa + p.BBK) / p.BBK;
  };
  return {
    ...gate,
    readsICa: true,
    open: (s, o, _ca, iCa) => s[o] * drive(iCa),
    openInf: (v, _ca, iCa) => gate.openInf(v, 0) * drive(iCa),
  };
}

/** SK, Riz 2014 Eq. 16: g_SK·Ca_m^n/(K_SK^n + Ca_m^n), instantaneous in the submembrane calcium. */
export function makeSK(kSK: number, n: number): Channel {
  const f = (ca: number) => {
    const c = Math.max(ca, 0) ** n;
    return c / (kSK ** n + c);
  };
  return {
    id: "sk",
    label: "ISK",
    nGates: 0,
    gateNames: [],
    init() {},
    advance() {},
    open: (_s, _o, ca) => f(ca),
    openInf: (_v, ca) => f(ca),
  };
}

/** A conductance always open: K_ATP (Eq. 24) and the GABA_A current of bath GABA (Eq. 26). */
function makeOpen(id: string, label: string): Channel {
  return { id, label, nGates: 0, gateNames: [], init() {}, advance() {}, open: () => 1, openInf: () => 1 };
}

const gated = (id: string, label: string, gates: GateSpec[]) =>
  makeGated(id, label, gates, gates.length === 1 ? (g, o) => g[o] : (g, o) => g[o] * g[o + 1]);

export function humanBeta(over: Partial<HumanParams> = {}): ModelDef {
  const base: HumanParams = { ...RIZ_2014, ...over };
  const S = HUMAN_CM;
  return {
    id: "betahuman",
    thresholdDvdt: 0.5,
    label: "Pancreatic beta cell (human)",
    short: "β-cell (human)",
    blurb:
      "Riz, Braun & Pedersen 2014, on Pedersen 2010: Na⁺, three Ca²⁺ currents, Kv, BK, SK, HERG and K_ATP, built from voltage-clamp recordings of human beta cells. Spikes on its own in glucose; GABA excites it.",
    citation: "Riz M, Braun M, Pedersen MG (2014) PLoS Comput Biol 10:e1003389; Pedersen MG (2010) Biophys J 99:3200–3207",
    doi: "10.1371/journal.pcbi.1003389",
    cmRef: S,
    eLeak: base.VLeak,
    knobsTitle: "GLUCOSE & GABA",
    // In pS/pF, so the papers' values are whole numbers (0.010 nS/pF is 10 pS/pF); the model converts (paramsFromKnobs).
    knobs: [
      {
        id: "gKATP",
        label: "gK(ATP)",
        unit: "pS/pF",
        min: 0,
        max: 40,
        step: 1,
        value: base.gKATP * 1000,
        note: "The K_ATP conductance, the model's stand-in for glucose: lower is more glucose. 10 pS/pF (0.010 nS/pF) in Riz et al. 2014 (Table 1); 15 at 6 mM glucose in Pedersen 2010, from Misler et al. 1992.",
      },
      {
        id: "gGABAR",
        label: "GABA",
        unit: "pS/pF",
        min: 0,
        max: 400,
        step: 5,
        value: base.gGABAR * 1000,
        note: "The GABA_A conductance of GABA in the bath, reversing at E_Cl = −40 mV, so it depolarizes. Riz et al. 2014: about 300 pS/pF for 1 mM GABA (9.4 pA/pF at −70 mV, Braun et al. 2010), 100 for 100 µM, 20 for 10 µM.",
      },
      {
        id: "gSK",
        label: "gSK",
        unit: "pS/pF",
        min: 0,
        max: 200,
        step: 5,
        value: base.gSK * 1000,
        note: "The Ca²⁺-activated SK conductance: 100 pS/pF in Riz et al. 2014, from a ~10 pA current at −60 mV; absent (0) in Pedersen 2010.",
      },
      {
        id: "gHERG",
        label: "gHERG",
        unit: "pS/pF",
        min: 0,
        max: 500,
        step: 10,
        value: base.gHERG * 1000,
        note: "The HERG K⁺ conductance: 0 in Riz et al. 2014, which tested whether SK could stand in for it; 200 pS/pF in Pedersen 2010, lowered from Rosati et al. 2000's ~500 measured in 40 mM K⁺.",
      },
    ],
    channels: (k) => {
      const p: HumanParams = { ...base, ...paramsFromKnobs(k) };
      return [
        // Eqs. 20, 29: m instantaneous (from Braun 2008's peak I–V), h from Braun's fit, τ 2 ms
        {
          channel: gated("na", "INa", [
            { name: "m", inf: boltzmann(p.VmNa, p.nmNa), tau: INSTANT },
            { name: "h", inf: boltzmann(p.VhNa, p.nhNa), tau: p.thNa },
          ]),
          gbar: p.gNa * S, ion: "na", erev: p.VNa,
        },
        // Eqs. 21, 30: L-type, instantaneous activation, inactivation that follows its own current, τ 20 ms
        {
          channel: gated("cal", "ICa(L)", [
            { name: "m", inf: boltzmann(p.VmCaL, p.nmCaL), tau: INSTANT },
            { name: "h", inf: hCaLInf(p), tau: p.thCaL },
          ]),
          gbar: p.gCaL * S, ion: "ca", erev: p.VCa, carriesCa: true,
        },
        // Eq. 22: P/Q-type, instantaneous activation, no inactivation
        {
          channel: gated("capq", "ICa(P/Q)", [{ name: "m", inf: boltzmann(p.VmCaPQ, p.nmCaPQ), tau: INSTANT }]),
          gbar: p.gCaPQ * S, ion: "ca", erev: p.VCa, carriesCa: true,
        },
        // Eq. 23: T-type, instantaneous activation, inactivation τ 7 ms
        {
          channel: gated("cat", "ICa(T)", [
            { name: "m", inf: boltzmann(p.VmCaT, p.nmCaT), tau: INSTANT },
            { name: "h", inf: boltzmann(p.VhCaT, p.nhCaT), tau: p.thCaT },
          ]),
          gbar: p.gCaT * S, ion: "ca", erev: p.VCa, carriesCa: true,
        },
        // Eqs. 18, 31: delayed rectifier, voltage-dependent τ, no inactivation
        {
          channel: gated("kv", "IKv", [{ name: "m", inf: boltzmann(p.VmKv, p.nmKv), tau: tauKv(p.tmKv0) }]),
          gbar: p.gKv * S, ion: "k", erev: p.VK,
        },
        // Eq. 17: BK, driven by the Ca²⁺ current; conductance g_BK·B_BK
        { channel: makeHumanBK(p), gbar: p.gBK * p.BBK * S, ion: "k", erev: p.VK },
        // Eq. 16: SK, from the submembrane calcium
        { channel: makeSK(p.kSK, p.nSK), gbar: p.gSK * S, ion: "k", erev: p.VK },
        // Eq. 19: HERG
        {
          channel: gated("herg", "IHERG", [
            { name: "m", inf: boltzmann(p.VmHERG, p.nmHERG), tau: p.tmHERG },
            { name: "h", inf: boltzmann(p.VhHERG, p.nhHERG), tau: p.thHERG },
          ]),
          gbar: p.gHERG * S, ion: "k", erev: p.VK,
        },
        // Eq. 24: K_ATP
        { channel: makeOpen("katp", "IK(ATP)"), gbar: p.gKATP * S, ion: "k", erev: p.VK },
        // Eq. 26: GABA_A, bath GABA
        { channel: makeOpen("gabar", "IGABA (bath)"), gbar: p.gGABAR * S, ion: "cl", erev: p.VCl },
      ];
    },
    pool: rizPool(base),
    // Riz 2014 Table 1: V_Cl = −40 mV (Rorsman & Braun 2013), which the GABA controls open on
    defaults: { cm: S, gLeak: base.gLeak * S, ihold: 0, eGaba: base.VCl },
    eGabaSource: "−40 mV: V_Cl in Riz et al. 2014 (Table 1), citing Rorsman & Braun 2013",
    ranges: {
      gLeak: { min: 0, max: 1, step: 0.01 },
      cm: { min: 4, max: 20, step: 0.1 },
      ihold: { min: -20, max: 20, step: 0.5 },
      memNoise: { min: 0, max: 5, step: 0.1 },
    },
    // Rheobase is not defined for a cell that fires on its own at the published settings. The current scale is
    // instead the rheobase of the silent cell of Riz's Fig. 5A (g_K(ATP) 0.021 nS/pF), 1.0 pA by an 800 ms step:
    // its input resistance is about 4.4 GΩ (human-app.test.ts).
    rheobase: 0,
    rheobaseTol: 0.1,
    currentScale: 1,
    start: {
      v: -63,
      ca: 0.3,
      // the instantaneous activations start at their steady value at −63 mV
      gates: {
        kv: [0.02],
        bk: [0.002],
        na: [boltzmann(base.VmNa, base.nmNa)(-63), 0.97],
        cal: [boltzmann(base.VmCaL, base.nmCaL)(-63), 0.98],
        capq: [boltzmann(base.VmCaPQ, base.nmCaPQ)(-63)],
        cat: [boltzmann(base.VmCaT, base.nmCaT)(-63), 0.52],
        herg: [0.1, 0.7],
      },
      extra: [0.17],
      source: "the authors' PLoSCompBiol_Fig1.ode (Riz et al. 2014, Software S1): the initial values of its Fig. 1A",
    },
    settleMs: 2000,
    // its spikes peak near −10 mV at the published settings, from −7 mV with less K_ATP, and at −20 to −28 mV with GABA,
    // TTX or less L-type current
    // (human.test.ts), below the app's −20 mV
    spikeLevel: -30,
    // and they never overshoot 0 mV, so the siren's spike-failure check does not apply (extremes.ts)
    spikesOvershoot: false,
    validation:
      "Transcribed from the papers. Checked against Pedersen 2010's reported spike rates and intervals and Riz et al. 2014's responses to TTX and GABA, and against the authors' equations run by a separate stiff solver.",
    vcNote:
      "Pedersen (2010) built these currents from voltage-clamp recordings of human beta cells (Braun et al. 2008), with two simplifications that show here: the Na⁺ and Ca²⁺ currents activate instantly, so they have no rising phase after a step, and E_Na and E_Ca are the values used for firing (+70, +65 mV), not the +100 and +40 mV he fitted the recordings with.",
  };
}

/** The knobs (pS/pF) as the model's parameters (nS/pF, as the papers state them). */
export function paramsFromKnobs(k: Record<string, number> | undefined): Partial<HumanParams> {
  if (!k) return {};
  const out: Partial<HumanParams> = {};
  for (const id of ["gKATP", "gGABAR", "gSK", "gHERG"] as const) if (k[id] !== undefined) out[id] = k[id] / 1000;
  return out;
}

export const BETA_HUMAN: ModelDef = humanBeta();
