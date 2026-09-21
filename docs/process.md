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
