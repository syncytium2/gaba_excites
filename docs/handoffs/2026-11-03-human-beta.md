# Handoff 2026-11-03: the human beta cell, built and waiting for the owner's review

**Written by the session that surveyed beta-cell models, added the mouse beta cell's voltage-clamp caveat and built
the human beta cell overnight (2026-11-02 to 03).** Its context ran short. This note holds everything the next
session needs, including every open issue and concern. **Do not deploy until the owner has reviewed the branch and
said so.** His standing instruction: "Do not deploy until i review your update in the morning." He has not reviewed
it yet.

## Where things stand

- **Branch `human-beta`**, worktree `~/Developer/gaba_excites-worktrees/human-beta`, pushed to `origin/human-beta`.
  Three commits on top of `origin/main` (`f6286a5`), so it merges as a fast-forward:
  - `80c62c8`: the core (model, pool, solver input, tests);
  - `af0e6e8`: the app (presets, spike level, siren, methods page);
  - `fa514e1`: the reversal potentials Pedersen fitted Braun's recordings with (from the supplement).

  This handoff is a fourth commit.
- **Not merged, not deployed.** The live site is v0.2.12 (`8ef655f`).
- **`origin/main` is one commit past the live site.** `f6286a5`, "Beta cell: say that its channels were not fitted to
  voltage clamp", is merged but not deployed. The next deploy ships it together with whatever else is merged.
- **The local `main` checkout is behind `origin/main`** (at `8ef655f`). Pull before working there.
- **The full record is in `docs/process.md`.** Read the 2026-11-02 entries:
  - "the beta cell's channels were not fitted to voltage clamp, and the app says so";
  - "the human beta cell, built overnight on a branch".

  The roadmap entry is `docs/roadmap.md`, "Human, second".

## Pedersen's permission

The owner emailed Morten Pedersen (pedersen@dei.unipd.it) on 2026-11-02. **The email asked only for permission to
build a teaching simulation from his model, with attribution. It asked no technical questions.** Pedersen replied
positively. The owner said on 2026-11-03 that he will paste the correspondence.

When he does:
- add a dated entry to `docs/process.md` that quotes the permission;
- note it in the `pedersen2010`, `riz2014` and `riz14code` entries of `lit/sources.json`, then run
  `node scripts/lit.ts`;
- bring anything else Pedersen says (a caveat, a request about how to credit him) to the owner before acting on it.

Do not describe the reply as answering design questions; none were asked.

## What was built

Riz, Braun & Pedersen 2014 (PLoS Comput Biol 10:e1003389), on Pedersen 2010 (Biophys J 99:3200). Pedersen 2010 is the
same model with SK off, HERG 0.2 nS/pF, K_ATP 0.015 nS/pF and a P/Q slope of −10 mV, so one port covers both papers.
The model id is `betahuman`.

The files:
- `src/core/human.ts`: the model;
- `src/core/human-run.ts`: a bare runner for the tests;
- `src/core/pools.ts`: `rizPool`;
- `src/core/human.test.ts` (16 tests) and `src/core/human-app.test.ts` (9 tests).

The transcription is `lit/notes/riz2014.md`, with every sign checked against the authors' XPP files, because the PDF
text layer drops minus signs. The methods page has a section, `#betahuman`, with a voltage-clamp paragraph,
`#human-vc`. README and `public/llms.txt` mention the cell.

**How it was checked.** The authors' `PLoSCompBiol_Fig1.ode` was transcribed literally into a Python script and
integrated by scipy's LSODA at tolerance 1e-9. Before the port, that reproduced Pedersen's reported numbers (4.63 Hz,
−8.4 and −67.9 mV, 7.06 Hz with HERG blocked, the TTX intervals). The port matches LSODA as follows:
- interspike intervals within 0.5% in nine configurations;
- first spikes within 0.2 ms;
- the two silent cells' voltages within 0.05 mV.

It also matches every number the papers report. The LSODA numbers are hard-coded in `human.test.ts`. **CI cannot
rerun LSODA**, so this check is weaker than the pyramidal cell's NEURON oracle, and the site should not call the
human cell "validated" the way it does the pyramidal cell. The methods page's wording ("checked against the authors'
equations") reflects that. Keep it that way.

**The authors' files and the LSODA script are not in the repository.** They are in the owner's library, in the
folder `01-lit/Riz 2014 Pedersen 2010 code and LSODA check/` (on Dropbox):
- `PLoSCompBiol_Fig1.ode`
- `human-BJ2010.ode`
- `human_Kir.ode`
- `riz_ref.py`

Run the script with `python3 riz_ref.py <config> [seconds]`, with configs such as `riz`, `pedersen`,
`pedersen-hergblock` and `pedersen-ttx`. It needs numpy and scipy. Run it again if the model, the integrator or dt
changes, and update the numbers in `human.test.ts`.

**Not ported:**
- Riz's glycolytic oscillator (one figure);
- the K_ATP noise.

## Decisions taken overnight, each for the owner to confirm or undo

These were made without him, under "proceed autonomously". Each is general code, not specific to this cell, so each
needs his yes. Every other model's tests, including the NEURON oracles, pass unchanged.

1. **The solver passes the Ca²⁺ current to channels that ask for it** (`Channel.readsICa`; `iCaDensity` in
   `simulate.ts`; `iSteady` in `cell.ts`). BK in this model is driven by the Ca²⁺ current itself (Pedersen Eq. 9).
   - AGENTS.md says "the solver should not learn about any particular channel." This change keeps to that, since any
     channel may ask, but it is a new kind of solver input.
   - He was asked about it before the build and has not answered.
   - The current is computed only when a cell has such a channel, so every other model's arithmetic is unchanged.
2. **A model may count spikes at its own level** (`ModelDef.spikeLevel`). This cell's spikes peak at −7 to −10 mV,
   and at −20 to −28 mV with GABA, TTX or less L-type current, so the app's −20 mV level missed the papers' own
   conditions.
   - This cell counts at −30 mV and re-arms at −50.
   - Every other model stays at −20/−40.
   - Sweeps, the F–I analysis, the report, the oscilloscope's Stream and the siren all use the model's level.
3. **The siren's "spike fails to overshoot 0 mV" check is skipped for this cell** (`ModelDef.spikesOvershoot: false`;
   `Limits.spikeUp` and `Limits.overshoot` in `extremes.ts`). Its published spikes never overshoot. **The siren's
   criteria are the owner's (2026-10-16)**, so this one especially needs his word.
4. **A spike whose upstroke never reaches 20 V/s has no threshold or half-width** (NaN, shown as "—";
   `analysis.ts`). This cell's spikes rise at about 7 V/s, and the readout had shown −30.0 mV, the counting level, as
   "threshold". General, but no other model's spikes are that slow.
5. **A step preset that sets knob values shows as Custom once the knobs move** (`presetHolds` in `App.tsx`). Without
   this, choosing a scope pattern and then the step protocol left "Picoamps steer its firing" on the menu after the
   pattern had changed K_ATP, so the note's numbers no longer applied.
   - **This also changes the squid axon**: "Warmed to 18.5 °C" now shows as Custom when its temperature moves.
   - A preset that sets knobs also moves the pattern menu to the matching pattern.
6. **Knobs are in pS/pF** (K_ATP 10, 21; SK 100; HERG 0–500; GABA 0–400), not the papers' nS/pF, so the published
   values are whole numbers that fit the readout; `paramsFromKnobs` divides by 1000. Knob readouts now take their
   decimals from the knob's step (`digitsFor`), which leaves other models' readouts as they were.
7. **The step protocol is enabled for this cell.** The mouse beta cell has it disabled: its rhythms are 30 s to 5 min.
   This one spikes at about 6 Hz, so a 3 s sweep shows it. It has one preset, picoamp steps on the spiking cell:
   12, 9, 0 and 18 spikes in 2 s at 0, −1, −2 and +4 pA.
   - Rheobase is undefined for a spontaneously firing cell.
   - The siren's current scale is the silent cell's rheobase, 1.0 pA (K_ATP 21 pS/pF, Riz Fig. 5A; Rin 4.4 GΩ).
   - The current dial steps by 0.5 pA for this cell.
8. **E_GABA opens at −40 mV**, Riz's E_Cl. Three oscilloscope patterns:
   - spiking;
   - GABA on a silent cell (one spike, then −44 mV);
   - GABA on an active cell (faster firing, 7.7 Hz with 10 µM).

## Open issues and concerns

- **PSC size and kinetics are unsourced for beta cells.** The PSC controls use the app's generic synapse (3 nS
  peak), which is large for a 10 pF cell. The bath GABA knob (`gGABAR`) is the papers' experiment; the PSC controls
  are not. Either find a source for beta-cell GABA_A PSCs or make it clear these are generic.
- **Rin and "rest" in the header are taken at an unstable fixed point** (−44 mV, 667 MΩ) of a cell that never rests
  there, as for the mouse cell. Misleading for a spontaneously firing cell. Not fixed.
- **Voltage clamp does not reproduce Braun 2008.** Pedersen's supplement (Figs. S1–S3, now in the library) shows that
  he fitted Braun's recordings with **E_Ca +40 mV and E_Na +100 mV**. His firing simulations, and this app, use
  **+65 and +70 mV**.
  - Reproducing Braun's I–V curves would need the reversals changed per preset, which the app cannot do; a model's
    reversals are fixed.
  - Also, Na⁺ and Ca²⁺ activation is instantaneous, so currents have no rising phase after a step.
  - The VC note (`vcNote`, under the voltage-clamp plots) and `#human-vc` say both things; `human-app.test.ts`
    pins the wording.
  - Whether to build Braun-reproducing VC presets, and with which reversals, is the owner's decision. He has not been
    asked to decide.
- **A possibly better human Ca²⁺ current exists:** Félix-Martínez & Godínez-Fernández 2015 (Math Biosci 270:66) fit
  Hodgkin–Huxley kinetics to human Ca²⁺ currents. It is paywalled and on the want-list. It would change the model, so
  it is not a quick swap.
- **Riz's recorded traces** are in the owner's `~/Downloads/ExperimentalTraces_Riz_PLoSComputBiol2014` (CSVs for
  Figs. 2A, 3A, 3C, 3E, 4B). **The dataset is CC BY-NC-ND.** They may be used to compare the model locally, or to
  quote numbers measured from them. They must never be committed, since this repository is public. Untouched so far.
- **The authors' XPP files carry no license.** Software S1 of a CC BY article, but the files themselves say nothing.
  They are used only as a check and are kept out of the repository, per the project rule "port from papers; use the
  authors' code only as a check".

## Housekeeping, for the owner to decide

- `~/Downloads/PIIS0006349510010994-2.pdf` duplicates Pedersen 2010; it can be deleted.
- `~/Downloads/mmc1.pdf` is filed in the library as "Pedersen 2010 biophysical model human beta-cells SUPPLEMENT Figs
  S1-S3.pdf" and can be deleted from Downloads.
- **Want-list (`01-lit/_NEEDED.md`):**
  - The line for Riz 2014's Software S1 and S2 is still unticked, though the `.ode` files were obtained from Pedersen's
    page and are now in the library. The correction (PMC3938408) was not checked against the transcription.
  - Andrean & Pedersen 2022 (the population version) and Fridlyand 2013 are also listed, for later.
- **Worktree `beta-caveat`** is merged to `origin/main` and can be removed. Other worktrees (`explainer`,
  `gnrh-rest`, `hh-paper`, `hh-squid`, `lts-cell`) belong to other handoffs; leave them.

## To merge and deploy, once the owner approves

1. In the `human-beta` worktree: `npm test`, `npx tsc -b`, `npm run build`, `node scripts/fi.ts --help`.
2. Run the screenshot check against a preview (`node scripts/screenshot.mjs <url> <outdir>`). It has a human-cell
   block: the scope pattern, steps mode showing Custom, choosing "Picoamps steer its firing" and waiting for "6
   sweeps simulated" with no siren, and the VC note.
3. Fast-forward `main` to `human-beta` and push.
4. Deploy with `npm run deploy` only (never `wrangler deploy` by hand). Record the deploy in `docs/process.md` as
   past releases did.
5. Update `docs/roadmap.md` ("built on a branch" becomes "deployed") and mark this handoff done in
   `docs/handoffs/README.md`.

If he asks for changes to any overnight decision, apply them, then re-run the tests, the screenshot check and,
if the model changed, `riz_ref.py`.
