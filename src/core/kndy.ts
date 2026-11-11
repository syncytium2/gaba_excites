/**
 * The arcuate kisspeptin (KNDy) neuron of Qiu J, Voliotis M, Bosch MA, Li XF, Zweifel LS, Tsaneva-Atanasova K,
 * O'Byrne KT, Rønnekleiv OK, Kelly MJ (2024) "Estradiol elicits distinct firing patterns in arcuate nucleus
 * kisspeptin neurons of females through altering ion channel conductances", eLife 13:RP96691,
 * doi:10.7554/eLife.96691. One compartment; transient and persistent Na⁺, an A current, an M current, BK, SK,
 * Ih, T-type and high-voltage Ca²⁺, TRPC5, a K⁺ leak and a voltage-gated Ca²⁺ "leak", and a calcium pool.
 * There is no delayed-rectifier K⁺ current: the A, M, BK and SK currents repolarize the spike.
 *
 * PORTED FROM THE AUTHORS' CODE, not from the paper's table. The MATLAB is archived at Software Heritage
 * (swh:1:dir:585910cdf67ffc5ccef5aec83674b19da1aca8b1) with no license file, so none of it is in this
 * repository; tools/kndy_oracle.m runs it unchanged and src/core/kndy.test.ts holds this port to its numbers.
 * The paper's Appendix 1—table 1 disagrees with the code in fifteen values and one equation, and the table's
 * cell does not fire (lit/notes/qiu2024.md). `QIU_TABLE` and `QIU_AS_WRITTEN` below are those cells, kept so
 * the comparison can be re-run; they are not offered as the model.
 *
 * Two states, both the authors': ovariectomized (OVX, the code's default) and OVX with estradiol (OVX+E2),
 * which changes nine values, the capacitance among them.
 *
 * NOT REGISTERED in models.ts: the app does not offer this cell. The owner, 2026-11-11: it "will run in private
 * mode until we know how well it works", and it may never reach the public page.
 *
 * GIRK is left out. In code and paper alike its activator starts at zero and is only driven by an agonist
 * that is zero by default, so the current is exactly zero; and the code's GIRK parameters look unfinished
 * (g = 0, and one constant used as both a half-point and a voltage scale).
 *
 * Units: mV, ms, nS, pA, pF, µM, as the code's.
 */

import { boltzmann, makeGated, type Channel } from "./channels.ts";
import { makeSK } from "./human.ts";
import { linearPool } from "./pools.ts";
import type { ModelChannel, ModelDef, ModelId } from "./models.ts";

/** Every parameter, by the code's meaning. Kiss1_model_parameters.m, the OVX set. */
export const QIU_CODE = {
  cm: 23.13,
  ENa: 66.1, EK: -81, ECa: 121.6, Etrpc5: -15, Eh: -27.8,
  // transient Na⁺: I = g·m∞(V)·h·(V − E_Na)
  gNaT: 90, mNaTVh: -25, mNaTk: 7, hNaTVh: -43.2, hNaTk: -2, hNaTtau: 4.5,
  // persistent Na⁺: I = g·m∞(V)·h·(V − E_Na)
  gNaP: 3.37, mNaPVh: -41.5, mNaPk: 3, hNaPVh: -47.4, hNaPk: -8.2, hNaPtau: 250,
  // A current: I = g·m·h·(V − E_K); the code's line reads `params.gA = 60;6.3656;`, so 60 runs
  gA: 60, mAVh: -30, mAk: 10, hAVh: -55.1, hAk: -11.4, mAtau: 10, hAtau: 20,
  // BK: open = 1/(1 + exp(−(V − V_BK)/K)), V_BK = V0 − kShift·ln(Ca/kCa)
  gBK: 13.5, bkK: 10, bkV0: 0.1, bkShift: 18, bkKca: 1.5,
  // SK: open = Caⁿ/(Caⁿ + Kⁿ)
  gSK: 28.13, skK: 0.74, skN: 2.2,
  // M current: I = g·m·(V − E_K)
  gM: 0.23, mMVh: -50, mMk: 20, mMtau: 10,
  // Ih: I = g·(p·h1 + (1 − p)·h2)·(V − E_h)
  gh: 0.5617, hhVh: -102, hhk: -10, hhP: 0.85, hhtau1: 80, hhtau2: 310,
  // T-type Ca²⁺: I = g·m∞(V)·(f·h1 + (1 − f)·h2)·(V − E_Ca)
  gT: 0.666, mTVh: -54, mTk: 3.3, hTVh: -69.1, hTk: -5.3, hTtau1: 1.94, hTtau2: 86.3, hTf: 0.5,
  // high-voltage Ca²⁺ (L, N, P/Q and R together): I = g·m·h·(V − E_Ca)
  gCa: 2.1, mCaVh: -27.3, mCak: 4.62, mCatau: 10, hCaVh: -48.9, hCak: -18.2, hCatau: 300,
  // TRPC5: I = g·R/(1 + exp(−(Ca − c0)/k))·(V − E_TRPC5), R an activator NKB drives
  gTRPC5: 8.4, trpcCa: 0.6, trpcK: 1 / 3, trpcFracCa: 0.9,
  trpcK0: 0.002, trpcKon: 0.006, trpcKoff: 0.002, KN: 32, NKB: 0,
  // leaks: K⁺ (linear) and Ca²⁺ (the code gates it: g/(1 + exp((V½ − V)/k)))
  gLeak: 3.5, ELeak: -81, gLeakCa: 4, leakCaVh: 20, leakCak: 10,
  // calcium: dCa/dt = −γ·(0.9·I_TRPC5 + I_T + I_Ca + I_leakCa) − d·Ca
  gamma: 1.9631e-5, dCa: 0.008,
};
export type KndyParams = typeof QIU_CODE;

/** The nine values estradiol changes in the code (`params_OVXE2`). */
export const QIU_CODE_E2: Partial<KndyParams> = { gT: 4.995, gCa: 2.8, gh: 11.234, gTRPC5: 1.68, gBK: 20, cm: 19.5, gA: 35, gLeak: 3.65, gM: 1.23 };

/**
 * The paper's Appendix 1—table 1 where it differs from the code, in the code's equations. With these the cell
 * rests 5 mV lower, has less than half the input resistance, and fires at most one spike to a 120 pA step
 * (kndy.test.ts). The A-current and high-voltage Ca²⁺ time constants are each other's in table and code.
 */
export const QIU_TABLE: Partial<KndyParams> = {
  mNaTk: 3, hNaTk: -8.2, hNaPk: -8.5, mAtau: 20, hAtau: 10, bkV0: -22.52, skK: 0.45, skN: 4,
  gh: 0.56, gT: 0.66, mCatau: 300, hCatau: 10, trpcK: 0.33, gamma: 1.96e-5,
};
/** The table's OVX+E2 values where they differ from the code's: it gives SK its own estradiol value, the code does not. */
export const QIU_TABLE_E2: Partial<KndyParams> = { ...QIU_CODE_E2, ...QIU_TABLE, gSK: 26.05, gh: 11.23, gT: 5 };
/**
 * The paper as written: its leak equation is I_leak,Ca = g·(V − E_Ca), with no voltage dependence. A plain 4 nS
 * leak to +121.6 mV: the cell sits near −55 mV with about 21 MΩ and never fires.
 */
export const QIU_AS_WRITTEN: Partial<KndyParams> = { ...QIU_TABLE, leakCaVh: -1e6 };

/** "Instantaneous" activation: a gate with τ = 1e-9 ms, set to m∞ at the new V each step (as in human.ts). */
const INSTANT = 1e-9;

/** The code writes x∞ = 1/(1 + exp((V½ − V)/k)); channels.ts's boltzmann is 1/(1 + exp((V − V½)/k)), so k flips sign. */
const sig = (vh: number, k: number) => boltzmann(vh, -k);

/**
 * BK: open at once to 1/(1 + exp(−(V − V_BK(Ca))/K)), V_BK = V0 − kShift·ln(Ca/kCa); shut when Ca ≤ 0, as the
 * code writes it. `Channel.open` is not given V, so the open fraction is kept as a gate, set at each gate
 * advance from the new V and the calcium at the start of the step.
 */
export function makeKndyBK(p: Pick<KndyParams, "bkK" | "bkV0" | "bkShift" | "bkKca">): Channel {
  const act = (v: number, ca: number) => (ca > 0 ? 1 / (1 + Math.exp(-(v - (p.bkV0 - p.bkShift * Math.log(ca / p.bkKca))) / p.bkK)) : 0);
  return {
    id: "bk",
    label: "IBK",
    nGates: 1,
    gateNames: ["b"],
    init(v, s, o, ca = 0) {
      s[o] = act(v, ca);
    },
    advance(v, _dt, s, o, ca = 0) {
      s[o] = act(v, ca);
    },
    open: (s, o) => s[o],
    openInf: (v, ca) => act(v, ca),
  };
}

/**
 * TRPC5: open = R/(1 + exp(−(Ca − c0)/k)). R is the active share of an effector that NKB drives:
 *   dR/dt = (k0 + kon·NKB²/(KN² + NKB²))·(1 − R) − koff·R
 * linear in R at a fixed NKB, so the step is exact. With no NKB, half of it is active.
 */
export function makeTRPC5(p: Pick<KndyParams, "trpcCa" | "trpcK" | "trpcK0" | "trpcKon" | "trpcKoff" | "KN">, nkb: number): Channel {
  const on = p.trpcK0 + (p.trpcKon * nkb * nkb) / (p.KN * p.KN + nkb * nkb);
  const rInf = on / (on + p.trpcKoff);
  const decay = on + p.trpcKoff;
  const byCa = (ca: number) => 1 / (1 + Math.exp(-(ca - p.trpcCa) / p.trpcK));
  return {
    id: "trpc5",
    label: "ITRPC5",
    nGates: 1,
    gateNames: ["R"],
    init(_v, s, o) {
      s[o] = rInf;
    },
    advance(_v, dt, s, o) {
      s[o] = rInf + (s[o] - rInf) * Math.exp(-decay * dt);
    },
    open: (s, o, ca) => s[o] * byCa(ca),
    openInf: (_v, ca) => rInf * byCa(ca),
  };
}

/** The cell's channels for a parameter set, at that set's own capacitance. */
export function kndyChannels(p: KndyParams): ModelChannel[] {
  const two = (g: Float64Array | number[], o: number) => g[o] * g[o + 1];
  return [
    {
      channel: makeGated("nat", "INaT", [
        { name: "m", inf: sig(p.mNaTVh, p.mNaTk), tau: INSTANT },
        { name: "h", inf: sig(p.hNaTVh, p.hNaTk), tau: p.hNaTtau },
      ], two),
      gbar: p.gNaT, ion: "na", erev: p.ENa,
    },
    {
      channel: makeGated("nap", "INaP", [
        { name: "m", inf: sig(p.mNaPVh, p.mNaPk), tau: INSTANT },
        { name: "h", inf: sig(p.hNaPVh, p.hNaPk), tau: p.hNaPtau },
      ], two),
      gbar: p.gNaP, ion: "na", erev: p.ENa,
    },
    {
      channel: makeGated("a", "IA", [
        { name: "m", inf: sig(p.mAVh, p.mAk), tau: p.mAtau },
        { name: "h", inf: sig(p.hAVh, p.hAk), tau: p.hAtau },
      ], two),
      gbar: p.gA, ion: "k", erev: p.EK,
    },
    { channel: makeKndyBK(p), gbar: p.gBK, ion: "k", erev: p.EK },
    { channel: makeSK(p.skK, p.skN), gbar: p.gSK, ion: "k", erev: p.EK },
    {
      channel: makeGated("m", "IM", [{ name: "m", inf: sig(p.mMVh, p.mMk), tau: p.mMtau }], (g, o) => g[o]),
      gbar: p.gM, ion: "k", erev: p.EK,
    },
    {
      channel: makeGated("h", "Ih", [
        { name: "h1", inf: sig(p.hhVh, p.hhk), tau: p.hhtau1 },
        { name: "h2", inf: sig(p.hhVh, p.hhk), tau: p.hhtau2 },
      ], (g, o) => p.hhP * g[o] + (1 - p.hhP) * g[o + 1]),
      gbar: p.gh, ion: "cation", erev: p.Eh,
    },
    {
      channel: makeGated("t", "IT", [
        { name: "m", inf: sig(p.mTVh, p.mTk), tau: INSTANT },
        { name: "h1", inf: sig(p.hTVh, p.hTk), tau: p.hTtau1 },
        { name: "h2", inf: sig(p.hTVh, p.hTk), tau: p.hTtau2 },
      ], (g, o) => g[o] * (p.hTf * g[o + 1] + (1 - p.hTf) * g[o + 2])),
      gbar: p.gT, ion: "ca", erev: p.ECa, carriesCa: true,
    },
    {
      channel: makeGated("ca", "ICa (high-voltage)", [
        { name: "m", inf: sig(p.mCaVh, p.mCak), tau: p.mCatau },
        { name: "h", inf: sig(p.hCaVh, p.hCak), tau: p.hCatau },
      ], two),
      gbar: p.gCa, ion: "ca", erev: p.ECa, carriesCa: true,
    },
    { channel: makeTRPC5(p, p.NKB), gbar: p.gTRPC5, ion: "cation", erev: p.Etrpc5, carriesCa: true, caFraction: p.trpcFracCa },
    {
      channel: makeGated("leakca", "Ca²⁺ leak", [{ name: "m", inf: sig(p.leakCaVh, p.leakCak), tau: INSTANT }], (g, o) => g[o]),
      gbar: p.gLeakCa, ion: "ca", erev: p.ECa, carriesCa: true,
    },
  ];
}

/** The id the cell goes by. Not a member of the app's registry (see the file comment), hence the cast. */
export const KNDY_ID = "kndy" as ModelId;

/** The cell for a parameter set: `kndy()` is the code's OVX cell, `kndy(QIU_CODE_E2)` its OVX+E2 cell. */
export function kndy(over: Partial<KndyParams> = {}, state = "OVX"): ModelDef {
  const base: KndyParams = { ...QIU_CODE, ...over };
  return {
    id: KNDY_ID,
    thresholdDvdt: 2,
    label: `Arcuate kisspeptin neuron (mouse, ${state})`,
    short: "KNDy",
    blurb:
      "Qiu et al. 2024: transient and persistent Na⁺, A and M currents, BK, SK, Ih, T-type and high-voltage Ca²⁺, TRPC5, with a calcium pool. No delayed rectifier.",
    citation: "Qiu J, Voliotis M, Bosch MA, et al. (2024) eLife 13:RP96691",
    doi: "10.7554/eLife.96691",
    cmRef: base.cm,
    eLeak: base.ELeak,
    knobsTitle: "NEUROKININ B",
    knobs: [
      {
        id: "NKB",
        label: "NKB",
        unit: "µM",
        min: 0,
        max: 200,
        step: 1,
        value: base.NKB,
        note: "Extracellular neurokinin B, which activates the effector that opens TRPC5 (half-maximal at 32 µM). 0 in the authors' code; half the effector is active even then.",
      },
    ],
    channels: (k) => kndyChannels({ ...base, NKB: k?.NKB ?? base.NKB }),
    pool: linearPool({ gamma: base.gamma, d: base.dCa }),
    defaults: { cm: base.cm, gLeak: base.gLeak, ihold: 0, eGaba: -80 },
    eGabaSource: "−80 mV: a placeholder. The Qiu model has no GABA current, and no measured E_GABA for these cells is cited here.",
    ranges: {
      gLeak: { min: 0, max: 20, step: 0.05 },
      cm: { min: 5, max: 60, step: 0.5 },
      ihold: { min: -50, max: 150, step: 1 },
      memNoise: { min: 0, max: 30, step: 0.5 },
    },
    // an 800 ms step from rest, bisected to 0.1 pA (kndy.test.ts)
    rheobase: state === "OVX" ? 5.3 : 4.7,
    rheobaseTol: 0.1,
    // the slowest gates: Ih 310 ms, persistent Na⁺ inactivation 250 ms, the TRPC5 effector 250 ms, calcium 125 ms.
    // The run starts from the steady state, so this only has to confirm it.
    settleMs: 5000,
    validation:
      "Ported from the authors' archived MATLAB code and held to that code run unchanged: resting potential, input resistance and every spike of a step family. Not checked against recordings, and the paper's parameter table describes a different cell that does not fire.",
  };
}

export const KNDY_OVX: ModelDef = kndy();
export const KNDY_E2: ModelDef = kndy(QIU_CODE_E2, "OVX+E2");
