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
