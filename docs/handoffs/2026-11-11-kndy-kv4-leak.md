# Handoff 2026-11-11: build the Qiu 2024 KNDy cell, then show the leak hidden in a Kv4 dynamic-clamp result

**Written by a td-resume session (the LatchBio application), not by a gaba_excites session.** Nothing here is built.
The owner asked for it in these words: "write a handoff to the gaba_excites team to build the qiu 2024 model and
demonstrate the kv leak effect from mendonca". So the build is approved; the shape below is a proposal, and the
owner decides anything it leaves open.

## The claim to test

Mendonça PRF, Kyle V, Yeo S-H, Colledge WH, Robinson HPC (2018) Kv4.2 channel activity controls intrinsic firing
dynamics of arcuate kisspeptin neurons. *J Physiol* 596:885–899,
[doi:10.1113/JP274474](https://doi.org/10.1113/JP274474) (open access, CC BY). The owner has the PDF in his `01-lit`
folder: "The Journal of Physiology - 2017 - Mendonça - Kv4 2 channel activity controls intrinsic firing dynamics of
arcuate.pdf".

They added or subtracted a Kv4-like conductance by dynamic clamp in male mouse arcuate Kiss1 (KNDy) neurons and
report that adding it "produces a striking increase in firing irregularity, and excitability is reduced, while
subtracting gKv4 has the opposite effects."

**The owner's objection:** "this paper claimed adding a kv via dynamic clamp proves it controls firing dynamics.
authors did not show the massive change in 'leak' at rest that like[ly] underlies all their findings." The injected
conductance is partly open at rest (a window current), so every injection also changes the cell's resting
conductance, input resistance and resting potential. The paper reports none of those with the conductance on.

## What the paper gives you

**The injected conductance** (Methods, "Artificial conductance injection"; kinetics taken from their cortical
interneuron recordings, Mendonça et al. 2016). Note the first power of m, not m⁴:

```
I_Kv4 = gbar · m · h · (V − E_K)
dm/dt = (m∞ − m)/τm        dh/dt = (h∞ − h)/τh
m∞(V) = 1 / (1 + exp((−30 − V)/10))
τm(V) = 0.346·exp(−V/18.272) + 2.09          (ms)
h∞(V) = 1 / (1 + exp(0.0878·(V + 55.1)))
τh(V) = 2.1·exp(−V/21.2) + 4.627             (ms)
```

They state the dose as the **peak conductance at 0 mV**, not gbar. The figures normalize it by capacitance, ranging
from about −0.4 to +0.6 nS/pF (Fig. 6E). The example in Fig. 6C is +2.18 nS. Their native Kv4 averaged 16.2 nS peak
at 0 mV, or 0.48 nS/pF (Discussion). Check how they turn "peak at 0 mV" into gbar before you use it, and record the
conversion.

**The cells** (Results, mean ± SD, n = 49): input resistance 1.34 ± 0.69 GΩ, τm 41.9 ± 18.6 ms, capacitance
33.7 ± 13.7 pF, rest −67.4 ± 8.2 mV. Recordings in gabazine, CNQX and APV. Firing was driven with 2–10 s steps that
gave 7–13 Hz. The irregularity measure is CV_ISI10.

**A rough size, to check, not cite.** The td-resume session computed the steady fraction m∞·h∞ from the equations
above: 0.014 at −70 mV, 0.029 at −60, 0.038 at −55, 0.047 at −50. That is a fraction of gbar, not of the 0 mV peak.
The cell's own resting conductance is about 1/1.34 GΩ ≈ 0.75 nS. At the top dose (0.6 nS/pF × 33.7 pF ≈ 20 nS
peak), even a few percent left open near −60 mV is on the order of the cell's whole resting conductance. If that
holds, the "+gKv4" cell is a different, leakier cell at rest before any spike, and the "−gKv4" cell (a negative
conductance) is a less leaky, depolarized one. **Your job is to compute this properly, not to trust this
paragraph.**

## The host cell: Qiu et al. 2024

Qiu J, Voliotis M, Bosch MA, Li XF, Zweifel LS, Tsaneva-Atanasova K, O'Byrne KT, Rønnekleiv OK, Kelly MJ (2024)
Estradiol elicits distinct firing patterns in arcuate nucleus kisspeptin neurons of females through altering ion
channel conductances. *eLife* 13:RP96691, [doi:10.7554/eLife.96691](https://doi.org/10.7554/eLife.96691), PMC11643640.
The preprint is [doi:10.1101/2024.02.20.581121](https://doi.org/10.1101/2024.02.20.581121). It is a biophysical
single-compartment model of the female arcuate Kiss1 neuron, with E2 changing its conductances: calcium channels,
TRPC5, GIRK, and others.

- **Look for reference code first** (eLife data availability, GitHub, ModelDB; Voliotis and Tsaneva-Atanasova at
  Exeter are the modelers). With code, check the port against it the way the pyramidal and fast-spiking cells are
  checked against NEURON. Without code, transcribe from the paper and say so, as the GnRH cell from Adams et al. 2018
  does.
- **Measure, don't read off.** The owner's standing complaint about models: they "set Rin with gleak, rather than
  actually measuring it in VC and CC". Measure the built cell's input resistance in voltage clamp
  and current clamp, at rest and held at other potentials, and report how it compares with g_leak and with the
  1.34 GΩ above.
- **A mismatch to state, not hide:** Mendonça recorded male cells and Qiu models female cells under E2 conditions.
  Use the Qiu cell as the host and say so in the write-up.

## The demonstration

Add a "dynamic clamp" conductance to the simulator: the Mendonça Kv4 equations, injected at a chosen dose, positive
or negative, as an experiment rather than a channel of the cell. Then run, for each dose across the paper's range:

1. **Rest, with the conductance on.** Resting potential, total resting conductance, and input resistance (in
   voltage clamp and current clamp, small steps around rest), each against the dose. That is the figure the paper
   did not show.
2. **A matched-leak control.** Replace the Kv4 injection with a plain leak, with E_K as reversal, whose conductance
   equals the Kv4's steady conductance at that cell's rest. Repeat the firing protocol: rheobase, f–I, latency, and
   CV_ISI with the simulator's noise on. How much of the "Kv4 effect" does a plain leak reproduce?
3. **The leak-compensated Kv4.** Inject Kv4 plus an equal and opposite steady leak, so resting conductance is
   unchanged, and repeat. What is left is the part of the effect owed to Kv4's dynamics.
4. **Matched starting potential.** Every comparison is run from the same membrane potential. Use bias current
   where the injection moves rest, and report both "own rest" and "matched" results. This is the rule from the
   2026-10-17/18 threshold run in `docs/process.md`, where K⁺ edits moved threshold under 0.5 mV once starting
   potential was matched.
5. **Recovery between sweeps.** Let the cell recover between sweeps; don't restart each one from baseline. Kv4
   inactivation (τh) and slower currents carry over, and the owner has flagged that modelers skip this.

**What would count as the owner being right:** the matched-leak control in step 2 reproduces most of the change in
excitability, and the leak-compensated Kv4 in step 3 leaves a much smaller effect on CV_ISI than the paper reports.
**What would count against him:** the leak-compensated Kv4 still drives irregularity as strongly. Report whichever
the cell shows. If the answer depends on the dose or the host cell, say where it flips.

## Why it matters outside gaba_excites

The owner is preparing a LatchBio take-home in which he builds AI-benchmark tasks about properties measured many
ways (threshold, excitability, input resistance). This result is a candidate data source for one task: "Did adding
Kv4 make the cell more irregular, and why?" The trap answer is "Kv4 dynamics". The right answer accounts for the
resting conductance change. The td-resume side keeps that at
`docs/interviews/latchbio/task-development.md` on branch `latchbio`. Export the traces as files an agent can read,
with noise and filter settings recorded. That is also an open check there.

## Coordination

- Own a new branch and worktree (`kndy-kv4`); don't touch the open branches listed in `git worktree list`.
- Record the work in `docs/process.md` and an ADR where a decision is made, as this repo does. Do not deploy
  without the owner's go-ahead.
- Send back to the owner: the rest-conductance figure from step 1, the matched-leak and compensated results from
  steps 2 and 3, and whether reference code for Qiu 2024 was found.
