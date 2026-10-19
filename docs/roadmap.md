# Roadmap

What is deliberately NOT in v0.1, and the order it is likely to arrive in.
The owner's words are quoted where the item came from them.

## Small fixes (to do)

- **The first recorded sample dips when a step starts at 0 ms.** With
  stepStart = 0 and a nonzero step, sample 0 of the recorded trace takes the
  step's command current, but the cell is still at its settled state, so bridge
  balance subtracts the whole I·Rs at once: −454 mV at 25.6 nA with Rs 15 MΩ.
  Sample 0 should use the command that was in force before the step. Vm and
  every measurement are unaffected. Found 2026-10-16 while testing the siren.
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
  parameter.
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
