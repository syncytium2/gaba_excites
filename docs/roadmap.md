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
- **Voltage clamp**: done 2026-10-29 (a third mode, checked against NEURON's SEClamp on the pyramidal cell). Still
  to come: Rs compensation (prediction/correction), P/N leak subtraction, ramps, a CSV of the measured points, and
  NEURON checks for the FS and LTS cells. Capacitance compensation (Cfast for the pipette, Cslow/whole-cell for Cm)
  is not modeled either: the transient after each step is the cell's whole Cm·ΔV. Artifact blanking: done 2026-10-30.
- **A module on the perils of leak subtraction** (the owner, 2026-10-30). P/N subtraction scales small
  sub-threshold steps up and subtracts them; show what goes wrong: a wrong gain (the scaled leak over- or
  under-subtracts, bending the I–V and inventing or hiding a current), and clipping (an amplifier or digitizer
  range that clips the large transient in the test step but not in the small P/N steps, so the scaled transient
  no longer cancels). Needs P/N subtraction itself first, and a clipping amplifier/digitizer range to clip against.
- **A "channels only" view for teaching** (the owner, 2026-10-30: teachers will likely prefer it, without the
  distraction of the rig's artifacts, which still matter). The simulation knows each channel's current exactly, so
  the view can drop the electrode altogether: ideal clamp, no noise, no filter, no capacitive transient, no leak,
  and optionally each channel's current as its own trace. It would be labeled as what no rig can record. The full rig
  stays the default for anyone learning the craft.

- **A GHK teaching page: divalents, activity, junction potentials.** Separate
  from the simulator. The GHK voltage equation with any mix of ±1 and ±2
  valences, solved exactly (a quadratic in exp(−FV/RT) with one positive root),
  beside the monovalent shortcut's wrong answer; activity applied to both sides
  (it cancels) or to one (a constant shift); the Henderson junction potential;
  permeant anions (HCO3⁻, gluconate); and an inverse mode, from a measured
  reversal to [Cl⁻]i or P_Ca/P_Na. The worked example is DeFazio et al. 2000's
  calibration: "an activity correction tool could be very educational". The
  computation starts in `tools/experiments/chloride_calibration.ts`; reasoning
  in `lit/notes/defazio2000.md`.

- **Pancreatic beta cells, mouse first, then human** (owner, 2026-10-29: "consider adding a pancreatic beta cell
  as a side quest"; "i'd like both mouse and human ephys"; mouse first at beta_max's request, relayed with the
  owner's agreement). Two model entries, each with its own test against its source and its own presets. **Mouse
  ported 2026-10-29** (Bertram et al. 2004, `src/core/beta.ts`; checked against the paper) **and in the app the
  same day**, on the oscilloscope with a glucose control and the paper's patterns. Human not started.
  - **Mouse, first.** Ashcroft & Rorsman 1989 (Prog Biophys Mol Biol 54:87–143) is the reference for what it must
    do: K_ATP sets rest near −70 mV, Na⁺ channels are inactivated at rest so TTX has no effect, spikes are L-type
    Ca²⁺, and glucose drives bursts. beta_max is extracting its numbers, with quotes and pages, into Dropbox
    `01-lit/beta_max/ashcroft1989-extraction.md`; reuse that rather than re-reading the review. Candidate model:
    the Bertram/Sherman Integrated Oscillator Model, whose XPP code is public (NIDDK LBM page;
    github.com/artielbm/artielbm.github.io/Models). That repository states no license, so ask the owner before
    vendoring any of it, and keep it out of this public repository regardless. **Port, do not copy:** take the
    equations and parameters from the paper into `lit/notes/`, write the TypeScript from those notes, and use the
    authors' code only to check the port (numbers produced by running it may go into tests, cited as such). A value
    found only in the code is cited to the code in `lit/sources.json`. **Permission:** on 2026-10-29 Arthur Sherman
    approved, by email to the owner, use of Chen, Wang & Sherman 2008 in an educational web app with attribution
    (the email is in the owner's beta_max literature folder). That covers beta_max's model; the Integrated
    Oscillator Model was not named, so ask before relying on it. Check its .ode files for the
    conventions beta_max found in the same authors' Chen 2008 files (an initial value that is a typo for the
    steady state, per-file time units).
  - **Human, second.** Riz, Braun & Pedersen 2014 (PLoS Comput Biol, doi:10.1371/journal.pcbi.1003389), which adds
    SK channels and Ca²⁺ dynamics to Pedersen 2010 (Biophys J, doi:10.1016/j.bpj.2010.09.004). It belongs here
    because GABA depolarizes human beta cells and drives their firing (Braun et al. 2010, Diabetes,
    doi:10.2337/db09-0797), so the E_GABA slider applies outside the brain. The mouse/human difference in Na⁺
    channels is a lesson in itself.
  - **What is new for the app:** K_ATP as the "glucose" control; a ~10 pF, high-resistance cell, so ranges, noise
    and electrode defaults need their own values; spikes the detector may miss (it re-arms below −40 mV); and
    spontaneous firing, which suits the oscilloscope better than F–I families. No code oracle beyond whatever the
    authors' code allows: each model's check is its paper's numbers, as with the GnRH cell. The channels are new
    `Channel` objects; the solver should not need to change. The Integrated Oscillator Model's slow metabolic
    variables may not be channels at all; decide where they live before porting.
  - **Neighbor project:** beta_max (github.com/syncytium2/beta_max, private) ports Chen, Wang & Sherman 2008,
    granule secretion fitted to mouse and rat islets. It builds no membrane model (its ADR-0006: an averaged
    glucose → K_ATP → plateau voltage). Its engine takes voltage as input, `Drive = { Vmd, Vi, G }` in
    `src/core/chen08.ts` (the voltage the L-type and R-type channels see, and a glucose factor); a mouse V(t) from
    here can feed both voltages later. That is why mouse comes first: it can drive that engine without mixing
    species. Keep the two apps separate until both work. PDFs stay out of this public repository.

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
