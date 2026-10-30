# Process log

How this repository was built, in order, including the decisions and the
reasons for them. It is written as we go, not reconstructed afterward.
Newest entries at the bottom. Times are local (America/Detroit).

## 2026-09-21 — the brief

The owner asked for a web simulator that demonstrates excitability:

- a standard model of cortical pyramidal action-potential firing, in the
  Hodgkin–Huxley formulation;
- controls for passive properties: Rin, Cm, Rs, Ihold;
- current clamp only, to begin with;
- an interface flexible enough to run a series of current steps, so that it
  shows threshold and the F–I curve;
- GABA and glutamate PSCs, each with frequency, amplitude and tau; GABA
  Erev is a variable, default −80 mV;
- light enough to run locally in the browser; a repo, a webapp, and in the
  end a site under tonydefazio.com;
- templates from the owner's `no_peak` and `colonel_kernel` repos.

Added while work was under way: name it **gaba_excites**; make it a **public
repo from the first push**; **document the process** (this file); **stock
channels only for now**, with plug-and-play channels and a channel editor in a
later version; **mark the born-on date and time** in the app.

## 2026-09-21, 11:40–12:15 — first build, v0.1.0

Built in one session with Claude Code (Claude Opus 5), the owner steering by
messages sent during the work. In order:

### Templates read first

`no_peak` and `colonel_kernel` were read before anything was written, and
`tonydefazio.com` for how the destination sites are linked. Taken from them:
Vite + TypeScript + React (no_peak's stack) with uPlot (colonel_kernel's
plotting); an assets-only Cloudflare Worker per subdomain; a strict CSP
injected into the *built* HTML only; `public/_headers` with `no-transform` so
Cloudflare cannot inject its analytics beacon; a static `/methods` page and
`llms.txt` for readers that run no JavaScript; a gated `scripts/deploy.sh`
that writes `DEPLOYED.md`; `src/core/` pure and runnable by plain `node`
(explicit `.ts` imports); no_peak's light palette.

### The model: pulled from source, not from memory

"A standard model of cortical pyramidal action potential firing, akin to
Hodgkin–Huxley": chosen, the **regular-spiking cell of Pospischil et al.
2008** — a minimal HH-type model fit to cortical recordings, with Traub INa/IKd
and a slow M current for adaptation, and widely reused. The parameters were
taken from the ModelDB 123623 source files (`sPY_template`, `HH_traub.mod`,
`IM_cortex.mod`), cloned from GitHub, not from recollection of the paper —
which mattered: the paper's in-vitro fit and the ModelDB cell differ, and the
ModelDB cell is the one with runnable code to check against.

### Mistakes caught, and how

- **A unit slip made every channel 1000× too small.** mS/cm² × pF is already
  nS; the first draft multiplied by another 1e-3. The symptom was a cell that
  never fired at 1 nA and a perfectly linear I–V. Found by probing the gate
  values directly.
- **Rin could not simply be 1/gL.** The channels open at rest conduct too, so
  gL = 1/Rin would make the "Rin" knob measure 7% low on the published cell.
  Decision: Rin means *what you would measure at rest*, and the leak is solved
  by bisection to make that true. The template's own "Rin = 34 Meg" is the
  leak alone; the measured value is 32.1 MΩ.
- **A preset claimed more than the data showed.** "GABA depolarizes yet
  raises rheobase" was written from a first probe; the app at 100 pA steps
  and a different barrage showed no change. Rheobase was then bisected to
  1 pA across E_GABA and three seeds, which turned up the cleaner result — the
  crossover at −50 mV, 11 mV below threshold — and the presets were rewritten
  to quote measured numbers, with `gaba.test.ts` pinning them.
- **The synaptic-barrage preset did not fire** at 400 Hz; this cell's
  32 MΩ Rin needs ~1000 Hz of 3 nS events. Retuned by measurement.
- **The methods page said doubling Cm doubles rheobase.** With Rin held
  fixed it does not (590 / 561 / 551 pA at 145 / 290 / 579 pF). Measured,
  corrected, and turned into a teaching point: rheobase follows Rin.

### Checked against NEURON

NEURON 9.0.2 was installed in a scratch virtualenv, the original ModelDB
mechanisms compiled, and the published cell run through a step family.
Spike counts match exactly at 500–1500 pA; every spike time is within 0.20 ms
at dt = 0.01 ms. At dt = 0.025 ms (NEURON's usual) the port drifted by
several ms over a second of firing, which is why the app uses 0.01 ms. The
reference is committed (`src/core/oracle/neuron_rs.json`) so CI checks
parity; the ModelDB mechanisms themselves are not vendored.

### Decisions the owner may want to revisit

- **Electrode model**: an ideal current source into a pipette node with Rs
  and a lumped pipette capacitance; bridge balance subtracts a fraction of
  I·Rs from the record. Default Rs 15 MΩ, bridge 100%, Cp 0 pF — so by
  default Rs is invisible, which is itself the lesson (Rs does not move Vm in
  current clamp). Unbalance the bridge or add Cp to see what it does to the
  record.
- **All measurements on true Vm**, not on the recorded trace, so electrode
  settings never change the F–I curve.
- **Glutamate E fixed at 0 mV**; only GABA's reversal is a control, as asked.
- **Light theme only**, as in no_peak.
- **Subdomain `gaba.tonydefazio.com`** is a placeholder in the canonical tags,
  sitemap and deploy script; not claimed in `wrangler.jsonc` until approved.

### Palette check

Run through the dataviz validator: blue/orange/aqua pass all-pairs CVD
separation (worst ΔE 9.2) and normal vision (24.0); aqua is 2.7:1 on the
surface, so GABA is always named in text beside the plot. The sweep ramp
dropped its darkest step, which could not be told from the one before it.

### Asked for mid-session, and done

- Named **gaba_excites**; repo **public from the first push**
  (github.com/syncytium2/gaba_excites).
- **This log.**
- **Stock channels only**, with the `Channel` interface as the seam for
  plug-and-play channels later (`docs/roadmap.md`).
- **Born-on date and time**: the root commit, 2026-09-21T11:53:40−04:00,
  made early for exactly this reason and baked into the bundle at build;
  shown in the header and footer in the offset it was committed in.

## 2026-09-21, afternoon — noise, and a second model

### Noise

Asked how to make the recording noisy, the recommendation was two separate
controls, because they teach different things. **Recording noise** is on the
trace only: filtered Gaussian at a chosen bandwidth, rescaled so the RMS set
is the RMS seen, plus mains hum. **Membrane noise** is felt by the cell: an
Ornstein–Uhlenbeck current injected at the membrane, not through the pipette
(so no bridge error), current-based so that Rin does not change. The owner
said to build both and to "hold on the measurement". Read as: keep measuring
on Vm, and defer the "measure on the recorded trace" switch and the
repeated-trials/probability view to the roadmap. Recording noise defaults to
0.2 mV RMS at 10 kHz; membrane noise defaults off, so every published number
still stands. Tests check that the RMS is what was set at every bandwidth,
that recording noise never touches Vm, and that the OU process has the SD
and correlation time asked for.

### The GnRH model

The owner asked whether there is a decent GnRH neuron model, noting "we
published one", and asked for a model selector. PubMed, searched by the
owner's name, turned up Adams, Stroberg, DeFazio, Schnell & Moenter (2018,
J Neurosci 38:1249), which fits a GnRH model with MCMC and adapts Moran et
al. 2016 and LeBeau et al. 2000. No code was public and none was on this
machine. PubMed Central's text came through without the equations, which are
images, so all 25 equation images were downloaded and read, and the
parameters were taken from Tables 1–3. The negative-feedback (OVX+E AM)
parameter set was used: Table 1's Step 2 conductances, with I_A's V½
inactivation at −69.8 mV.

The only check available was the paper's own numbers: −6 pA holds the cell
at −70 mV, and Fig. 7F's spike counts. The port gave −70.09 mV and exactly
0/0/0/1/4/6 **on the first run, with nothing tuned**. This is a weaker check
than the NEURON comparison for the pyramidal cell, and the app, methods page,
README and AGENTS.md all say which kind of check each model had.

One ambiguity was found and measured rather than guessed away: Table 2 lists
a fourth constant, d, for I_h's time constants that the printed Equation 15
omits. It is read as an additive floor. With and without it the spike counts
are identical, and a −30 pA trough moves by 0.4 mV.

To make room for a second model the core was generalized, not forked:
models became data (`models.ts`); the channel interface gained a calcium
argument; the state vector gained a calcium slot; and new builders cover
steady-state/τ gates, the three-state Markov Na⁺ scheme (advanced by the exact
2×2 matrix exponential), and I_KCa. The pyramidal cell's NEURON check
passed unchanged after the refactor. Presets now belong to one model each,
because they quote measured numbers. Two claims drafted for the GnRH presets
were measured before shipping. One of them was wrong: 0.5 pA is 0.2 mV at
this cell's Rin at −70 mV, not a quarter of a millivolt, and the note was
fixed. dt = 0.01 ms was checked against 0.0025 ms for this faster Na⁺ scheme
and is within 0.13 ms on every spike.

### E_GABA for the GnRH cell

The owner asked for the GnRH cell's E_GABA to default to −36.5 mV "from the
2000 paper", and to stay adjustable. Before it went into the code and the
docs, the number was traced to its source. PubMed has no 2000 paper that fits;
the full text of DeFazio, Heger, Ojeda & Moenter (2002, Mol Endocrinol
16:2872) has it: "E_GABA measured 100 msec after GABA application was
−36.5 ± 1.2 mV (n = 16 cells from 13 adult diestrous females)", by gramicidin
perforated patch. The default now belongs to the model (`defaults.eGaba`,
with its source string shown under the slider): −80 mV for the pyramidal
cell as before, −36.5 mV for GnRH. The GnRH presets carry it, GABA stays off
until ticked, and the CLI uses it when `--gaba` gives no E.

### A literature folder, and a companion page

The owner asked for "a lit folder for the repo and possibly as a companion to
the website". The owner's `murderboard-lit` is a local PDF library, not a
repository. This repository is public, so one rule was added: metadata, notes
and transcriptions are committed, and papers never are. `lit/pdf/` is
gitignored, and `lit/NEEDED.md` lists what to fetch by hand. Even the
open-access papers stay out, because a licence to read is not a licence to
redistribute. Automated download failed anyway: PMC and Europe PMC both answer
scripts with a browser challenge.

One file, `lit/sources.json`, is the source of truth for 14 sources. Each
entry records what was taken from the source, the exact quote where a single
number came from one, and the files that use it. `node scripts/lit.ts` renders
it three ways: `lit/README.md` for the repository, `lit/references.bib` for
citing, and `public/lit.html`, the website's `/lit` companion page.
`src/lit.test.ts` fails if a render is stale, if the methods page cites a DOI
the list lacks, or if a listed file does not exist. `lit/notes/` holds the
transcriptions. The most valuable is the GnRH model's: every table and
equation as read, how the flattened tables were reassigned to columns, and
the one ambiguity. The identifiers of each citation were checked in PubMed
before they went in.

### Collapsible panels

The owner asked for the left panels to be an accordion. They are
independent collapsible sections rather than one-open-at-a-time, because
comparing, say, Cell and GABA side by side is the point of the tool. Model,
Cell and Protocol start open; Electrode, the two PSC panels and Noise start
closed. A closed panel shows a one-line summary of its settings, so collapsing
never hides what the cell is doing. The PSC on/off checkboxes stay in the
header and work while collapsed, and ticking one, or choosing a preset that
switches an input on, opens its panel. Headers are real buttons with
aria-expanded. Checked by driving the page: click and Enter both toggle, and
the open state survives a reload. The state is kept in localStorage as a
convenience only, and every access is guarded.

### F–I from 0 pA, and what "true Vm" means

The F–I curve now starts at 0 pA, as the owner asked. Hyperpolarizing steps
fire nothing and serve the Rin measurement; they stay in the per-sweep table,
and the caption says so. "true Vm" gained a hover explanation: the membrane
potential itself, as opposed to the recorded trace, which is Vm plus I·Rs
(less bridge balance), smoothed by pipette capacitance, plus recording noise.
It also says that every number on the page is measured on true Vm. The
explanation is a focusable element tied to its trigger with
aria-describedby, so it works from the keyboard and by tap as well as by
hover. It was checked at phone width, where a hidden tooltip can still widen
the page.

### The owner's slow K⁺ inactivation, tried on Caroline's model

Asked, "for a big laugh", to pull the owner's GnRH potassium-current paper
(DeFazio & Moenter 2021, eNeuro) and to say what its very slow inactivation
would do to the Adams et al. 2018 model, which the owner struggled to run in
QuB. The inactivation parameters were read off Fig. 3 by eye, added to the
model's I_K as a slow gate, and swept in an experiment kept out of the app
(`tools/experiments/`). At the measured V½ (−30 mV) it changes nothing: not
the Fig. 7F counts, and not a 30 s step. Two reasons, each measured rather
than argued. The cell spends 94% of its firing time below −45 mV, so the gate
never closes. And this model's I_K has little leverage over firing rate: even
84% inactivated, firing rises only 14%. The full table and its reading are in
`lit/notes/defazio2021.md`, with the protocol where it could still matter
(long depolarized episodes, such as tonic depolarizing GABA).

## 2026-09-21, afternoon — going live for Wednesday's lecture

The owner asked that the slow-I_K experiment "persists in the repo". It was
already committed. It has now been refactored so that it can't quietly rot:
it exports its pieces, its model swap restores the published channels even
on error, `src/experiments.test.ts` checks both of those plus the headline
result on every run, and `tools/` is type-checked.

The site is for a lecture on Wednesday 2026-09-23. `gaba.tonydefazio.com`
was checked (it resolved to nothing) and declared as a custom domain in
`wrangler.jsonc`, following tonydefazio.com's own pattern. It is deployed
through `npm run deploy`. The card on tonydefazio.com waits until the owner
has reviewed the live site, as asked earlier.

Deployed: `npm run deploy` passed every gate and went live on workers.dev at
once. The custom domain took a few minutes for its certificate. This Mac had
cached the pre-deploy "no such host", so the live checks pinned Cloudflare's
address. All six routes, the CSP, `no-transform` and the absence of a beacon
were confirmed on `gaba.tonydefazio.com`, and a real-browser pass was clean.
One finding outside this repository: every tonydefazio.com site now answers
AI crawlers with 403, a zone-wide Cloudflare setting that no_peak's
robots.txt records as having been off. It was reported to the owner, not
changed.

## 2026-09-22 — the GnRH GABA PSC

The owner asked whether the GnRH GABA PSC decay "is really just 10 ms". It
was, but only by coincidence: the GnRH presets had inherited the generic
defaults (0.5 ms rise, 10 ms decay, 3 nS), and only E_GABA had been sourced.
Jaime, DeFazio & Moenter (2026) measured it: 9.9 ± 0.25 ms in adult females
and 7.4 ms at 3 weeks. Their isolated PSCs were about −30 pA at −70 mV, which
is about 1 nS, so the 3 nS default was three times a physiological PSC. The
owner's caveat is recorded with the numbers: the decay depends on chloride,
and intracellular chloride in GnRH neurons was never measured, only E_GABA.
"It is the best we have." The GnRH defaults are now 10 ms decay, 1 nS and an
instantaneous rise, held in the model definition with their source (shown
under the GABA panel) and pinned by a test. Worth saying in the lecture: the
conductance lasts about 10 ms, but the PSP lasts 25–40 ms, because the
membrane integrates it.

## 2026-09-23 — the leak is the control, and Rin is measured

Asked, ahead of a channel editor: "make Rin a measured property. make the
slider a linear leak model (gleak)", and "do not adjust the slider when ion
channel properties are changed". Until now the Cell panel set Rin, and
`buildCell` bisected for the leak that gave it back. That was the right knob
for matching a recording, but the wrong one for a channel editor: block a
channel open at rest and the leak would quietly re-solve to hide the change
in Rin that the lesson is about.

Now the control is gL, a whole-cell linear leak in nS. It opens on each
model's published leak (28.95 nS, the template's g_pas over its area, for the
pyramidal cell; 1 nS, Adams 2018 Table 1, for GnRH), and nothing but that
control moves it. Not Cm: channel counts still scale with Cm, but the leak does
not, so a larger cell is relatively less leaky. And not any channel. Rin at
rest is measured from the cell as built, leak plus the channels open at rest,
and shown under the slider. τm uses the measured Rin. If a cell has no stable
rest, the page says so and does not report a number. The old "this Rin is out of
reach" state is gone, because a leak cannot be out of reach.

The published cells are unchanged: 32.13 MΩ and 505.9 MΩ at rest, and 386.3 MΩ
at −6 pA. The leak used to be solved from a rounded Rin to about 0.1%; it is now
exact. That moved one quoted number by the bisection's own resolution: rheobase
with E_GABA −35 mV is 458 pA, not 457. It is updated everywhere it is quoted.
The methods page's Cm claim had been measured with Rin held. Re-measured with
the leak held at 28.95 nS, it reads 569, 561 and 584 pA at Cm = 145, 290 and
579 pF, against 129 pA with the leak cut to 5 nS (Rin 149 MΩ). The conclusion
still holds: the leak sets rheobase and Cm does not. The CLI's `--rin` is now
`--gleak`.

## 2026-09-28 — a GHK calculator, and what "activity" hid in 2000

Asked to evaluate an interactive tool for the GHK voltage equation with
divalents. The zero-current condition for any mix of valences ±1 and ±2 is a
quadratic in exp(−FV/RT) with exactly one positive root, so the answer is
exact, with no search and no root to choose. That was checked against brute
force. The shortcut of adding "4·P_Ca·[Ca]" to the monovalent formula was off
by 7 mV in a test case. The tool is not built yet. It is planned as a teaching
page separate from the simulator (`docs/roadmap.md`).

The owner then raised an old observation: outside-out calibrations of pipette
chloride never matched unless the extracellular chloride was scaled down, and
"at the time we mistakenly thought we were correcting for activity. but that's
wrong I think". The paper is DeFazio, Keros, Quick & Hablitz (2000). The owner
supplied the PDF. Its patch data are refitted in
`tools/experiments/chloride_calibration.ts`, with the reading in
`lit/notes/defazio2000.md`.

The owner is right. The paper's 0.76 is applied to one side only, which makes
it a constant 7.2 mV shift, not an activity correction. The patch gaps are 16.6
and 8.1 mV, not constant. They fit a 7.5 mV offset plus a small permeant
pipette anion (P_glu/P_Cl ≈ 0.004). The offset is about half the junction
potential the solutions should have had (+16.3 mV at 1 mM, Henderson). The
paper says its junction potentials were measured and corrected, but prints no
value; the owner recalls they were measured by hand over about a week. The
experiment predicts the 40 mM patch point in Fig. 2A at about −24 mV, a check
not yet made. The paper's conclusions stand, because they compare patches with
whole cells and a shared offset cancels. The owner suggested this become the
teaching tool: "an activity correction tool could be very educational".

Later the same day, the owner read the 40 mM patch point off Fig. 2A: "actually
under the theory line". It reads −26.8 mV, not the −24.0 the two-point fit
predicted. With three points, a constant offset alone fails (χ² 28). A voltage
error plus a permeant pipette anion fits: 6.1 mV plus P_glu/P_Cl 0.005, or,
slightly better, 46% of each pipette's own junction potential plus 0.004. The
error shrinks as pipette Cl⁻ rises, so the paper's single activity factor
over-corrects at 40 mM and under-corrects at 1 mM. The experiment and notes
now use all three points, and the failed prediction is recorded in the notes.

The owner: the junction potentials were measured against a 3 M KCl bridge, "we
thought we were being careful". That rules out a dilute-bridge loss. The
experiment now has an error budget. Take out the 3 M bridge's residual in a
Neher measurement (about 2 mV), the puffer's lower Cl⁻ (1.5 mV) and, if the
junction potentials were measured at room temperature, 0.4 mV. What is left is
about 2.2 mV plus about 0.7 mM of permeant anion. The 2.2 mV is within the
uncertainty of the junction potential calculation itself (the published
gluconate mobilities alone move it by 2 mV). There is no gross error, only a
sum of small ones. The anion, which the paper had diagnosed, dominates at
1 mM.

## 2026-10-14 — what it is for, said up front

The owner asked that the README say what the site was built for: a teaching
tool for UM Physiol 578, whose goal was excitability and the roles of passive
properties, voltage-gated conductances and synaptic inputs. The README now
opens on that and groups the controls under those three headings, plus the
experiment itself (protocol, electrode, noise). The voltage-gated heading
says plainly that the channels are fixed at their published values until the
channel editor arrives. Two stale lines went with it: "not yet deployed", and
"the Rin solve", which ended when the leak became the control.

## 2026-10-14 — an oscilloscope

Asked whether the solver was fast enough for a real-time oscilloscope mode,
then to build it. It was measured first, not argued. At the shipped dt of 0.01
ms on an Apple M4 Pro, the pyramidal cell runs 68–98× faster than real time
and the GnRH cell 19–21×, with and without PSCs and noise. 1× therefore needs
no new optimization, even on a device several times slower.

The design keeps one integrator. `simulate.ts` now exports its `step()`, and
the new `src/core/stream.ts` calls it. A stream differs from a sweep only in
bookkeeping: it draws PSC events and membrane noise as it goes, from the same
seeds in the same order. So `stream.test.ts` can hold it to `runSweep` sample
for sample, on both cells, through ragged chunk sizes. Recording noise gained
an online form with the same kernel (the kernel was factored out unchanged,
and the step protocol's noise is bit-identical).

Settings are live and never reset the cell: a new leak or Cm rebuilds the
cell around the same state vector. That is the teaching point a stepped
protocol hides, because it settles before every run. Only a model switch,
whose state vector has a different shape, settles again. The stream runs in
its own worker (`src/scope-worker.ts`), paced by the wall clock. It never
catches up after a stall, and it reports the speed it achieved, so a slow
device says so rather than stuttering. The screen is a canvas that keeps
min/max per pixel column, so spikes keep their height at 2 s/div.

The starting pulse belongs to each model, as presets do. A pulse that drives
one cell is wrong for the other: 700 pA for the pyramidal cell (rheobase
561), and 24 pA on −6 pA for GnRH (the paper's 4-spike step).

Also recorded, from the owner, as a small fix for later: the "AP peak ·
half-width" tile reads "47 · 0.70 mV · ms", which looks like an area.

Added after a first hands-on test (Safari fine): the owner asked for a store
and overlay button, and noticed that Pause changed width when clicked. Store
keeps what is on screen as a faint reference behind the live trace (up to
three, labeled with their settings). An overlay is only useful if passes line
up, and a free-running sweep drifts against a 1.5 s pulse period. So with
pulses on, the screen now triggers on pulse onset, with hold-off, as a real
scope does. The stream reports onsets for this, and a test pins their
timing. Pause has a fixed width.

## 2026-10-15 — two readouts, not one product

The "AP peak · half-width" tile read "47 · 0.70 mV · ms". A middle dot between
units is how a product is written, so it looked like an area in mV·ms (the
owner's catch, 2026-10-14). It is now two tiles, "AP peak 47 mV" and "AP
half-width 0.70 ms", each with its unit and a line saying what it measures.
The item has left the roadmap's small fixes, which are empty again.

## 2026-10-15 — a third cell, fast and non-adapting

Asked to evaluate a very-high-frequency neuron, "like cerebellar granule
cells (1 kHz I think)". PubMed corrected the premise. The >700 Hz bursts belong
to mossy fibre boutons, the terminals driving granule cells (Rancz et al.
2007). Granule cells themselves fire sparsely, burst on a few EPSCs, sit
under tonic GABA_A inhibition (Chadderton et al. 2004), and burst at theta
in slices (D'Angelo et al. 2001). Their standard model is multi-compartment
(Diwakar et al. 2009). A real kHz cell would need Kv3-type channels, which
neither source has, plus a finer sample interval and possibly a per-model
spike re-arm level. That is a project of its own.

What was cheap and well checked was already in our source: ModelDB 123623's
fast-spiking interneuron, `sIN_template`. It is the pyramidal cell's two
channels, with twice the K⁺ and no M current. It is now a third model. The
NEURON environment had gone, so it was rebuilt in a scratch venv by the
oracle tool's own instructions (NEURON 9.0.2, ModelDB commit `8dfc13f`).
Before it was trusted, it regenerated the pyramidal reference
byte-identically. `tools/neuron_oracle.py` gained a cell argument (`rs`
unchanged and still the default; `fs` writes `neuron_fs.json`), and
`oracle.test.ts` runs both. FS spike counts match NEURON on every sweep, 526
spikes up to about 300 Hz, with every spike time within 0.015 ms.

The teaching point it adds is about voltage-gated conductances. The same
channels give an adapting cell or a fast, non-adapting one, depending on one
density and on whether a slow current exists. At 800 pA the FS cell fires at
101 Hz from start to finish, while the pyramidal cell falls from 43 to 10 Hz.
Its spike is narrower (0.56 against 0.70 ms half-width) at the same
threshold. Rheobase is 385 pA. `fs.test.ts` pins every number the presets
and docs quote. Its ceiling is about 400 Hz, with the spikes shrinking, so it
is fast, not kHz. Each model now carries a short name, for pin and
stored-trace labels, instead of the UI assuming there are two.

## 2026-10-16 — a siren for unphysiologic drive

Testing the fast-spiking cell, the owner noticed that "the pyramidal neuron
can go pretty hard with massive injections". It was measured, not argued.
Both Pospischil cells reach several hundred Hz on tens of nanoamps (the
pyramidal cell 400 Hz at 12.8 nA, with 21 mV spike peaks and its adaptation
gone). Both are in depolarization block by 25.6 nA. The fast-spiking label
describes realistic drive, not the top of the curve.

The owner asked for "a little red siren that starts blinking when the model
is driven to unphysiologic extremes". They chose the triggers from options
that each come from the cell itself, so nothing is a picked number:

- spike failure: no overshoot of 0 mV, or Vm above −30 mV for 50 ms;
- Vm outside the reversal potentials in play;
- injected current more than 10× the published cell's rheobase from its
  holding current.

That rheobase is now part of each model (561, 385 and 17 pA, pinned by
tests). The detector, `src/core/extremes.ts`, is one stateful watcher used by
the step protocol (per sweep) and the scope (continuous, a one-second window).
`extremes.test.ts` runs every preset of every cell and requires silence, and
checks that each criterion trips where it should. Testing it also turned up
an older artefact, a first-sample dip in the recorded trace when a step
starts at 0 ms, which went to the roadmap's small fixes rather than into this
change.

## 2026-10-17 — old school, and sound

The owner asked to consider an "old school mode: green phosphor oscilloscope,
knurled knobs for everything, dials for measured pars instead of digital
readouts", and sound, "hiss and pop, later we had tones". After the
proposal, they chose knobs everywhere and a tone that follows Vm.

The audio monitor came first because it teaches as well as decorates.
`src/core/monitor.ts` holds the arithmetic, tested: pitch from Vm, binning
that never averages a spike away, and hiss level from the recording noise.
`src/ui/audio.ts` plays it with built-in Web Audio nodes only. That keeps it
clear of the security policy, because an AudioWorklet would need a script
loaded at run time. Pops are built from spike times rather than the raw
trace, because the worker delivers samples in uneven bursts and a raw trace
would crackle. Sound plays at 1× only.

Old school is a switch, for the oscilloscope only, so the step protocol
keeps the light look the site was designed around for slides. It brings:

- a phosphor renderer with persistence, faded in steps big enough that 8-bit
  rounding leaves no ghost, and held while paused;
- a Knob that takes over from every ranged NumField through a React context,
  with drag, wheel, keyboard and typed entry, slider semantics, and plain
  fields at phone width;
- meters with damped-spring needles.

The screenshot check drives all of it: knob count, a keyboard turn, a typed
value, both sound modes, collapsed panels staying collapsed (a bug it caught
— author `display: flex` beat the `hidden` attribute), and phone width.

## 2026-10-17 to 2026-10-18 — threshold, the literature, and two handoffs

Three goals were set for these days: an explainer; a tool for understanding threshold (A-type K⁺ channels against Na⁺
channel properties, across models); and multiple definitions of excitability and hyperexcitability. Then a fourth:
studying ion channel mutations and epilepsy, with a search of Lori Isom's research. All four were advised on, and none
was built.

- **Threshold belongs to Na⁺.** Scratch experiments blocked K⁺ in all three models from a matched starting potential, at
  the owner's insistence that it is the only fair comparison. Voltage threshold moved by 0.4 mV at most, while rheobase,
  latency and spike width changed. The published match, which the owner remembered and then found, is Kress et al.
  (2010) Hippocampus 20:558. The details are in `docs/handoffs/2026-10-18-channel-editor.md`.
- **Literature handling** moved onto the estate's own tool, murderboard's `fetch_paper.py`, after the owner pointed out
  that hand searches had bypassed it. Unreachable papers go on his want-list. The Adams 2018 full text showed an
  apparent contradiction with DeFazio & Moenter 2002 on estradiol, I_A, threshold and latency.
- **Isom's program** turned out to center on β subunits and cell-type-specific changes in current density, persistent
  current and resurgent current, more than on the shifted voltage dependence the owner had pictured. The tool is framed
  as "how changing Na⁺ channel properties changes excitability". The owner judged a two-neuron circuit too big a step,
  so the editor stays single-cell.
- **Outside feedback** asked for a simple explainer that anyone can use. It must be built from the owner's own text,
  which he is writing.

Both pieces of work went to handoffs, to run in parallel: `docs/handoffs/`.

## 2026-10-18 — Na⁺ voltage shifts, as a kept experiment

The channel-editor handoff offered a throwaway script that shifts the Traub Na⁺ channel's voltage dependence. The
owner asked why it should be thrown away: this question is central to the project. So it went into
`tools/experiments/na_shift.ts` and is covered by `src/experiments.test.ts`, like the slow I_K experiment. Nothing in
the shipped model changed. The shifted channel is built from two stock `makeNa` instances, one for each gate. Rush–Larsen
gates are independent, so the split is exact.

What it found (800 ms steps, started from the control cell's rest; table: `node tools/experiments/na_shift.ts`):

- **Activation sets threshold, about 1 mV per mV, in both cells.** A −6 mV activation shift took threshold from −39.4 to
  −45.3 mV and rheobase from 561 to 366 pA in the pyramidal cell; in the fast-spiking cell, from −39.2 to −45.3 mV and 385
  to 252 pA. A +6 mV shift raised rheobase 54% in the pyramidal cell and 84% in the fast-spiking cell.
- **Inactivation shifts of ±6 mV do almost nothing** (rheobase within 3 pA, threshold within 0.5 mV). The Traub h∞ is
  still 0.95 at −45 mV and 0.60 at −35 mV, so its midpoint is near −34 mV, far depolarized from a typical neuronal Na⁺
  channel. Inactivation starts to matter only at shifts of −12 mV or more. A depolarized-inactivation variant therefore
  cannot be shown with this channel's inactivation shift; it needs the persistent-fraction control. That is a limit of the
  stock channel, and the editor must say so.
- **No shift moved rest or Rin.** The Na⁺ channel is closed at −70 mV (m∞³ ≈ 10⁻¹⁰), so the free and held views agree
  for these edits. They will not agree for a persistent fraction or for K⁺ edits.
- **Threshold behaves the same in both cell types; firing does not.** At twice control rheobase, a +6 mV activation shift
  dropped the pyramidal cell from 41 to 6 Hz and the fast-spiking cell from 96 to 65 Hz.
- **Plotted, because a table was not enough to trust.** The owner asked for figures; they changed two readings:
  - **The "threshold near −20 mV" readings are not spikes.** With inactivation shifted −20 mV (both cells) or −15 mV
    (the fast-spiking cell), the event at "rheobase" is a hump that peaks at about −20 mV, the detector's spike level,
    and its dV/dt barely reaches 20 V/s. So the rheobase there is the current that pushes a hump over −20 mV. The
    detector needs an amplitude or overshoot criterion before the scorecard can use it. The pyramidal cell's event at
    −15 mV is a small AP (peak about −5 mV).
  - **A +6 mV activation shift sends the pyramidal cell into depolarization block** at twice control rheobase: five
    spikes, then Vm sits at −43 mV for the rest of the step. Its "6 Hz" is five spikes over the step, and the experiment's
    `repolarizes` flag says yes because only the first spike is checked. The siren would miss it too: its block criterion
    is Vm above −30 mV for 50 ms (`src/core/extremes.ts`). The fast-spiking cell, with the same shift and drive, keeps
    firing at 65 Hz.
  - **With inactivation shifted −15 mV, spikes are smaller and the rate is higher** in both cells at twice control
    rheobase (pyramidal 41 to 58 Hz; fast-spiking 96 to 99 Hz), although rheobase rose. Smaller spikes plausibly recruit
    less K⁺ current; not yet checked.

## 2026-10-18 — threshold depends on its definition; the Na⁺/K⁺ split does not

The owner asked for the Na⁺ figures again, now with K⁺ edits and the GnRH cell, to see the threshold criterion (1, 2,
10, 20 V/s) against cell type against Na⁺ changes against K⁺ changes. He recalled 1 V/s for GnRH and 2 V/s for other
neurons. The repo uses 20 V/s everywhere, and neither value is recorded in the repo or in any paper on file. Kress et
al. 2010 used 10 V/s. `tools/experiments/threshold_criteria.ts`, tested in `src/experiments.test.ts`. Figures are in
the darkroom (`gaba_excites/2026-10-18_threshold-criteria/`).

- **The criterion moves threshold more than most edits do.** From 1 to 20 V/s, control threshold rises 7.2 mV
  (pyramidal), 7.0 mV (fast-spiking) and 13.5 mV (GnRH), whose takeoff is slower. That is more than a 6 mV Na⁺ shift
  does. A threshold number means little without its criterion.
- **The conclusion is robust to the criterion.** Na⁺ edits move threshold at every criterion. K⁺ edits (Kd halved or
  blocked, M blocked, I_A, I_K or I_KCa blocked) move it by under 0.5 mV at every criterion, in every cell. This is
  the "threshold belongs to Na⁺" result of 2026-10-17, now with four definitions.
- **The size of a Na⁺ effect depends on the criterion, and in opposite ways by cell.** With Na⁺ shifted +6 mV, the
  fast-spiking cell's threshold rises 8.9 mV at 1 V/s but 6.9 mV at 20 V/s. GnRH rises 4.3 mV at 1 V/s and 6.0 mV at
  20 V/s. gNa × 0.5 raises GnRH threshold 2.6 mV at 1 V/s and 4.0 mV at 20 V/s. The low criteria sit on the slow
  approach, which the cell's other currents shape; the high criteria sit on the Na⁺-driven upstroke.
- **K⁺ edits show up elsewhere.** GnRH with I_A blocked: latency at 23.7 pA falls from 219 to 50 ms, and rheobase
  *rises* from 15.8 to 18.4 pA (held at −70.1 mV, which takes −16.9 pA; it rests at −62.7 mV unheld). Two measures of
  excitability disagree. This supersedes the handoff's 23.1 pA, which came from a 3 s settle. M block lowers pyramidal
  rheobase 7% and lengthens rheobase latency (102 to 448 ms).
- **No criterion's walk-back reached the step onset** in any run. With a short latency, though (fast-spiking, Na⁺
  +6 mV, 22 ms), the 1 V/s point sits on the tail of the charging ramp. Low criteria need a check against that.

## 2026-10-18 — when K⁺ does move threshold: GnRH I_A, at short latency

The owner asked how to deal with the result that K⁺ edits do not move threshold, since he remembered a strong story in
at least one cell type. It is his own: DeFazio & Moenter 2002 (Mol Endocrinol 16:2255) report that estradiol lowers
GnRH threshold and latency through I_A. The PDF is still not in hand (not in `lit/` nor his library). Kress et al. 2010
also allow it: "subthreshold potassium currents, especially those on the axon, might participate in setting voltage
threshold (Bekkers and Delaney, 2001; Shah et al., 2008)". Neither of those papers is on file.

The earlier runs measured threshold at rheobase only, and in GnRH the rheobase spike comes about 790 ms into the step,
after I_A has inactivated. `driveSweep` in `tools/experiments/threshold_criteria.ts` steps each cell at 1× to 5× its
own rheobase, from −70 and −80 mV (figures: darkroom `gaba_excites/2026-10-18_k-threshold-drive/`):

- **GnRH, I_A blocked:** at rheobase, threshold is unchanged (under 0.5 mV). As drive rises and latency shortens, the
  control cell's threshold at 20 V/s rises (−32.4 to −30.4 mV from −70 mV; −32.6 to −29.7 mV from −80 mV), while the
  I_A-blocked cell's stays flat or falls. At 5× rheobase the difference is −3.5 mV from −70 mV and −5.5 mV from −80 mV,
  where more I_A is available. Same current (3× control rheobase, from −80 mV): −29.9 against −34.1 mV, and latency
  110 against 8 ms.
- **Pyramidal and fast-spiking, Kd or M blocked:** no change in threshold at any drive or holding potential. The Traub
  Kd activates too far above threshold, and M too slowly, to act before the upstroke. The models have no low-threshold,
  fast-activating K⁺ current (D-type, Kv1), the kind the Bekkers & Delaney citation concerns. That is a limit of the
  stock channels, not evidence that cortical K⁺ channels never set threshold.
- **So K⁺ can move threshold, when the current is active at the moment of takeoff.** Whether a K⁺ effect appears depends
  on the protocol (drive, holding potential, step length), not only on the channel. Rheobase protocols hide an
  inactivating K⁺ current's effect on threshold, and show its effect on latency instead.
- **The 1 and 2 V/s criteria fail at short latency:** the charging ramp after step onset exceeds them, and the walk-back
  runs to the onset. So does 10 V/s at the shortest cortical latencies. The figures leave those points out.

## 2026-10-18 — the explainer's shape, and armory's delivery hook

- **The entry point is a blinking "Start here" button**, not a page first. It opens a pop-up of about 100 words for
  someone with no background (the owner's example: a non-scientist CTO), with links out. The owner's draft text becomes
  a "Read more" page behind it. Nothing is built yet: the owner asked for a plan first.
- **Link out before building.** A web search found good material on action potentials (PhET, Bezanilla's *The Nerve
  Impulse*, Bean 2007, Neuroscience Online) and almost none, for a newcomer, on excitability as such or on GABA
  exciting. Those gaps are where the site's own pages earn their place.
- **A glossary page, separate from both.** Short definitions on hover; a click (or, on a phone, a link inside the
  tapped tooltip) opens `/glossary#term` for the longer definition and outside links. One source file feeds the
  hovers and the page, rendered and checked the way `lit/sources.json` and `/lit` are.
- **Plain words over jargon in the owner's text:** "negative" and "less negative" rather than "hyperpolarized" and
  "depolarized", with one line saying the app uses those words. The owner's view: students do not get the terms.
- **An EEG sentence was corrected and then softened.** Buzsáki, Anastassiou & Koch 2012 name synaptic current the
  major contributor to EEG, but not the only one. The draft now says only that many neurons active together produce
  the signal. The full review is on the owner's want-list for a closer check.
- **Armory's `send-goes-nowhere.py` hook and `tools/show.py` are vendored here**, pinned to armory 1646eb7. Files sent
  through the chat never reach the owner in the VS Code extension and report success anyway; the hook answers every
  send with the path-based remedy. The owner's point: a rule kept in memory or a doc has to be remembered, and a hook
  fires by itself. Known gap: run from a worktree, `show.py` names the darkroom folder after the worktree, not the
  repository, so pass `--project gaba_excites` there until armory fixes it.

## 2026-10-18 — report generation, version 1: the lab notebook

The owner saw the experiment tooling as a way for students to document their own experiments, and asked for report
generation in the app. Version 1 lives in `src/core/report.ts` (records, saving, the report), `src/core/svgplot.ts` (the
report's figures) and `src/core/threshold.ts` (threshold at a chosen criterion), all pure TypeScript and tested in
`report.test.ts`. The UI is `src/ui/Notebook.tsx`, one card after the sweep table. App.tsx gained only a settings
snapshot on each result and the mount line.

- **A run records everything needed to repeat it.** That is the full settings, including the seed. The model is
  deterministic for a given seed, so a later "verify" can re-run a report and check its numbers. That is not built yet.
- **Threshold is tabulated at 1, 2, 10 and 20 V/s.** The owner's sources: he defined 1 V/s for GnRH neurons in
  DeFazio & Moenter 2002 (the K⁺ current paper), and 2 V/s came with Luhong Wang's kisspeptin recordings. The citation
  turned out to be Wang, DeFazio & Moenter 2016 (eNeuro), whose Methods define threshold at 2 V/s. Its cells are AVPV
  kisspeptin neurons, not arcuate KNDy as remembered, so the report labels it that way. Kress et al. 2010 used 10 V/s. The app's own readout stays at 20 V/s, so no pinned number moves.
  A criterion that the charging after step onset already exceeds is marked "ramp", not reported.
- **The report is one HTML file, with no script, no fetch and no external resource.** Its figures are inline SVG and
  its styles inline. A test enforces that the only `<script>` is an inert JSON block, which holds the runs so the
  report loads back into the app. It prints to PDF from any browser. Students hand it in themselves; nothing leaves
  the browser.
- **A notebook holds at most 8 runs:** one categorical color each, never cycled (the dataviz rule). Runs are kept in
  `localStorage` as a convenience, guarded, with a warning if the browser refuses. The durable copy is the downloaded
  notebook or report.
- **The screenshot check drives it:** it records two runs, checks the "changed from run 1" line, downloads the report,
  confirms the report makes no requests, and loads it back.
- **Not in version 1:** deep links to reopen a run (they wait on the explainer session's URL state), channel edits
  (they wait on the channel editor), the verify button, and scope-mode recording.

## 2026-10-19 — the GnRH cell's resting potential for the GABA opening

The owner wants the explainer to open with his 2002 puzzle (DeFazio et al., Mol Endocrinol 16:2872): GABA, "the
inhibitory transmitter", excites GnRH neurons. The opening runs in scope mode on the GnRH cell with GABA PSPs, where
some PSPs fire a spike. The question was where the cell should sit.

- **The model's −70 mV is Adams et al.'s choice.** −6 pA holds it there, and they started their current steps from
  −69 ± 2 mV, "near the value determined" by their on-cell measurements. With no current the model rests at −67.5 mV.
- **The papers disagree by method.** On-cell estimates are near −70 to −75 mV; gramicidin perforated patch gives
  −51 to −59 mV; Moenter's 2010 review puts the interspike potential between −65 and −50 mV. The quotes and their
  checks are in `lit/notes/gnrh-rest.md`.
- **At −70 mV the measured GABA event (1 nS, 10 ms decay, E_GABA −36.5 mV) never fires the cell,** even at 50
  events/s. At about −60 mV (+8 pA) it fires on a fraction of events, and sliding E_GABA to −60 mV removes the PSPs.
- **The owner chose about −60 mV** ("much more fun and possibly more realistic"), set by a holding current shown as
  such. −60 mV is the edge of firing in this model (+8.5 pA fires on its own), so the opening's settings need care, and
  their numbers must be pinned by a test before any text quotes them. Not yet built.

## 2026-10-19 — the guided tour, first draft

The owner asked for a guided tour of the GnRH cell, drafted by Claude for his approval, and a local build to test.

- **"Parts", not "steps".** A step already means a current step in this app; the owner pointed out the clash.
- **A panel inside the app,** first in the sidebar. Each part's "Try this" sets the controls; the text says what the
  button will change before it is pressed, and a polite live region says what it did. Native buttons and a select,
  so the tour works from the keyboard.
- **One function, `tourInputs`, turns a part into inputs.** The app applies it and `tour.test.ts` measures it, so
  the text and the screen cannot drift. Every number the text quotes is pinned there.
- **The opening holds the cell at −61.4 mV (+7.5 pA), not −60.3 mV (+8 pA).** At +8 pA the cell fires on its own
  within 20 s, which would mix its own spikes with GABA's. At +7.5 pA it stays silent for a minute.
- **The text is a draft,** flagged in the file (`TOUR_IS_DRAFT`) and on screen. Not for deploy until the owner
  approves it.

## 2026-10-19 — layout for the tour, sweep playback, version stamp, classroom version

The owner tested the tour on a 16" laptop: the scope and the controls did not fit on one screen.

- **Each tour part shows its own controls in its card** (Ihold, gL, Cm, E_GABA), bound to the same state as the
  panels. After "Try this" the explanation folds behind "Show text", leaving the controls and "Look for".
- **In scope mode the plot column is pinned** (sticky) on wide screens, so it stays in view while the controls
  scroll. Not in step mode, whose long results column would scroll inside a scroll.
- **The header is one line.**
- **"Play sweeps"** draws a step family one sweep at a time, in amplitude order, 0.5 s apart (the owner's choice),
  on axes fixed to the whole family's range so nothing rescales as it grows. The tiles stay blank until the end.
  "Find threshold" plays automatically; it re-runs an unchanged protocol (`runNonce`) so the playback always
  happens. No sound yet: the owner was asked and has not said.
- **The stamp shows the last commit's time** ("updated"), the owner's choice over deploy time; Born moves to the
  tooltip. **Each deploy raises the patch version**: `deploy.sh` commits "Release vX.Y.Z" before building, so the
  bundle and DEPLOYED.md agree. A dry run bumps nothing.
- **The classroom version is served at `/fall-2026/`**, linked from the header. `scripts/classroom.sh` builds the
  `classroom-fall-2026` tag (the site as deployed 2026-09-23, live when the 578 homework was due on 2026-09-28)
  with base `/fall-2026/`, and injects only a banner into its HTML; its code is never edited. Its Methods and
  Sources links open the current pages, and the banner says so. `deploy.sh` gates on its CSP and banner and checks
  that it is live.

## 2026-10-19 — the app opens on the GABA puzzle

The owner asked for the app to open on the GnRH cell in the oscilloscope, near −60 mV, with GABA PSCs on: the
tour's first part. The initial state is `tourInputs(TOUR[0].settings)`, so the opening and the tour's "Try this"
cannot differ. Its holding current stays +7.5 pA (−61.4 mV once settled): +8 pA would fire on its own. The tour's
citations are now links (`[label](https://…)` in `tour.ts`), the 2002 paper's to its DOI, which a test checks.
`scripts/screenshot.mjs` captures the opening, then switches to the pyramidal cell in step mode, where it used to
start. Two sentences in `public/methods.html` that called the pyramidal cell "the default" now name it.

## 2026-10-19 — the scope and its controls on one screen

Asked by the owner after testing on a 16" laptop; checked at 1555×972, the size of his screenshot.

- **Readout tiles show name, value and unit only.** The owner asked for value and unit; the short name stays,
  small, because without it "18 pA" and "−32.4 mV" cannot be told apart and a screen reader has nothing to say.
  The note is on hover and on keyboard focus (the tile is focusable, aria-describedby). Rheobase's "refine" and
  its refined value stay visible: a control and a requested result, not an explanation. One shared `Tile`.
- **Old school knobs 62 → 44 px, meters at most 210 px wide.**
- **The scope fits the window:** the voltage screen is up to 300 px and shrinks (to a 180 px floor) when the window
  is short; the current trace is halved to 48 px, with two divisions. The paragraph under the scope is behind
  "How the scope works".
- **"Try this" folds the panels a tour part does not use** (Model, Electrode, Stimulus, Noise, and any synapse
  that is off), and the app opens with only Tour, Cell and GABA open. Any panel still opens by hand.
- A hidden tooltip still takes layout space: the tile notes are `display: none` until shown, after the screenshot
  check caught the page scrolling sideways at 390 px.

## 2026-10-19 — the fictional amplifier front

The owner asked for the space above the scope to go to a row of tools below it, as "a fake amp front with dials and
numeric entry boxes. fake because no amp i know of has gaba and glutamate pscs built in".

- **The scope readouts are one line in the mode bar** (a portal from ScopeMode into a slot App renders), with their
  notes in one hover. The scope card holds only the screen and its legend.
- **Below the screen, "GABA·EXCITES Model 578"**, labeled on its face as fictional. Sections: CELL (Ihold, gL,
  Cm), GABA PSC (switch with lamp; rate, peak g, E_GABA), GLUTAMATE PSC (switch; rate, peak g), SCOPE (time base,
  speed, Pause, Store, true Vm), MONITOR (sound, volume), and in Old school the two analog meters. Each dial is the
  existing Knob, whose amber box takes a typed value; all bound to the same state as the side panels.
- **Dial ranges suit the cell:** the GnRH cell's PSC rate dial runs 0–50 Hz and peak g 0–10 nS, the cortical cells'
  0–2000 Hz and 0–50 nS. The side panels keep their full ranges.
- **On a phone the dials fall back to number fields** (`AmpDial`), as Old school's knobs already did; the
  screenshot check enforces it.
- This is not the realistic amplifier mode on the roadmap (an Axoclamp, Axopatch or EPC-7 face); that stays parked.

## 2026-10-19 — every control on the amplifier front

The owner asked for the remaining side-panel controls (all but the tour) on the amplifier, a separator between its
rows, and the controls in each row aligned along the bottom.

- **Three rows, divided by an engraved groove:** MODEL (cell select, reset), CELL, ELECTRODE (Rs, bridge, pipette C),
  PULSES (switch; amplitude, width, period); then GABA PSC and GLUTAMATE PSC (switch; rate, peak g, τ rise,
  τ decay, E_GABA for GABA; Poisson or regular timing) and RANDOM DRAW; then RECORDING NOISE, MEMBRANE NOISE and
  MONITOR, with Old school's meters at the right. Each row's sections stretch to the row's height and push their
  controls to the bottom, so the dials and buttons share one bottom line.
- **The scope's own controls** (time base, speed, Pause, Store, true Vm) are a slim bar under the screen rather than
  an amplifier row: they belong to the scope, and a fourth row did not fit a laptop screen.
- **The scope sizes itself from the top of the page and leaves room for the amplifier,** so the whole instrument
  fits the first screen at 1555×972, plain and Old school. At 1491×810 it fits once the header scrolls away (the
  plot column is pinned). Dials on the amplifier are 36 px.
- The side panels are unchanged and still hold the same controls; whether to hide them in scope mode is the
  owner's call.

## 2026-10-19 — correction: real amplifiers can generate synaptic input

The amplifier's face said "no real amplifier has synapses built in", and the entries above repeat it. The owner found
Sutter's dPatch, which appears to have dynamic clamp built in, so the claim is withdrawn. The face now says only
"current-clamp amplifier · fictional": the brand and model are made up. Nothing here was checked against Sutter's
documentation; the site makes no claim either way about which amplifiers can do this.

## 2026-10-19 — reset includes the PSCs; tour-only left column; an even amplifier

- **Reset restores the PSCs too** (the owner): the published cell, its default holding current, and both PSC
  generators at the cell's defaults, off, with its own kinetics and E_GABA. One `resetCell`, used by the Cell
  panel's link and the amplifier's Reset button.
- **In scope mode the left column holds only the tour** (the owner), since every control is on the amplifier.
  Step mode keeps its panels. The screenshot check drives the amplifier in scope mode and fails if the left column
  shows more than the tour.
- **The amplifier, made even** (the owner found it uneven): every control is one cell of the same height, name on
  top and bottom on the row's bottom line; buttons, the cell picker and the timing switches sit in `AmpSlot`s so
  they align with the dials; each section takes a share of its row, so rows run edge to edge; section names are
  centered. Below 900 px the controls may wrap, which keeps the page from scrolling sideways on a phone.

## 2026-10-19 — false spikes on the scope at fast edges

The owner saw a sharp tick, down and up, at the onset of every GABA PSP at 200 ms/div. The simulation has none:
Vm and the recorded trace rise smoothly from the event (checked sample by sample, in the step protocol and in the
live stream, with recording noise off and on). It was the drawing. The scope strokes each pixel column as a zigzag
from its max to its min, and the canvas's default miter join extends the sharp corners at a fast edge into spikes up
to 10 line widths long. The time base mattered because it sets how much of the rise falls in one column. Fixed with
round joins on the live trace and the phosphor beam, which also thins the noise band the miters had been fattening.

## 2026-10-19 — horizontal meters; an adjustable readout window

- **Old school's meters are horizontal (edgewise) panel meters in the mode bar,** where the readout line is in the
  plain look; the round meters at the bottom of the amplifier were off screen. The owner recalled the EPC-7 as
  having horizontal meters (not checked here). `HMeter` has the round meter's needle ballistics.
- **The firing rate and mean Vm average over one window the user picks:** 0.1, 0.2, 0.5, 1 or 2 s ("Readouts over",
  under the screen), default 1 s. It was 2 s for the rate and 1 s for Vm. The readouts now publish every 0.1 s, so
  a short window shows what it catches. A rate is reported once half a window has run.

## 2026-10-19 — one instrument in both modes

The owner found the switch from the scope to the step protocol jarring, and chose the first two of five proposed
changes: the amplifier in both modes with only the tour on the left, and the step readouts on one line.

- **The side panels are gone in both modes;** every control is on the amplifier. Rows: MODEL, CELL (with
  Rin and τm at rest as amber readouts; rest and Rin at Ihold on hover), ELECTRODE, MEMBRANE NOISE; then the two
  PSC generators and the random draw; then the stimulus and RECORDING NOISE, with MONITOR added on the scope.
- **The stimulus is the one section that changes with the mode,** in the same place: PULSES on the scope, STEPS in
  step mode (preset, family or list, first, increment, sweeps, step at, duration, sweep length). Steps did not fit
  the top row, so the stimulus moved to the bottom row in both modes.
- **Step readouts are one line in the mode bar,** as the scope's are, each name with its note on hover; Rheobase
  keeps "refine" and the refined value. The readout tiles and the shared `Tile` are gone.
- **The step plots share one time axis:** only the bottom plot labels time, which gives the voltage plot its room
  back while the current and conductance plots shrink.
- **Known gap:** at 1555×972 in step mode the amplifier's bottom row (Steps) is about 90 px below the fold. The
  remaining proposals (the scope's screen style for the sweeps, and nothing moving between modes) are where to fix
  it.
- The tour no longer folds panels (there are none). The check script drives both modes through the amplifier and
  fails if the left column shows more than the tour.

## 2026-10-19 — the mode switch on the amplifier

- **Step protocol / Oscilloscope, and Old school in scope mode, sit in the amplifier's name strip** (the owner),
  between "GABA·EXCITES Model 578" and "fictional", where there was free space: no new row. The readouts get the
  mode bar to themselves and fit one line.
- **"N sweeps simulated in T ms" rides on the plot's title line;** only a failure message stays in the mode bar.
- Step mode at 1555×972 now ends 30 px below the fold, from 90.

## 2026-10-19 — the amplifier stays put on a mode switch

The owner asked that the amplifier not move when the mode switches. Both modes now give their screen card one
height, set from the window alone (what is left after the readout line and a fixed 400 px allowance for the
amplifier, between 380 and 560 px); the scope's canvas and the step plots each fit inside it, and the readout line
has a fixed height tall enough for Old school's meters. A first version subtracted the amplifier's measured height,
and the screenshot check caught it moving 71 px at 1440 px wide, where the Steps row wraps and the amplifier grows.
The check now fails if the amplifier's top moves more than 2 px on a mode switch.

## 2026-10-19 — the explainer: Tony's draft at /explainer, reached from the tour

The owner took the suggestion that joins the two efforts. The explainer session's plan (branch `explainer`: a
"Start here" pop-up, Tony's page, a glossary, then "try it" links) is partly overtaken by the guided tour, which
does the starting and the trying. What the tour lacked is the foundation in Tony's draft: what an action potential
is, ions, gradients and channels.

- **`public/explainer.html` is Tony's first draft (`docs/first draft explainer.docx`, 2026-10-18) as written:** his
  three paragraphs and two footnotes, extracted from the .docx, not retyped or edited. The .docx stays uncommitted
  (public repository).
- **Claude's suggested edits sit in a dashed box at the end, none applied:** a typo, chloride in GnRH neurons, the
  bracketed link placeholder, and the EEG sentence. The box also names the two lines on the page that are Claude's.
- **The tour's first part now opens with a link to it** ("New to action potentials? Read Tony's short introduction
  first."); `parseInline` accepts site-relative links, and a test checks the link.
- **The "Start here" pop-up is retired; the glossary waits.** The page is in `_headers`, the sitemap, `llms.txt`,
  and `deploy.sh`'s gates (file present, no third-party beacon).

## 2026-10-19 — the tour text approved

The owner edited the tour's text in the Claude Doc "Guided tour text for approval" and approved all eight parts. His
edits are carried into `src/core/tour.ts` word for word (one doubled space closed): the membrane potential named in the
opening, "resting potential" as a stable potential that some neurons have and others do not, "a few" pA because of
the high input resistance, each group defining excitability its own way, leak including channels rarely open at
rest, input resistance changing with membrane potential, and "undisturbed" for on-cell recording. No number changed,
so no test moved. `TOUR_IS_DRAFT` is off, which removes the on-screen draft note.

Noted for the owner, not changed: in the model, the gL dial is only the linear leak; voltage-gated channels open at
rest count in the measured Rin but are not part of gL.

## 2026-10-19 — deployed v0.2.1: the tour, the explainer, the amplifier, the classroom version

The owner approved the tour text and said to finish the deploy. `gnrh-rest` was merged into main (one conflict, the
header, where both sides carried the same new home link) and deployed as v0.2.1, worker version 065e7760. The
script stopped at its new `/fall-2026/` check: right after the upload the edge still held a 404 for that new path,
and unlike the bundle check it did not retry. Everything was checked by hand and live; DEPLOYED.md was written by
hand, saying so, and the check now polls like the bundle check. The explainer went live as Tony's first draft, its
suggested edits still in their box.

## 2026-10-19 — the explainer's outside links

The owner's responses to the suggested edits: the typo fixed; chloride and the EEG sentence kept (chloride is raised
in GnRH neurons but still far below its outside concentration; the EEG depends on action potential firing whether or
not that is what it records). The ion-homeostasis placeholder now links OpenStax, *Anatomy and Physiology 2e*, 12.4
(Na⁺/K⁺ concentrations, gradients, the pump; introductory). Bezanilla's *The Nerve Impulse*
(nerve.bsd.uchicago.edu) was weighed for it: the classic on how gradients make a potential, with a browser-run
Membrane simulator, but no pump. It gets its own note instead, in the owner's words: this site is not meant to
replace the classic. The owner plans to write the site's own ion-homeostasis explainer, which would replace the
OpenStax link.

## 2026-10-21 — the LTS cell: hyperpolarization excites

The owner approved building the rebound cell of `docs/handoffs/2026-10-20-lts-cell.md`: ModelDB 123623's
`sPYr_template` with `demo_PY_LTS.hoc`'s parameters (Destexhe, Contreras & Steriade 2001, via Pospischil 2008).

- **Two new seams, not solver edits.** Huguenard's T current is a `Channel` (`makeHuguenardT`). Its reversal is
  Nernst from the live calcium, so `ModelChannel` gained an optional `erevCa(ca)`, which the solver evaluates for
  any channel that has one. The calcium pool became an interface (`src/core/pools.ts`): Adams' saturable pump and
  Destexhe's shell are two implementations, and the solver no longer knows either equation. Steady calcium is
  now a fixed point, since the T current's reversal depends on the calcium it makes; for the GnRH pool that
  converges in one pass to the old value, and no GnRH number moved.
- **NEURON's order for the shell.** NEURON computes ica in nrn_cur before the voltage solve, and cad integrates
  that ica after it. A pool says which current it reads (`reads: "before" | "after"`). The Destexhe shell reads
  "before", to match the oracle; Adams' pool keeps "after", as it was, so the GnRH numbers stay put.
- **The oracle.** `tools/neuron_oracle.py lts` compiles the two extra .mod files and runs four families, each
  settled at its own holding current (NEURON 9 writes `arm64/libnrnmech.dylib`, not `arm64/.libs/`; the tool
  takes either). The pyramidal and fast-spiking references regenerated byte-identically first. All 12 LTS
  sweeps match in spike count, bursts and rebounds; every spike within 0.010 ms.
- **Presets inside the reversal span.** The handoff's −200 pA steps take this 446 MΩ cell to −133 mV from
  −64 mV and to −153 mV from rest, below E_K, and the siren rightly sounds. The rebound preset steps to at most
  −100 pA from a 60 pA hold (−98.5 mV); the "from its own rest" preset to −30 pA (−95 mV). Presets gained an
  optional `ihold`, which the app applies and the siren test now honors (it used the model's default before).
- **GABA does not do what the step does, at E_GABA −80 mV.** The handoff asked to check. The rebound needs Vm
  near −78 mV or below; a GABA train against the 60 pA hold bottoms out at −79 mV even at 40 nS per event at
  100 Hz, and never rebounds the cell. At −85 mV it takes 10 nS, at −90 mV 5 nS, at −95 mV (near E_K, a GABA_B
  reversal) 3 nS. Recorded as `tools/experiments/lts_gaba_rebound.ts`, pinned in `src/experiments.test.ts`,
  and said on the methods page. No GABA preset: the app's GABA runs for the whole sweep, so a train that stops
  can only be made by hand in the oscilloscope (tick GABA, then untick it).
- **Opens on its lesson.** Choosing the cell loads its first preset, the rebound, held at 60 pA.
- **Rebound spikes are counted apart from the F–I curve** (owner, 2026-10-21: "rebound spike counts are
  separate from the F-I curve (only spikes during the step are counted)"). `SweepStats` gained `nAfterStep`
  and `afterLatency`, shown as two columns of the per-sweep table, in its CSV and in the CLI. The F–I curve,
  rheobase and rates still count only spikes in the step.
- **Todos from the owner, on the roadmap:** chloride accumulation (Kevin Staley's and his work) under chloride
  dynamics; the GABA PSP that sets off an LTS under evoked responses, with the experiment code kept as its seed.
- **Citations.** Destexhe et al. 2001 and Huguenard & McCormick 1992 / Huguenard & Prince 1992 (the papers
  IT_huguenard.mod names) are credited as background: every number is the code's, and the equations were not
  checked against the papers.

## 2026-10-21 — no LTS in GnRH neurons, so the rebound stays on the LTS cell

The owner asked for a quick check for an LTS in GnRH neurons ("I remember looking hard and not seeing it"). From
PubMed abstracts: GnRH neurons have T channels (Zhang et al. 2009 J Neurosci 29:10552, mouse; Kato et al. 2010
J Physiol Sci 60:195, rat, τ of recovery from inactivation ~0.6 s), and Zhang et al. report estradiol "increased
the rebound excitation" without saying, in the abstract, whether that is spikes. The rebound that has been pinned
down is Ih's (Chu et al. 2010 J Neurosci 30:13373). Clear T-dependent rebound bursts in this circuit belong to
AVPV/RP3V kisspeptin neurons. The Adams 2018 model does not rebound either. The owner chose to go on with the
current plan: the rebound ("anodal break excitation") lesson lives on the LTS cell, not in the GnRH tour.

## 2026-10-21 — slow GABA trains and descending step families

Two controls the owner found too coarse on the LTS cell, both true of every cortical cell:

- **GABA (and glutamate) rate now steps by 1 Hz** on the pyramidal, fast-spiking and LTS cells, not 10 Hz, so a
  1 Hz train can be dialed in; the range is still 0–2000 Hz (Shift+arrow moves 10 Hz, Page keys 100 Hz).
- **The family's increment is a size and a sign** (the owner: "maybe need increment and sign?"). The Increment
  dial keeps its old ranges as a magnitude (5–200 pA; 0.5–10 pA on GnRH), and a "+ up / − down" switch beside it
  sets the direction, so 0, −5, −10 … pA is one setting. The protocol still stores one signed `delta`.
- **And a range switch** (the owner chose a range multiplier over geometric steps): the Increment dial runs 1–20 in
  0.5 steps, a ×0.1 / ×1 / ×10 switch scales it, and the sign switch sets the direction, so one dial covers
  0.1–200 pA on every cell (the per-model increment ranges are gone). The switch keeps the user's last choice
  while it still shows the increment exactly, and otherwise picks one that does (a preset's 0.5 pA reads 5 × 0.1,
  25 pA reads 2.5 × 10). `src/core/protocol.test.ts` requires every preset's increment to show exactly.

## 2026-10-21 — Igor-style marquee zoom on the step view

The owner asked for "an igor style select and zoom option for the steps view". Dragging on any trace plot now draws
a marquee in both axes and leaves it; a click inside opens Igor's menu (Expand, Horiz Expand, Vert Expand, Shrink,
Horiz Shrink, Vert Shrink) and Autoscale. Time is shared by the stacked plots, so horizontal operations move them
all; vertical ones move only the plot the marquee is on. Autoscale is also ⌘/Ctrl-A over the plots (Igor's key),
a double-click, or a button that appears while zoomed. The zoom lives in App, not in the plot, so it survives
re-runs and playing the sweeps, as Igor's axes do; switching cells or starting a tour part resets it. It replaces
uPlot's drag-to-zoom-in-time. The arithmetic is `src/ui/zoom.ts` with `src/ui/zoom.test.ts`; the screenshot
check drives a marquee, Expand and ⌘-A on the LTS cell. Not on touch screens yet (uPlot's drag is mouse only).
- **Zoom and measure cursors** (the owner: "the ability to switch between zoom and measure modes for the cursor.
  measure needs a readout of time, voltage, and current somewhere helpful without increasing vertical height").
  A Zoom | Measure switch sits in the trace card's title row. In Measure there is no marquee; hovering reads the
  sweep nearest the pointer (else the selected one): time, recorded V (true Vm too when it is shown) and the
  command current, and a click pins a reference (dashed crosshair) so the line adds Δt and ΔV; Esc clears it. The
  readout takes the title row's free space, in place of the "N sweeps simulated" note, and is written to the DOM
  directly so hovering never re-renders the app. The screenshot check fails if the card grows in Measure. Below
  about 1300 px wide the end of the line (the Δ) is cut off with an ellipsis.

## 2026-10-21 — the amplifier's filter

The owner asked for the filter from the rig-features list, with the Axopatch's settings. Built as recommended:

- **A 4-pole Bessel output filter** (`src/core/filter.ts`) at 1, 2, 5, 10 kHz or bypass, the settings the owner
  chose after an Axopatch 200B (not checked against its manual). Poles from scipy (`bessel(4, 1, analog=True,
  norm="mag")`), bilinear transform with the cutoff prewarped; −3 dB at fc and a step overshoot under 1.5% are tested.
- **It runs at every integration step (100 kHz)**, not on stored samples: the step protocol stores at 33 kHz and the
  scope at 20 kHz, where a 10 kHz filter would sit at Nyquist. An analog filter acts before the digitizer anyway.
  Both paths feed the same `Recorder` every step, and a test holds the scope's record to the step protocol's, sample
  for sample, with filter, noise and hum on.
- **The noise-only Bandwidth dial is folded into it.** Noise and hum are added to the pipette signal and filtered with
  it, as on a rig. The RMS dial now means the RMS through the 10 kHz filter (how amplifier noise is specified), so a
  lower setting shows less noise, about √(fc/10 kHz) as much, and bypass more. The section is now "RECORDING".
- **Defaults:** the app opens at 10 kHz (0.2 mV RMS, much as before); core runs (tests, CLI) default to bypass, so no
  pinned number moved.
- **What it does to a spike is smaller than first claimed.** The pre-build note said a 1 kHz filter costs "tens of
  mV". Measured on the pyramidal cell's first spike at 700 pA (peak 46.7 mV): 10 kHz within 0.1 mV and 0.03 ms late;
  2 kHz 1.4 mV low, 0.18 ms late; 1 kHz 7.5 mV low, 0.42 ms late. These spikes are ~0.7 ms wide. Pinned in
  `src/core/filter.test.ts`, quoted on the methods page. The phase plot draws true Vm, so the filter does not change it.
- **Sample 0 fixed** (a roadmap small fix): the first recorded sample is the settled cell under the holding current,
  so a step that starts at 0 ms no longer makes it jump by the whole bridge error.
- **Colquhoun & Sigworth 1995 removed from `lit/sources.json`:** its Gaussian filter (σ = 0.1325/fc) is no longer in
  the code.

## 2026-10-21 — the app starts in Old school, in both modes

The owner: "I'd like the app to start in retro mode. I still find the switch jarring. Can we adjust the non retro
mode to closer to retro without the heavy lifting to match the oscilloscope simulation." Old school was opt-in and
scope-only, so every switch to the step protocol flipped the page from dark to light. Now:

- **Old school dresses the page in both modes** and is on by default. Its checkbox sits beside the mode buttons in
  both. The phosphor tube and meters stay the oscilloscope's; nothing of the scope simulation moved to the steps.
- **The step view's charts take a dark palette** (`DARK_CHART`, `src/ui/palette.ts`), chosen with the dataviz
  skill: the reference palette's dark steps (blue #3987e5, orange #d95926, aqua #199e70), which pass every check as
  a set on the card's surface #2a2b27; the sweep ramp reversed to run dim → bright (a sequential ramp flips its
  anchor in dark), passing the ordinal check on every other step, as the light ramp does by design. The charts
  rebuild when the theme changes; the caption says "dim → bright" in Old school.
- **The saved choice moved to a new key** (`gaba_excites.oldschool.v2`), so a browser that had saved "off" before
  still opens in Old school once.
- **Also fixed:** the selected table row and the notebook's text fields, which Old school had never dressed; and two
  of today's tips (the RMS hint, the "After step" header), whose hidden bodies inherited no-wrap and widened the page
  to 1952 px. `.tip-body` now wraps whatever its context; the screenshot check fails on overflow in the step view.
- The screenshot check now asserts the Old school opening and that a mode switch keeps it, then unticks it to run the
  plain-look checks as before.

## 2026-10-21 — the stacked plots share one drawing area

The owner caught the measure cursor's dashed line off on the conductance plot (v0.2.5). The cause predates the
cursor: uPlot pads the right of a plot that draws time labels, so the last label is not clipped, and only the bottom
plot draws them. That plot was 25 px narrower than the ones above, so its time scale disagreed with theirs: the
traces, the synced cursor and the time axis itself misaligned (a 2 ms error at the right edge of a 800 ms sweep).
Every stacked plot now gets the same fixed right padding (24 px). The screenshot check fails if their drawing areas
differ; it reported 950 against 925 px with the fix taken out.

## 2026-10-28 — the cursor fix, recovered from the Mac

The session that made the fix above ("mac gaba lts") committed it on the Mac (3f6de01, branch `lts-cell`), asked
whether to deploy it as v0.2.6, and was archived before anyone answered; it never pushed. A cloud session found it
from the old transcript and confirmed it through a live Mac session, but that session's permissions refused the push
and it had no way to message back. The cloud session reapplied the same three edits from the transcript instead,
re-ran the checks (141 tests; the screenshot check clean with the fix, and failing at 950 against 925 px without it)
and pushed them on `claude/eager-newton-3e2353`. The Mac's `lts-cell` holds the same change under another hash and
can be dropped once this lands on main. Still not deployed; deploying needs the Mac's Cloudflare login.

## 2026-10-28 — the explainer links ionhomie

The owner asked for a link to ionhomie (ionhomie.tonydefazio.com, his ion-homeostasis teaching site) on the
explainer, placed beside the ion-gradient sentence rather than in the closing note. It joins the OpenStax pointer in
that sentence's parenthesis: "to watch how cells build and keep these differences: ionhomie". The page's own words
are otherwise unchanged.

## 2026-10-28 — the chloride calibration joins main

The DeFazio et al. 2000 chloride-calibration work (the 2026-09-28 entry above) was pushed on
`claude/sweet-wozniak-4s1xef` and never merged. It is merged now, ahead of the v0.2.6 deploy, so that one release
carries it with the cursor fix and the ionhomie link. The conflicts were both sides adding at the same place
(`lit/sources.json`, `lit/references.bib`, `src/experiments.test.ts`, this log); both were kept, and `public/lit.html`
was regenerated with `node scripts/lit.ts`. On the site it shows only as a new entry on /lit; the experiment stays
out of the app.

## 2026-10-29 — beta cells, mouse and human, on the roadmap

The owner suggested a pancreatic beta cell "as a side quest", then asked for "both mouse and human ephys". Recorded on
the roadmap, not started. Human is Riz, Braun & Pedersen 2014 (on Pedersen 2010); it fits this site because GABA
excites human beta cells (Braun et al. 2010). The mouse model is not chosen; the owner pointed to Ashcroft & Rorsman
1989 in the beta_max literature folder as its reference. The citations were checked on PubMed, not recalled; none is
in `lit/sources.json` yet, because no number has been taken.

beta_max, a separate project ("065 secretion"), is porting Chen, Wang & Sherman 2008, whose voltage is a prescribed
square wave. At the owner's request the overlap was announced to it twice: through the armory broadcast inbox
(`darkroom/claude-link/inbox/`, which the Mac laptop reads; whether 065 does is not documented) and by a direct
message. Neither side can reply to the other, so answers come through the owner.

beta_max answered the same day, by direct message, at the owner's request: **mouse first, then human.** Its granule
engine is fitted to mouse and rat islets, so only a mouse membrane model can drive it later without mixing species.
It builds no membrane model of its own (an averaged front end, its ADR-0006) and takes voltage as input
(`Drive = { Vmd, Vi, G }`). It suggested the Bertram/Sherman Integrated Oscillator Model for mouse, whose code has
no stated license, and is extracting Ashcroft & Rorsman 1989 into `01-lit/beta_max/ashcroft1989-extraction.md` for
reuse. The roadmap entry now says all of this. Correction to the paragraph above: the 065 session could reply after
all, so a cloud session and a 065 session can message each other directly.

Later that day the owner emailed Arthur Sherman and saved the reply in the beta_max literature folder. Sherman
approved use of Chen, Wang & Sherman 2008 "for an educational webapp" with proper attribution. The request named that
model only, so it covers beta_max, not the Integrated Oscillator Model a gaba_excites mouse cell would port; that
still needs asking. Recorded on the roadmap, with the rule for any port: equations and parameters from the paper,
the authors' code only as a check, none of their files in this public repository.

## 2026-10-29 — the mouse beta cell, ported (not yet in the app)

The owner said "go" on the mouse beta cell. The model is Bertram, Satin, Zhang, Smolen & Sherman (2004), the Dual
Oscillator Model (DOM 1.0): four currents (I_K, I_Ca, I_K(Ca), I_K(ATP)), cytosolic and ER calcium, and a metabolic
part (glycolysis with an oscillating PFK, feeding ATP production that calcium slows). It was chosen over the later
Integrated Oscillator Model papers because it is the source they build on, its paper is open, and the authors publish
one code file per figure plus errata, so each of its five firing patterns can be checked.

- **Ported from the paper, not copied from the code.** Eqs. 1–24 and Table 1 were read from PMC (equations are
  images there; all 32 were read by eye) into `lit/notes/bertram2004.md`, with the errata applied (κ = 0.005; V_max
  = 2 where Table 1 prints 1). The one piece the paper does not print, the PFK rate law (Smolen 1995), was written
  from the authors' `glycophan.ode`, cited to the code. No file of theirs is in the repository. Sherman's approval of
  2026-10-29 named Chen 2008, not this model; this port relies on the paper and cites the code as a check.
- **Two changes to the core's interfaces, neither specific to this cell.** A channel's `init` and `advance` may read
  calcium (the K_ATP channel carries ADP, G6P and FBP as its state, because it is the only current that reads them,
  and ADP's rate depends on calcium). A calcium pool may keep extra state after the voltage (`nExtra`; here ER
  calcium). `buildCell` takes a model variant, for the paper's per-figure parameter sets. The other models are
  unchanged: all 146 earlier tests pass without edits.
- **Checked against what the paper reports**, in `beta.test.ts`, `beta-bursts.test.ts` and
  `beta-glycolytic.test.ts` (split so the long runs go in parallel): glycolysis alone oscillates at R_GK 0.2 (5.8 min)
  and not at 0.4; at 0.3 it is bistable, resting at F6P 63.7, FBP 9.0 (paper ≈ 64, ≈ 9.1) from one start and
  oscillating at 5.2 min (paper ∼5) from the other; Fig. 3 bursts at 32.4 s (paper ≈ 30 s); Figs. 5–8 give compound,
  accordion, glycolytic and subthreshold patterns with FBP periods of 4.8–5.6 min; ADP is in phase with Ca in Fig. 3
  and out of phase in Fig. 8 (Fig. 9).
- **And against the authors' equations integrated by a stiff solver** (a literal transcription of `glycophan.ode`
  in a scratch Python script, LSODA, rtol 1e-9; not committed): 345 spikes in 6 min and periods of 30.3–31.6 s,
  against the port's 340 spikes and 32.4 s at the app's 0.01 ms. The period moves by about a second with dt (31.7–34.7
  s from 0.0025 to 0.05 ms), in whole spikes per burst.
- **Not in the app yet.** The model is in `MODELS`, so the core, tests and CLI can run it, but not in `MODEL_LIST`.
  Before it is offered: presets for its patterns, a control for R_GK (the paper's glucose), ranges suited to a 5.3 pF
  cell with no leak, and a decision on how the step protocol and rheobase apply to a cell that fires on its own.
  Its E_GABA default is a placeholder until the GABA lesson for this cell is sourced.

## 2026-10-29 — the beta cell in the app, on the oscilloscope; an LTS crash found

The owner said to start the app side. The beta cell is now in the model menu.

- **Oscilloscope only** (`ModelDef.scopeOnly`). Its rhythms run 30 s to 5 min, longer than any step sweep, and
  rheobase is undefined for a cell that fires on its own: a 10 s step sweep at the defaults showed nothing but the
  silent phase. Choosing it switches to the scope and disables the Step protocol button, whose tooltip says why. A
  placeholder step preset exists only so model switching and reset have one to hold.
- **Knobs** (`ModelDef.knobs`, `CellParams.knobs`), a general mechanism: a model may declare settings beyond leak and
  Cm, and its `channels()` receives their values. The beta cell's are glucose (R_GK), gK(ATP) and gK(Ca), on a
  "Glucose & K⁺" row of the amplifier. Changing one keeps the scope running from the current state (the stream keeps
  state for the same model), so removing and restoring glucose is the paper's Fig. 11 experiment.
- **Patterns** (`SCOPE_PATTERNS`): presets for the oscilloscope, each the knob values of one of the paper's figures
  plus a time base and speed. Regular bursting (Fig. 3) at 5 s/div and 10×; compound, accordion and glycolytic
  bursting (Figs. 5–7) at 1 min/div and 30×. Their notes quote numbers the tests pin. The scope gained time bases of
  5, 10 and 30 s and 1 min per division, and a 30× speed; the beta cell runs about 17× in Node and 6.7× in a
  headless browser on a cloud machine, so 30× is a request the readout may report unmet.
- **A published start** (`ModelDef.start`): the cell starts from the authors' compound-bursting start (Fig5.ode),
  then a 2 s settle, because at low glucose its steady state is unstable and glycolysis would sit on it for minutes.
- **Current scale** (`ModelDef.currentScale`): the siren's bound is 10× rheobase, undefined here; the beta cell uses
  the rheobase of its glucose-free cell, 0.9 pA (`beta-app.test.ts`). The model has no leak, so Rin is about 26 GΩ.
- **E_GABA** for the beta cell is the generic −80 mV, labeled a placeholder: GABA's action on beta cells is the human
  cell's lesson (Braun et al. 2010).

**A crash on the live site, found on the way.** The scope's rate meter takes its full scale from a per-model table
that listed rs, fs and gnrh only. Choosing the LTS cell on the oscilloscope, where the app opens, threw and blanked
the page; confirmed on gaba.tonydefazio.com (v0.2.6). It has been there since the LTS cell shipped in v0.2.3. The
table is now typed by ModelId, so leaving a model out fails the typecheck, and the screenshot check chooses every
model on the oscilloscope and fails if the page breaks.

## 2026-10-29 — voltage clamp, the core: checked against NEURON

Les Satin (a collaborator of Arthur Sherman's) asked for a voltage-clamp mode for every model. The owner's decisions:
**measure the recorded current**, with the true current shown behind it as an option; **the pyramidal cell first**,
checked against NEURON; and **no model curves**: activation and inactivation exist only once a protocol has been run
and the experimenter has chosen where to measure (peak, sustained, or a cursor), as on a rig. Estimated at 8–10
hours in six pieces.

- **The circuit** (`stepVC`, simulate.ts): the amplifier holds the pipette at the command and the cell sits behind
  Rs; the same conductances, gate order and calcium update as current clamp, by backward Euler. Rs = 0 is the ideal
  clamp. Pipette capacitance is taken as compensated.
- **Rs matters at once on this cell.** The 290 pF pyramidal soma carries ~270 nA of sodium current at 0 mV; behind
  15 MΩ the clamp loses it and the cell fires an unclamped action current to +47 mV. That is what a real rig does
  with a cell this size. The mode will open with an ideal clamp so the first view is clean, with the Rs dial beside
  it.
- **Protocols** (`vclamp.ts`): a holding potential, a list of segments, and one varied segment (its potential or its
  duration), which covers activation, inactivation, tails and recovery. **Measurements** on the recorded current in
  a window of one segment: peak inward, peak outward, mean (sustained), or a cursor; each point carries the true Vm
  too. A Boltzmann fit for normalized curves. **Channel blocking** (`CellParams.block`), in either clamp.
- **Checked against NEURON** (`tools/neuron_oracle_vc.py`, SEClamp on ModelDB 123623's mechanisms): activation and
  inactivation families at rs = 0.001 MΩ, and activation at 2 MΩ, where the cell escapes. Every 0.2 ms sample
  within 10 pA and 0.01 mV, and full-resolution peaks within 0.05%; measured, the worst differences are 1 pA (near
  ideal) and 3 pA on 58 nA (2 MΩ). NEURON's 0.001 MΩ is not ideal: 262 nA through it is a 0.26 mV error, which on
  the steep sodium current is a 60 nA difference from a true ideal clamp, so like is compared with like.
- **Voltage-clamp storage is every 0.02 ms**, an exact multiple of dt, so sample times are exact; current clamp's
  0.025 ms rounds to 0.03 (a known roadmap item), which first made the comparison look wrong.

## 2026-10-29 — voltage clamp in the app

A third mode, "Voltage clamp", beside Step protocol and Oscilloscope (`src/ui/VClampMode.tsx`, its own worker
`src/vc-worker.ts`). The tour folds away in this mode, as the owner suggested, so the traces take the left of the
page and what was measured the right.

- **What is on screen.** The recorded current of the family over the command, with each measurement's window shaded
  and the capacitive transients left out of the autoscale; the true current and Vm dashed behind on request. On the
  right, the measured points (M1, M2), M1 normalized with its Boltzmann fit or, for a tail family, where it reverses,
  and a table. Nothing appears until a protocol has run.
- **The amplifier.** Model and cell size and leak as in the other modes (no holding current); CLAMP (Rs, 0–30 MΩ);
  CHANNELS (one switch each, shared with current clamp through `CellParams.block`); RECORDING (filter, RMS in pA);
  PROTOCOL (preset, hold, up to eight segments, which one varies and how); MEASURE M1 and M2 (segment, peak in/out,
  mean or cursor, window); ANALYSIS (I/Imax or G/Gmax with E_rev, fit on or off, x as command or true Vm).
- **Presets** are protocols, not claims: activation, inactivation, tails, recovery. They apply to every model and
  quote no measured number, so no cell's number shows on another.
- **Two findings while building it.** The x of an inactivation curve is the prepulse, not the potential where the
  measurement is taken: the first version plotted every point at the test potential. True Vm can stand in for the
  command only when the measurement is in the varied segment. And the amplifier's filter moves the fitted G–V of a
  fast sodium current: V½ −20.5 mV unfiltered, −17.3 at 10 kHz, −11.1 at 5 kHz (pinned in vclamp.test.ts). The mode
  opens at 10 kHz, like current clamp; 5 kHz was the first choice and was wrong for sodium.
- **Defaults**: ideal clamp (Rs 0), filter 10 kHz, 2 pA RMS noise. Up to 30 sweeps of up to 3 s.
- **Not yet**: Rs compensation (prediction/correction), P/N leak subtraction, ramps, a CSV of the measured points.

## 2026-10-29 — the rig in three panels; a scope lockup fixed

The owner asked whether the amplifier could fold away, sit directly below the recording window, and be split so that
simulation parameters (gL beside a real amplifier's leak compensation) and the filter beside the noise sources stop
confusing. Done for all three modes (`RigPanels`, src/ui/AmpFront.tsx):

- **Amplifier**: clamp mode (the mode switch and Old school stay in its name strip), HOLDING (Ihold, moved out of CELL),
  ELECTRODE, FILTER, and on the oscilloscope MONITOR. In voltage clamp: CLAMP (Rs) and FILTER.
- **Acquisition**: STEPS, or PULSES on the scope, or the voltage-clamp PROTOCOL, MEASURE and ANALYSIS.
- **Simulation**: MODEL, CELL (gL, Cm, measured Rin and τm), CHANNELS (block switches, now in every mode), a model's
  own knobs, MEMBRANE NOISE, RECORDING NOISE (RMS, hum, mains; the filter left it for the amplifier), RANDOM DRAW, and
  the PSC generators.
- Each folds to a one-line summary (`▸`/`▾` in its name strip), remembered per browser. The panels sit directly under
  the recording window: in voltage clamp the analysis plots were made shorter (and the table moved below the panels)
  so that the right column no longer pushed them 250 px down; they now start 29 px below the traces.
- In voltage clamp, "M1 reverses at" shows only when the fit is off (tails): on an activation curve it read the leak's
  crossing near rest as if it were a reversal.

**A lockup, found by the owner, on the live site too.** On the oscilloscope in Old school (the default), choosing
10 ms/div made the page fall further and further behind until it froze: measured, it answered in 0.9 s after 1 s,
8.5 s after 3 s and 80 s after 6 s, here and on gaba.tonydefazio.com. The phosphor drew every newly written column as
its own stroke with a shadow blur, for each trace; 10 ms/div writes about 12,000 columns a second, which cost more
than a second per second, so the work piled up. Now the columns are grouped into four brightness levels and each is
stroked as one path with one blur, and a column written twice since the last frame is drawn once. After: the page
answers within 16 ms at 10 ms/div at 0.1×, 1× and 10×, and at 20 ms/div at 30×. The screenshot check now runs
10 ms/div in Old school and fails if the page falls a second behind.

## 2026-10-29 — the Hodgkin–Huxley squid axon (core)

The owner asked for the Hodgkin & Huxley 1952 squid giant axon action potential, in parallel with voltage clamp, and
chose: **the space-clamped "membrane action potential" first, propagation later** (a cable is a solver change);
**a toggle for the current units** (pA, or µA/cm²); and **voltage clamp merged to main** before the HH app wiring.

- **A patch, not a cell.** 10 000 µm² of membrane: 1 µF/cm² gives 100 pF, so 100 pA is 1 µA/cm², and densities in
  mS/cm² × 100 are nS. The whole-cell framing of the other models (pF, nS, pA) then holds unchanged. Since
  µA/cm² = pA/pF at 1 µF/cm², the unit toggle can be the standard current density, and works for every model.
- **The oracle is NEURON's own `hh`** (tools/neuron_oracle_hh.py), which needs no .mod files. Two settings matter:
  `usetable_hh = 0`, or NEURON interpolates the rates from a 200-point table the port does not have; and
  `el_hh = −54.387`, the paper's leak reversal, which NEURON rounds to −54.3. Measured: spike counts match on all 21
  sweeps at 6.3 and 18.5 °C (up to 280 spikes, depolarization block and anode break included), every spike within
  one dt (0.010 ms). So the squid axon is validated the way the pyramidal cell is, not the way the GnRH cell is.
- **Temperature is a knob** (default 6.3 °C), every rate × 3^((T − 6.3)/10), as `hh.mod` does it.
- **Numbers, measured on the port:** rest −65.00 mV; rheobase 225 pA (2.25 µA/cm², 800 ms step); one spike at step
  onset up to 500 pA, two at 600; at 700 pA it fires repetitively at once at 59 Hz, with no slow firing below (class II, unlike the
  cortical cells); firing dies out by 10–20 nA (depolarization block); release from −300 pA (3.3 mV below rest) fires an anode-break
  spike, and −200 pA does not.
- **The siren caught a first draft of the anode-break preset.** At −1000 pA the axon sits below E_K, where no
  conductance can take it; the preset now uses −200 to −500 pA, which stays above E_K and still shows the effect.
- **Choosing a model with no preset blanked the page** (the app opens a model on its first preset). A test now
  requires a preset for every model the selector offers (protocol.test.ts).
- **The paper itself is not yet read.** Automated fetches were refused (PubMed Central, Europe PMC); it is on the
  owner's want-list. Until it is, the transcription is from `hh.mod` (lit/notes/hodgkin1952.md) and nothing quotes a
  page, figure or equation number from the paper.
- **GABA on an axon with no GABA synapse:** E_GABA defaults to rest (−65 mV) and says it is a placeholder.
- **Two presets**, each quoting only spike counts that the NEURON check holds exactly: the F–I family (no slow firing)
  and anode break.
- Not yet: the unit toggle, presets for the refractory period and temperature, and HH
  voltage-clamp presets reproducing the 1952 conductance families, all waiting for voltage clamp on main.
