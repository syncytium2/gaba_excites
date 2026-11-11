# Handoff 2026-11-11: the Qiu 2024 code is found and read; how the cell and a dynamic clamp mode fit this repository

**Written by a gaba_excites session, the same afternoon as
[`2026-11-11-kndy-kv4-leak.md`](2026-11-11-kndy-kv4-leak.md). Read that one first.** It carries the owner's question
(the leak hidden in Mendonça's Kv4 dynamic clamp) and the experiment. This one carries what that session did not
have: the reference code it told you to look for, what is odd about it, and where the cell and the dynamic clamp go
in this codebase. Nothing here is built. It does not change the other handoff's experiment.

The owner asked this session to "prepare for a handoff to add the qiu model with dynamic clamp mode for the mendonca
observation". "Mode" is his word: see "Dynamic clamp as a mode" below.

## Where the sources are

- **The literature search** behind this (one single-cell KNDy model exists, and it is Qiu 2024) is in the darkroom
  folder `gaba_excites/2026-11-11_kndy-models-lit-search/`, with a `sources/` folder beside it holding the three
  MATLAB files and the PubMed Central full texts of Qiu 2024 and Mendonça 2018 as plain text.
- **The code**: the paper points to `https://git.exeter.ac.uk/mv286/kiss1-arcuate-neuron-model`, which refused
  connections on 2026-11-11. The Software Heritage copy is `swh:1:dir:585910cdf67ffc5ccef5aec83674b19da1aca8b1`
  (archived 2024-12-09): `Matlab/Kiss1_model.m` (the right-hand side), `Kiss1_model_parameters.m`,
  `Kiss1_model_scirpt.m` (the file name is misspelled in the archive), and `ARC_Kiss1_Mathematical_model.pdf`,
  which nobody has opened yet. Open it: it may settle the disagreements below.
- **There is no license file.** Do not commit the MATLAB to this public repository. Numbers produced by running
  it are fine to commit. Asking the authors for a license is the owner's call.
- `lit/sources.json` has no entry for Qiu 2024, Mendonça 2018 or Mendonça 2016 yet.

## What the archived code is (read on 2026-11-11, not run)

One compartment, 19 state variables, units nS, pF, pA, mV, ms, µM. Two parameter sets: ovariectomized (the default)
and ovariectomized plus estradiol, which overrides nine values (gT, gCa, gh, gTRPC5, gBK, Cm, gA, gleak, gM).

Things a port has to face, each read from the code:

- **Transient Na⁺ activation is instantaneous and first power**: `INaT = gNaT·m∞(V)·h·(V − ENa)`. Persistent Na⁺
  and the T current also have instantaneous activation. This repository already does that with a gate of
  τ = 1e-9 ms (`src/core/beta.ts`, `src/core/human.ts`); `Channel.open` is not given V, so do it the same way.
- **There is no delayed-rectifier K⁺ current.** The outward currents are I_A, I_M, SK, BK and GIRK. The code's
  comment calls the M gate "Delayed-rectifier Potassium activation", but it is the M current (τ 10 ms in the code).
  Whether this cell can fire steadily at the 7–13 Hz Mendonça's irregularity measure needs is not known. Find out
  before anything else.
- **The A current is Mendonça's Kv4 with the same steady states and constant time constants.** m∞ half −30 mV, slope
  10; h∞ half −55.1 mV, slope −11.4 (= 1/0.0878); first power of m. But τm and τh are constants (10 and 20 ms in
  the code), where Mendonça's dynamic clamp used voltage-dependent ones. gA is 60 nS (35 with estradiol); the line
  reads `params.gA = 60;6.3656;`, so 60 is what runs.
- **So the host already has a large window conductance of the very kind under test.** m∞·h∞ at −70 mV is 0.0142
  (this session recomputed it; it agrees with the other handoff's 0.014), so the native A current is about 0.85 nS
  open at −70 mV beside a 3.5 nS leak. Subtracting Kv4 by dynamic clamp removes a conductance with different
  kinetics from the native one; say so wherever a subtraction is shown.
- **The host is much leakier than Mendonça's cells.** gleak alone is 3.5 nS (under 290 MΩ before any channel is
  counted); Mendonça report 1.34 GΩ, which is 0.75 nS. Capacitance is 23.13 pF against their 33.7 pF. A dose that
  doubles the resting conductance of their cells adds a fifth to this one. The other handoff tells you to measure
  input resistance; this is why the dose axis needs thought: nS, nS/pF, or a multiple of the host's measured resting
  conductance. That is a decision for the owner.
- **Calcium**: `dCa/dt = −γ·(0.9·I_TRPC5 + I_T + I_Ca + I_leakCa) − d·Ca`. Three things do not fit the seams as they
  stand: `carriesCa` in `src/core/models.ts` is a boolean and TRPC5 contributes nine tenths of its current; the
  "calcium leak" is a voltage-gated Ca²⁺ conductance (`gleakCa/(1 + exp((20 − V)/10))`), so it is a channel, not a
  leak; and the pool is a linear decay, a new `CaPool` in `src/core/pools.ts`.
- **BK** opens with voltage around a half-point that moves with log(Ca); **SK** is a Hill function of Ca. Both have
  cousins in `src/core/human.ts` and `makeKCa`.
- **TRPC5 and GIRK each carry a two-state activator** (inactive ⇌ active) driven by an agonist level: NKB for
  TRPC5, a κ-agonist level for GIRK. Those are states that do not follow voltage. They fit `Channel` as gates
  advanced from a model knob (`ModelDef.knobs`), which is how NKB and the agonist would reach the page.
- **GIRK is off and looks unfinished**: `gGIRK = 0`, and `V_GIRK = 67.08` is used both as a half-point and as a
  voltage scale in the time constant. Leave GIRK out of anything quoted until that is understood.
- **Starting state**: all zeros except both inactive activators at 1, then 20 s to settle. `settleMs` must cover
  it, and the estradiol set has a 250 ms persistent-Na⁺ inactivation and 300 ms Ca²⁺ gates to wait for.
- **The only numbers the archive offers to test against**: the script prints the two resting potentials, and
  carries the comment `%-68.9241  -70.9198`, presumably those values for the two sets. Confirm by running it. The
  Figure 13 parameter sweeps are not in the archive.
- **Integrator**: `ode45`, maximum step 1 ms. Ours is Rush–Larsen at a fixed dt. Expect to choose dt for this cell
  by convergence, and record it.

## The paper's table and the code disagree

The search agent compared eLife's Appendix 1—table 1 with the code and found about ten differences: the transient
Na⁺ slopes (3 and −8.2 mV in the table, 7 and −2 in the code), the SK calcium dependence (0.45 µM and 4, against
0.74 and 2.2), BK's V₀ (−22.52 mV against 0.1), GIRK's conductance and voltage, the A-current time constants
(swapped), the high-voltage Ca²⁺ time constants (swapped), and the capacitance unit. The full table is in the
report. **The code column was rechecked against the downloaded file and is right. The paper column has not been
rechecked by anyone but the agent**; read the appendix yourself before quoting it.

A proposal, for the owner to confirm: **port the code, not the table.** The code runs, so it can produce numbers a
test can hold the port to, which the table cannot. Record every difference from the table in `lit/notes/`, and let
the model's `validation` line say exactly what was checked: against the authors' archived code, not against
recordings, and not the way the pyramidal cell is checked against NEURON unless the next step is done.

**A code oracle is within reach.** Octave has `ode45`. Run the archived files unchanged, save V(t) for a few
protocols (rest in both sets, a current step family, an NKB application), and hold the TypeScript port to them as
`oracle.test.ts` holds the pyramidal cell to NEURON. Put the runner in `tools/` with instructions in its docstring,
as `tools/neuron_oracle.py` has, and fetch the MATLAB at run time by its Software Heritage ID. If the port and the
code disagree at a tolerance you cannot close, say what the tolerance is.

## Dynamic clamp as a mode

The roadmap already names it (`docs/roadmap.md`, "The amplifier as the gateway to testing hypotheses", the owner,
2026-10-30): current clamp, voltage clamp and the oscilloscope are built, and "dynamic clamp would be the fourth".
The other handoff calls it "an experiment rather than a channel of the cell". Both hold if it is built this way:

- **In the core, an injected conductance is a `Channel` object that does not belong to the model**, with a
  conductance that may be negative and its own reversal. The solver still learns about no particular channel.
  Mendonça's Kv4 (equations in the other handoff, with the voltage-dependent time constants) is the first; a plain
  leak is the second, because the matched-leak control and the leak-compensated injection in the other handoff need
  one. Look at how `SynNow` reaches `step` in `src/core/simulate.ts` for a conductance that is not the cell's own.
- **The dose is "peak conductance at 0 mV", not gbar.** Work out the conversion from the equations (a step to 0 mV
  from a stated holding potential), pin it in a test, and record it. The paper does not give the E_K its dynamic
  clamp used in the passages read so far; find it.
- **What the clamp sees is a decision.** A real dynamic clamp computes from the recorded voltage, through the
  electrode, with a loop delay. This repository's rule is that measurements are on Vm and the electrode changes only
  the traces. An ideal clamp that reads Vm is the simple first version and keeps that rule; say on the page that it
  is ideal. The GnRH cell's GABA conductance is already described as "instantaneous rise as in their dynamic
  clamp", so there is a precedent.
- **A negative conductance larger than what the cell has is unstable.** Bound the knob, and say why.
- **Irregularity needs a source.** The core is deterministic. Mendonça attribute the irregular firing to Kv4
  interacting with persistent Na⁺; whether this model does that without noise is unknown. Membrane noise exists
  (`src/core/noise.ts`: a current at the membrane, which the cell feels, with its own seed) and the other handoff
  says to measure CV_ISI with it on. Measure it with noise off as well, and report both.
- **In the UI it is the fourth mode on the same amplifier**, scoped so that no claim measured on the KNDy cell
  shows under another model. Run `node scripts/screenshot.mjs` after any change there.

## Order of work

1. Worktree `../gaba_excites-worktrees/kndy-kv4` on branch `kndy-kv4` (it exists; this handoff is its first
   commit). `node_modules` there is a symlink to the primary checkout, as in the other worktrees.
2. Run the archived code in Octave. Get the two resting potentials and a step family. This is the oracle, and it
   answers whether the cell fires at 7–13 Hz at all.
3. Port: new channel objects and the pool, then a `kndy` entry in `src/core/models.ts` with the two parameter sets
   and an NKB knob, then `src/core/kndy.test.ts` holding it to the oracle. `npx tsc -b` as well as `npm test`.
4. The other handoff's five measurements as a script in `tools/experiments/`, with its pieces imported by
   `src/experiments.test.ts`. The injected conductance lives in the core; the experiment stays out of the shipped
   model. This already answers the owner's question, before any UI.
5. Figures to the darkroom folder. He wants figures before he trusts a result.
6. Only then the mode in the UI, presets that quote numbers a test pins, and the README, `public/methods.html` and
   `public/llms.txt`.
7. `lit/sources.json` entries with `lit/notes/` transcriptions for Qiu 2024, Mendonça 2018 and Mendonça 2016, and
   for the sources Qiu borrows kinetics from where you quote them; `node scripts/lit.ts`. `docs/process.md` as you
   go, and an ADR for each decision below once the owner has made it. No deploy without his word.

## For the owner to decide

- Code or paper table as the source of truth (proposed above: the code), and whether to write to the authors about
  the differences and the license.
- Whether the host should be this cell as published, or this cell with K⁺ currents refit to his 2019 arcuate
  recordings (DeFazio et al. 2019, doi:10.1523/JNEUROSCI.0378-19.2019), which would be new modeling and need its own
  check.
- Which parameter set hosts the experiment (ovariectomized, with estradiol, or both), given that Mendonça recorded
  males.
- The dose axis: nS, nS/pF, or relative to the host's measured resting conductance.
- Ideal dynamic clamp first, or through the electrode from the start.
- Spike threshold criterion for the cell: 2 V/s is the lab's kisspeptin convention, but its source in
  `lit/sources.json` is AVPV neurons (see the ADR "spike threshold's criterion belongs to the model").
- Whether the UI mode ships with this work or waits for the experiment's answer.
