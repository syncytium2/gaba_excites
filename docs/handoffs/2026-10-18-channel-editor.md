# Handoff 2026-10-18: a single-cell Na⁺ channel editor, and an excitability scorecard

**Written by the session that built the leak control, the oscilloscope, the fast-spiking cell, the siren and Old school
(2026-09-23 to 2026-10-18).** Runs in parallel with [`2026-10-18-explainer.md`](2026-10-18-explainer.md). Read its
Coordination section too. **Nothing here is built yet.** Tony said "advise, no coding" for this design; the next step is
his go-ahead.

## Why

Three of Tony's goals converge on one tool:

- understanding threshold, including A-type K⁺ channels against Na⁺ channel properties, compared across models;
- multiple definitions of excitability and hyperexcitability;
- studying ion channel mutations and epilepsy. He asked for a thorough search of Lori Isom's research (Michigan,
  sodium channel β subunits, Dravet syndrome and DEE).

**What he decided on 2026-10-18:**

- **Single cell only.** He judged a two-neuron circuit (interneuron to pyramidal cell) "a big leap from where we are
  now". Drop it from near-term plans.
- **Mutations as shifted voltage dependence.** He pictured mutations as shifted voltage dependence of the Na⁺ channel.
  That is right for the α-subunit variant literature, but not the main theme of Isom's lab (see below). Frame the tool as
  **"how changing Na⁺ channel properties changes excitability"**, with cases from the variant literature.

## The design, as advised (confirm with Tony before building)

1. **Na⁺ controls on the Traub Na⁺ channel,** which the pyramidal (`rs`) and fast-spiking (`fs`) cells share:
   - conductance scale (0.5 models haploinsufficiency);
   - separate activation V½ and inactivation V½ shifts;
   - inactivation slope;
   - τ scale for inactivation and recovery;
   - a persistent fraction, as incomplete inactivation: h_eff = f + (1 − f)·h. It adds no state variable.
2. **Generic controls for any channel,** proposed at the start of the 2026-09-23 session: a conductance scale; a
   whole-channel voltage shift, which calls the inner channel at V − ΔV; and a τ scale, which calls `advance(v, dt/s)`.
   The τ scale is exact for Rush–Larsen gates and for the Markov Na⁺ scheme, since scaling all rates is scaling time.
   These wrappers keep the solver channel-agnostic, as AGENTS.md requires.
3. **The GnRH Markov Na⁺ channel comes second.** Separate shifts there mean shifting the rate functions. Its I_NaP and I_A
   are ordinary gated channels and take the generic controls.
4. **Edits travel as data:** `CellParams.edits` (serializable), applied in `activeSet()` (`src/core/cell.ts`). The worker
   receives only `CellParams`. Channels are closures, so nothing else can reach the worker.
5. **Rules that already bind:**
   - **The leak control is gL in nS, and nothing but its slider moves it.** Tony's rule: a channel edit must not adjust
     the slider. Rin is measured and will change with edits, and that change is the point.
   - **Every edited cell shows a "modified" label,** and its validation sentence and preset numbers stop applying.
   - **A test confirms that with no edits the cell is identical,** so `oracle.test.ts`, `gnrh.test.ts` and `fs.test.ts`
     still pass through the edit path.
   - **The oscilloscope rebuilds the cell around the same state vector,** in `Stream.setCell`. Edits that do not change
     `nGates` keep the state; the persistent fraction adds no gate.
   - **Settle time:** a τ scale above 1 needs a longer settle, or a cap.
   - **No stable rest:** big edits can leave the cell without one, and `steadyV` then returns NaN. Report it rather than
     computing nonsense. The Cell panel already handles NaN rest.
6. **The scorecard:** each definition of excitability, for the edited cell against a pinned reference, with up and down
   arrows and disagreements highlighted. The definitions:
   - rheobase;
   - voltage threshold, and the gap from rest to threshold;
   - Rin;
   - F–I gain;
   - adaptation;
   - latency at a fixed multiple of rheobase;
   - spontaneous firing;
   - later, firing probability near threshold under noise (on the roadmap).

   The siren covers extreme drive. **The scorecard must count spikes that never repolarize:** today's detector
   (`src/core/analysis.ts`) skips them, and Na⁺ edits and K⁺ blocks produce them.
7. **Cases, each with numbers transcribed from a full-text paper** into `lit/notes/`, plus a `lit/sources.json` entry.
   Candidates: the β1 shifts, one SCN8A depolarized-inactivation variant, and SCN1A haploinsufficiency on the
   interneuron. For the cell-type point, apply the same change to `fs` and to `rs` separately. "Less inhibition" can be
   imitated with the existing GABA input rate. No circuit.

**Offered and not yet answered:** a scratch experiment first, outside the repo. Shift Traub activation and inactivation
a few mV each way, and show how threshold, rheobase and firing respond in `rs` and `fs`. Ask Tony.

## Findings from 2026-10-17 to 2026-10-18 that this tool builds on

**Threshold belongs to Na⁺.** In scratch experiments, blocking K⁺ from a matched starting potential (Tony's rule: the
only fair comparison) left voltage threshold unchanged by 0.4 mV or less in all three cells. Rheobase moved and spikes
became very wide.

| Cell, condition | Threshold | Rheobase | Latency at 1.5× control rheobase |
|---|---|---|---|
| rs, control | −39.3 mV | 561 pA | 16.0 ms |
| rs, Kd + M blocked | −39.4 mV | 517 pA | 15.6 ms (spike never repolarizes) |
| fs, control | −39.2 mV | 385 pA | 12.1 ms |
| fs, Kd blocked | −39.1 mV | 382 pA | 12.0 ms (never repolarizes) |
| gnrh, control | −32.5 mV | 15.9 pA | 217 ms at 24 pA |
| gnrh, I_A blocked | −32.7 mV | 23.1 pA* | **159 ms** |
| gnrh, I_K blocked | −32.5 mV | 15.9 pA | 217 ms (half-width 124 ms) |

- **I_A sets GnRH's delay, not its threshold.**
- **\*The I_A row was not quite matched:** it settled at −72.0 mV, not −70.1 mV, because the settle was 3 s and GnRH
  needs about 8 s. Rerun it with the full settle before quoting it.
- **With I_A, I_K and I_KCa all blocked, GnRH rests near −60 mV,** and no holding current within ±50 pA brought it back
  to −70 mV. Tony's view, in his words: "We blocked K channels. So Vm is depolarized. Educational!!"
- **The tool should offer both views:** "let it depolarize" (K⁺ sets the resting potential) and "hold the starting Vm"
  (Ihold re-solved automatically, so threshold can be seen to belong to Na⁺).

**The published match:** Kress, Dowling, Eisenman & Mennerick 2010, Hippocampus 20:558, doi:10.1002/hipo.20667, a free
NIH manuscript.
- Intracellular TEA, with a bias current to restore a negative rest, left DG voltage threshold unchanged and altered
  rheobase. The APs were very wide (scale bar 150 ms against 3 ms).
- They note other studies where K⁺ channels active near rest do move threshold (Bekkers & Delaney 2001; Shah et al.
  2008). Show both regimes.
- They also show that axon initial segment Na⁺ distribution sets threshold. That is a limit of our single compartment:
  say so.

**Mistakes made while getting these numbers. Do not repeat them:**
- Index sweeps with **`sweep.sampleMs`**, never `DEFAULT_SIM.sampleMs`. 0.025 ms rounds to every 3 steps, so samples are
  0.03 ms apart.
- Bound the holding-current search to what the cell can take: ±50 pA for GnRH.
- Count spikes that never repolarize.
- Settle each model for its own `settleMs`.

**Isom's research,** from a digest of all 149 of her PubMed records:
- Her program centers on β subunits as channel modulators, adhesion molecules and nuclear signals.
- Her mouse models mostly change Na⁺ current **density**, **persistent** current and **resurgent** current, and differ
  by **cell type**:
  - PV interneurons are hypoexcitable in Scn1b and Scn1a models (Yuan 2024, doi:10.1093/brain/awad349;
    Hull 2020, doi:10.1002/acn3.51205);
  - Scn8a-N1768D raises persistent current in CA1 pyramidal cells (Lopez-Santiago 2017, doi:10.1073/pnas.1616821114);
  - SCN8A patient iPSC neurons show persistent or resurgent current, depending on the variant (Tidball 2020,
    doi:10.1093/brain/awaa247).
- **Numbers stated in abstracts:**
  - β1 shifts Nav1.2 inactivation V½ 10–12 mV negative and activation 2–11 mV negative (Isom 1995,
    doi:10.1074/jbc.270.7.3306);
  - SCN1A-D1866Y leaves about 10 mV of inactivation difference with β1 present (Spampanato 2004,
    doi:10.1523/JNEUROSCI.2034-04.2004);
  - Scn2b-null DRG neurons lose 51% of maximal TTX-sensitive conductance (doi:10.1523/JNEUROSCI.2211-06.2006).
- **Voltage-shift variant work from other labs:** SCN8A (Ottolini 2017, doi:10.1523/JNEUROSCI.2709-16.2017), SCN2A
  (Clatot 2025, doi:10.1111/epi.18234), and SCN1A and SCN2A with dynamic clamp (Berecki 2019,
  doi:10.1002/ana.25438; Berecki 2025, doi:10.1093/brain/awae213).
- **Drugs:** PRAX-562 blocks persistent current about 60-fold more than peak (Kahlig 2022, doi:10.1111/epi.17149).
  Carbamazepine paradoxically raises persistent current in Scn1b-null neurons (Uebachs 2010,
  doi:10.1523/JNEUROSCI.1534-10.2010).
- **Most usable numbers are full-text only.** The key papers are free on PMC, so fetch them with
  `~/Developer/murderboard/fetch_paper.py` (PMC is an allowed host). Persistent current measured on a ramp is not
  interchangeable with persistent current measured late in a pulse. Age and strain matter (P14–P25, C57BL/6J).
- **Resurgent current needs a new Markov Na⁺ model** (a blocking particle), checked against its source. That is a later
  phase.

**GnRH, I_A and estradiol:** DeFazio & Moenter 2002 (doi:10.1210/me.2002-0155; the PDF is on Tony's literature
want-list) report that estradiol lowers threshold and latency through I_A. Adams 2018 (our GnRH model) found no
estradiol effect. Its Step 2 parameters (g_A 313 nS, I_A inactivation V½ −69.8 mV) come from a compensation between g_A
and V½, against Step 1's voltage-clamp fit (70.2 nS, −60 mV). Tony hopes the two papers contradict each other. The
editor could let students move along that g_A/V½ trade-off and see which excitability measures hold.

## Coordination with the explainer session

- **You own:**
  - `src/core/channels.ts`, `src/core/cell.ts`, `src/core/models.ts`;
  - a new channel panel component;
  - the scorecard;
  - the spike-detector change;
  - the tests for all of them.
- **You both edit `src/App.tsx`.** Keep your changes contained, for example a `ChannelPanel` component and a
  `Scorecard` component. Merge or rebase onto main before you finish.
- **The explainer session owns** `public/explainer.html` and any URL-encoded settings (`src/urlstate.ts`). If deep links
  must encode channel edits, agree a format with it, or leave edits out of its version one.
- **Worktrees, always:** `git worktree add ../gaba_excites-worktrees/<slug> -b <slug>`. Never `git add -A`.
- **Deploy only with `npm run deploy`, only from main, and only after asking Tony.** One deploy at a time. Check
  `DEPLOYED.md`, and give him the rollback command.
- **Repo rules in AGENTS.md:**
  - `.ts` imports inside `src/core/`;
  - no TypeScript parameter properties in `src/core/`: plain `node` cannot run them, and the CLI breaks;
  - re-run the NEURON oracle if the model, the integrator or dt changes. Rebuild the oracle environment with the
    instructions in `tools/neuron_oracle.py`. On 2026-10-15 a scratch venv with NEURON 9.0.2 and ModelDB 123623 at commit
    `8dfc13f` regenerated `neuron_rs.json` byte-identically;
  - log decisions in `docs/process.md`.
- **Tools:** papers via murderboard's `fetch_paper.py` (`--have` first); other tools via armory (`~/Developer/armory`)
  before writing your own.

## Small fixes still open (see `docs/roadmap.md`)

- **The first-sample dip:** the first recorded sample dips when a step starts at 0 ms.
- **The sample-rate comment:** `src/core/simulate.ts` says 40 kHz; the real rate is 33 kHz.
- **The spike detector:** it skips spikes that never repolarize. The scorecard needs them.
