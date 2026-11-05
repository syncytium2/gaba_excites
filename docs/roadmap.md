# Roadmap

What is deliberately NOT in v0.1, and the order it is likely to arrive in.
The owner's words are quoted where the item came from them.

## High priority

- **GABA in the islet: what the beta cells' GABA inputs really are, and how the app should offer them.** The owner,
  2026-11-04, on the human beta cell's GABA PSC panel: "Describe gaba inputs to beta cells. I don't know this
  literature. Is it synaptic or paracrine like", then "Document your findings for more detailed follow up as a todo
  with high priority. Keep the psc panel with a siren warning. This is exactly what we built the site for".

  **Done now:** the PSC panel stays on both beta cells; turning on a GABA or glutamate PSC input lights the siren with
  the reason (`ModelDef.pscNote`, `settingWarnings` in `src/core/extremes.ts`; [ADR 2026-11-04-8e7a](adr/2026-11-04-8e7a-beta-cells-keep-the-psc-panel-and-the-siren-says-why.md)).

  **Found so far, from PubMed abstracts only (full texts not yet read):**
  - Neither synaptic nor classic paracrine from another cell type: the beta cells make the GABA and it acts on
    themselves and their neighbors. Braun et al. 2010, Diabetes 59:1694 (doi:10.2337/db09-0797): GABA_A currents in
    52% of human beta cells (9 pA/pF), 91% of delta cells (148 pA/pF), 6% of alpha cells (2 pA/pF); beta cells secrete
    GABA by glucose-dependent exocytosis of insulin granules and by a glucose-independent route; "an autocrine
    positive feedback loop". Its release events were seen with GABA_A receptors added by adenovirus as sensors.
  - Much of the release is not vesicular. Menegaz et al. 2019, Nat Metab 1:1110 (doi:10.1038/s42255-019-0135-7):
    human beta cells lack a vesicular GABA transporter; GABA accumulates in the cytosol and leaves in pulses through
    VRAC (LRRC8A/Swell1), imposing a rhythm on pulsatile insulin secretion; depleted in type 1 and type 2 diabetic
    islets.
  - The receptors are high-affinity; the islet's GABA level is unknown. Korol et al. 2018, EBioMedicine 30:273
    (doi:10.1016/j.ebiom.2018.03.014), whose abstract says "the effective, physiological GABA concentration range
    within human islets is unknown": native GABA_A receptors on human beta cells open most often at 100–1000 nM GABA, and desensitize in
    saturating GABA; diazepam, propofol and GLP-1 enhance them; higher affinity in type 2 diabetes.
  - On alpha cells it inhibits: Rorsman et al. 1989, Nature 341:233 (doi:10.1038/341233a0), guinea pig: GABA
    co-secreted with insulin activates GABA_A Cl⁻ channels in alpha cells, part of glucose's inhibition of glucagon.
    The same transmitter excites the beta cell and inhibits the alpha cell: a GABA-excites lesson inside one islet.

  **To follow up:**
  - Start with the review Weitz, Menegaz & Caicedo 2021, Diabetes 70:17 (doi:10.2337/dbi19-0033), which describes
    "new developments that revise current notions about purinergic and GABA signaling in islets".
  - Settle how GABA leaves the beta cell. Braun 2010 reports release by exocytosis of insulin granules; Menegaz 2019
    says beta cells lack a vesicular GABA transporter, so the GABA is cytosolic. Brief events are worth offering only
    if the granule route holds.
  - The bath GABA knob is a dose, not the islet's signal: it is calibrated at 10 µM to 1 mM, its smallest step is
    5 pS/pF, and the model has no desensitization. A tonic conductance at Korol's 100–1000 nM would need its own
    control, well below that range, and a number from the full text (found 2026-11-04 in review).
  - The Birnir group (Uppsala; Korol 2018 is theirs) for whole-cell tonic GABA currents in human beta cells.
  - Read the full texts (fetch through murderboard's `fetch_paper.py`; never commit the PDFs): Braun 2010's release
    events (amplitude, kinetics, frequency, whether any are seen without the sensor), Menegaz 2019's pulse period and
    amplitude, Korol 2018's single-channel and whole-cell numbers, and the tonic-current literature from the Birnir
    group.
  - Decide what the app offers instead of, or beside, the generic PSC barrage: a pulsatile ambient GABA conductance
    (Menegaz), a tonic conductance at Korol's concentrations, or autocrine events sized from Braun's sensor data. Each
    needs its numbers cited through `lit/sources.json` and a test against the paper.
  - Glutamate: the siren warns for glutamate PSCs on beta cells too, on the absence of any source here describing
    synaptic glutamate input. Check the islet glutamate literature before saying more; from memory, not yet checked:
    the Caicedo group on glutamate as an alpha-cell signal, and NMDA receptors on beta cells.
  - Whether the mouse beta cell (Bertram 2004, no GABA conductance) should get one, and from which mouse data.
  - Delta and alpha cells: if the app ever models them, GABA's opposite effects there are the lesson.

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

## Not now (the owner: "no time, so make a todo")

- **Rheobase from −70 mV for every cell.** The owner, 2026-11-04, asked whether the human beta cell's rheobase from
  a standard potential should replace the family's least firing step everywhere: "Everywhere", at "−70 mV, every
  cell", then "Maybe restrict to current task for now. Mark as to do to make it global". So only the human beta cell
  measures from −70 mV (`ModelDef.rheobaseFromMv`, `src/core/rheobase.ts`); every other cell still reports the
  family's least firing step, now with the Vm it was measured from. Going global moves quoted numbers. Measured
  2026-11-04, 800 ms step, published cells, held at −70 mV versus today: pyramidal 544 against 561 pA, fast-spiking
  384 against 385, LTS 69 against 39 (it rests at −84 mV), squid axon 314 against 225 (rests at −65), GnRH 15.6
  against 17. Before it does, decide what holding at −70 means for the GABA crossover (gaba.test.ts): a holding
  current that cancels GABA's shift of Vm changes the experiment the app is named for. Every place that quotes a
  rheobase then gets updated: presets, tour, README, methods, llms.txt, extremes' current bound.

- **Reversal potentials differ between cell models, and a teaching point may be hidden there.** Voltage clamp now
  takes E_rev from the selected model (E_Na +50 mV on the cortical cells, +54 on the GnRH cell). The lesson the owner
  glimpsed (2026-10-30): what assuming another cell's E_rev does to a G–V and its fit, e.g. normalizing the GnRH
  sodium current with the cortical +50 mV inflates G near reversal. Not now.

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
  - **A pure simulation mode** (the owner, 2026-10-30: "pure simulation mode without the hassle of a cell/electrode.
    just the channels and an interface to manipulate parameters and see the effect on the currents as well as the
    curves"). Beyond the view above: no cell either, so no membrane, Cm or leak, only the channels under a commanded
    voltage. Each channel's parameters exposed (maximal conductance or permeability, reversal, the half-activation and
    slope of each gate, its time constants), and every change redrawn at once in two places: the currents for the
    protocol, and the curves behind them (m∞, h∞ and τ against voltage, the steady-state and peak I–V, G–V). This is
    where the channel editor in "Plug-and-play channels" above would live, and it needs that item's serializable
    channel description first. Labeled, like the view above, as what no rig can record.
- **Permeability beside conductance and current** (the owner, 2026-10-30). Today a channel is specified by a
  maximal conductance and draws I = g·(V − E): an ohmic channel. Add permeability as a third way to specify and to
  plot a channel, through the GHK current equation, I = P·z²F²V/RT · ([C]i − [C]o·e^(−zFV/RT)) / (1 − e^(−zFV/RT)).
  Why each one matters, for the explainer:
  - **Current** is what is measured and what moves the voltage: the electrode reports it, and it is what charges Cm.
    It depends on everything at once, the channel, the voltage and both concentrations.
  - **Conductance** is current per unit driving force, I / (V − E). It is the number HH-style models are written in
    and what gating scales, and it is the right summary when the I–V of the open channel is a straight line. It is
    not a property of the channel alone: change the concentrations and it changes, and where the open-channel I–V
    bends, a single g is a different number at every voltage.
  - **Permeability** is the property of the channel itself, how readily one ion crosses it, independent of how much
    of that ion is on each side. It is the right specification whenever the concentrations are lopsided or change:
    Ca²⁺ channels (micromolar inside, millimolar outside, so the I–V rectifies hard and never reaches E_Ca), and
    chloride in this app's own subject, where moving [Cl⁻]i moves E_Cl and, by GHK, the GABA_A conductance too. A
    channel defined by P keeps that P when the bath or pipette changes; one defined by g silently does not.
  - Showing the three side by side for one channel, with the concentrations as knobs, is the lesson. It pairs with
    the GHK teaching page below. Any equation or value taken from a source for it is cited through `lit/sources.json`.

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
  - **Human, second. Built 2026-11-02, reviewed by the owner and deployed 2026-11-04 in v0.2.13** (Pedersen's
    permission granted; see `docs/process.md`). Riz, Braun & Pedersen 2014 (PLoS Comput Biol, doi:10.1371/journal.pcbi.1003389), which adds
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
    granule secretion fitted to mouse and rat islets. It builds no membrane model (its `docs/adr/0006-electrical-activity-is-averaged.md`: an averaged
    glucose → K_ATP → plateau voltage). Its engine takes voltage as input, `Drive = { Vmd, Vi, G }` in
    `src/core/chen08.ts` (the voltage the L-type and R-type channels see, and a glucose factor); a mouse V(t) from
    here can feed both voltages later. That is why mouse comes first: it can drive that engine without mixing
    species. Keep the two apps separate until both work. PDFs stay out of this public repository.

## Later

- **The amplifier as the gateway to testing hypotheses** (the owner, 2026-10-30, a long-term idea). One amplifier,
  the same front panel, gets you everything a rig does: action potentials in current clamp, PSCs and voltage-gated
  currents in voltage clamp, and dynamic clamp (a conductance injected in real time, computed from Vm). A question
  becomes a choice of mode and protocol on that one instrument, not a separate page. The three modes built so far are
  the start of it; dynamic clamp would be the fourth.
  The rest of the rig belongs with it (the owner, 2026-10-30, long term): a **puffer** for GABA and other agonists
  (a brief local application, with its own rise and washout), **evoked stimulation** (an extracellular stimulating
  electrode that drives synaptic release on command, as opposed to the spontaneous PSC generators now), and
  **pharmacology** (drugs applied to the bath: channel blockers at a dose, beyond today's all-or-none block switches,
  and receptor antagonists, with their wash-in and wash-out).

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
