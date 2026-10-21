# Roadmap

What is deliberately NOT in v0.1, and the order it is likely to arrive in.
The owner's words are quoted where the item came from them.

## Small fixes (to do)

- **The first recorded sample dips when a step starts at 0 ms.** Fixed 2026-10-21 with the filter: sample 0 of
  the recorded trace is now the settled cell under the holding current, the command in force before the sweep.
- **The stored sample rate is 33 kHz, not the 40 kHz the comment in
  `src/core/simulate.ts` claims.** With dt = 0.01 ms, sampleMs 0.025 rounds to
  every 3 steps (0.03 ms). Each sweep reports its true sampleMs, and every
  measurement uses it, so only the comment and any doc that repeats it are
  wrong. Found 2026-10-17.
- **The spike detector mishandles spikes that never repolarize.** The first
  such spike is counted, but its half-width runs to the end of the sweep, and
  nothing more is counted until Vm falls below −40 mV (K⁺ block, large Na⁺
  edits). The planned excitability scorecard needs these flagged and counted.
  Found 2026-10-17; the description corrected 2026-10-18.

## Next

- **Plug-and-play channels, and an interface to edit them.** "Future versions
  should have plug and play channels, and edit interface. For now just stock."
  The seam is already there: every channel implements the `Channel` interface
  in `src/core/channels.ts` (gates, a Rush–Larsen `advance`, an open fraction,
  and a steady-state open fraction for the Rin solve), and the integrator loops
  over whatever list it is given. What is missing is (1) a channel *description*
  format — rate functions or steady-state/tau curves as data, not code — that
  a UI can edit and that can be validated; (2) a library beyond the stock
  three (Ih, T-type Ca, persistent Na, A-type K, SK/BK with a calcium pool);
  (3) the editor itself, with live plots of m∞/τ(V); (4) a guard that every
  shipped channel still reproduces its source (the NEURON oracle, generalized).
- **Repeated trials and firing probability.** With membrane noise on, a step
  near rheobase fires on some trials and not others. Run each step N times,
  and plot spike probability and mean ± SD rate against current. Held back
  for now at the owner's request ("hold on the measurement"), along with a
  switch to measure on the recorded trace instead of Vm.
- **More GnRH parameter sets.** Adams et al. 2018 also fit positive feedback
  (OVX+E PM) and OVX; its Figs. 7–8 give the distributions. Each would be a
  model entry plus a test against the paper.
- **Voltage clamp**, with the same electrode model (Rs, prediction/correction).
  The brief said "current clamp only, to begin with".

## Later

- Shareable state: encode every setting in the URL hash so a configuration can
  be sent as a link (no server needed).
- Dendrites (a second compartment) so that where inhibition lands matters.
- Chloride dynamics, so that E_GABA can move with activity instead of being a
  parameter. **For consideration (owner, 2026-10-21):** Kevin Staley's and the
  owner's work on chloride accumulation, as the basis for it. Citations to come
  from the owner (a PubMed search for both names together found nothing, so
  they are not guessed here); each number taken goes into `lit/sources.json`.
- NMDA (voltage-dependent Mg²⁺ block) and GABA-B.
- A card for this site on tonydefazio.com.
- **Amplifier mode** (owner, 2026-10-19; parked so the tour gets finished first). A third face for the
  oscilloscope, after Old school: the front panel of a real amplifier of the era, with its dials and switches
  (an Axoclamp, an Axopatch, or a HEKA EPC-7; pick one). Its knobs would drive the electrode settings the
  model already has (bridge balance, capacitance neutralization, series resistance), and perhaps the
  amplifier's own filtering and bandwidth. Before building, look up the old papers on how action potentials
  are distorted when recorded through different amplifiers, in particular through voltage-clamp (patch)
  amplifiers used in current clamp. A candidate to find and check first: Magistretti et al. on whether action
  potentials recorded with patch-clamp amplifiers are genuine (Trends Neurosci, mid-1990s), recalled, not
  verified. Each number taken goes into `lit/sources.json`. Not started; do not start it before the tour ships.
- **Rig features, for eventually** (owner, 2026-10-19, relayed by another session: "not for today but features to
  add eventually"). Not started.
  - **Filter settings:** done 2026-10-21 (v0.2.5): a 4-pole Bessel output filter at the Axopatch 200B's settings
    (1, 2, 5, 10 kHz, bypass) on the recorded trace, noise included (`src/core/filter.ts`).
  - **Gain:** amplifier output gain. Overlaps with amplifier mode above.
  - **Voltage clamp:** a second recording mode; the solver is current clamp only today.
  - **Evoked responses:** stimulus-evoked synaptic input (a single timed PSC or train), beside the random
    background input there is now. **A GABA PSP that sets off a low-threshold spike is a lesson in itself**
    (owner, 2026-10-21), and needs exactly this: a train that starts and stops, so the release can fire the
    LTS cell. The work is done and must be kept: `tools/experiments/lts_gaba_rebound.ts` builds such a train
    from the shipped `step()` and PSC kinetics, and `src/experiments.test.ts` pins what it found. From −64 mV,
    E_GABA −80 mV never rebounds the cell (up to 40 nS at 100 Hz); −85 mV does at 10 nS, −90 mV at 5 nS,
    −95 mV at 3 nS. When evoked input arrives, that experiment becomes a preset with those numbers.
  - **Anodal break excitation:** a spike at the end of a hyperpolarizing step. It can be tried today with negative
    steps in step mode; the feature would be a preset (per model) with a measured, test-pinned result.
