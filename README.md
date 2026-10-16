# gaba_excites

[![tests](https://github.com/syncytium2/gaba_excites/actions/workflows/test.yml/badge.svg)](https://github.com/syncytium2/gaba_excites/actions/workflows/test.yml)

**A current-clamp simulator, built as a teaching tool for UM Physiol 578.**
It runs entirely in the browser. The course goal was excitability: what decides
whether, and how often, a neuron fires. The simulator shows the three things
that decide it, each with its own controls:

- **passive properties:** the leak, membrane capacitance, and the input
  resistance and time constant that follow from them;
- **voltage-gated conductances:** the channels that set threshold, the shape
  of the action potential, and how firing adapts during a step;
- **synaptic inputs:** glutamate and GABA conductances. Moving E_GABA lets the
  same inhibitory conductance hyperpolarize, shunt or excite the cell.

You run a family of current steps, the way you would on a rig, and read off
rheobase, spike threshold and the F–I curve. Pin a curve, change one thing, and
compare.

Live at **https://gaba.tonydefazio.com**. The methods page, with every equation,
is at [`/methods`](https://gaba.tonydefazio.com/methods) (source:
`public/methods.html`).

## Three cells

Three cell models, chosen from a menu:

- **Cortical pyramidal (regular spiking):** Pospischil et al. (2008), ported
  from its ModelDB source (123623) and **checked spike-for-spike against
  NEURON** running the original mechanisms. Three voltage-gated currents:
  transient Na⁺, delayed-rectifier K⁺, and a slow M-type K⁺ current that makes
  firing adapt.
- **Cortical interneuron (fast spiking):** from the same paper and ModelDB
  entry. The same two Na⁺ and K⁺ channels, with twice the K⁺ and no M current,
  and **checked spike-for-spike against NEURON** the same way. It does not
  adapt: at 800 pA it fires at 101 Hz from start to finish, where the
  pyramidal cell falls from 43 to 10 Hz.
- **GnRH neuron (mouse, negative feedback):** Adams et al. (2018, J Neurosci
  38:1249). Ten currents, including a Markov fast Na⁺ scheme, and a calcium
  pool. Transcribed from the paper. There is no public code to compare against,
  so it is checked against what the paper reports: −6 pA holds it at −70 mV,
  and it fires 0, 0, 0, 1, 4 and 6 spikes at 0–30 pA, as in the paper's Fig. 7F.

Side by side, they make the course's point. A large, leaky cell needs hundreds
of picoamps to fire (561 pA). A small cell with an input resistance near
0.5 GΩ fires on about 18 pA. And the pyramidal cell and the interneuron share
their channels: what separates an adapting cell from a fast, non-adapting one
is the density of one K⁺ current and whether a slow one is there at all.

## What you can change, and what it teaches

**Passive properties**

| Control | What it does |
|---|---|
| **gL (leak)** | A linear leak conductance in nS, opening on the published values (28.95 nS pyramidal, 1 nS GnRH). Nothing else moves it: not Cm, not a change to a channel. Input resistance is *measured* from the resulting cell, leak plus the channels open at rest, and shown next to it with τm = Rin·Cm. |
| **Cm** | Scales the cell's channels with its area. Channel densities are fixed, so a bigger cell has more channels; the leak stays as set. On the pyramidal cell rheobase moves little with Cm; the kinetics do. |
| **Ihold** | Constant current throughout. The cell is settled at Ihold for 3 s before each run. |

**Voltage-gated conductances**

Each model's channels are fixed at their published values for now. You see
them at work in threshold (dV/dt ≥ 20 V/s), action-potential peak and
half-width, the phase plot, the F–I curve, and adaptation (initial against
mean rate). An editor that lets you change each channel is next on the
[roadmap](docs/roadmap.md).

**Synaptic inputs**

| Control | What it does |
|---|---|
| **Glutamate / GABA PSCs** | Conductance-based. Rate, peak conductance, rise and decay τ, Poisson or regular timing. E_glu = 0 mV; E_GABA from −100 to 0 mV, defaulting per cell: −80 mV pyramidal, −36.5 mV GnRH (measured by gramicidin perforated patch, DeFazio et al. 2002). The GnRH cell's GABA PSC defaults to the measured 10 ms decay and ~1 nS peak (Jaime et al. 2026). Seeded, so changing the cell replays the same events. |

**The experiment itself**

| Control | What it does |
|---|---|
| **Oscilloscope** | The same cell run continuously, with every control live: turn the holding current and watch it start to fire, or switch GABA on mid-burst. A repeating pulse sits on top of the holding current, and sweeps trigger on its onset. Store keeps the screen as a reference trace behind the live one, for before-and-after comparison. Nothing resets the cell, so slow currents show; only switching models starts again. Live firing rate and mean Vm, measured on true Vm. At 0.1×, 1× or 10× real time. |
| **Step protocol** | A family (first, increment, count) or any list of steps; step onset, duration, sweep length. Presets for an F–I family, fine threshold steps, a synaptic barrage, and three GABA demonstrations. |
| **Rs, bridge, pipette C** | Series resistance changes the *record*, not Vm: an I·Rs offset (removed by bridge balance) and, with pipette capacitance, a low-pass on spikes. |
| **Noise** | Recording noise (RMS, bandwidth, mains hum) on the trace only; membrane noise (an Ornstein–Uhlenbeck current, σ and τ) that the cell feels and that leaves Rin unchanged. |

A small red siren blinks when the cell is driven past what a real cell would
do: spikes that no longer overshoot or depolarization block, Vm beyond the
reversal potentials, or a current more than 10× the cell's rheobase.

Every measurement is taken on the true membrane potential, so electrode
settings and recording noise change what the traces look like, never the
numbers.

Readouts: rheobase (refinable to 1 pA), threshold, AP peak and half-width,
measured Rin, holding Vm, F–I gain; recorded voltage with the true Vm on
demand, command current, synaptic conductances, the F–I curve (mean and
initial rate, with up to four pinned curves for comparison, and CSV export), a
phase plot, and a per-sweep table.

## The result it is named for

On the published pyramidal cell, with clock-like GABA (200 Hz, 3 nS, 0.5/10 ms),
rheobase bisected to 1 pA:

| GABA | Rheobase | |
|---|---:|---|
| off | 561 pA | |
| E = −80 mV | 765 pA | inhibitory |
| E = −60 mV | 628 pA | depolarizes the cell (rest is −70.6 mV) — and still inhibits |
| E = −50 mV | 560 pA | neutral |
| E = −35 mV | 458 pA | excites |

Depolarizing is not the same as excitatory, and the crossover is about 11 mV
*below* spike threshold. `src/core/gaba.test.ts` holds these numbers.

## Running it

```sh
npm install
npm run dev          # the app, at http://localhost:5173
npm test             # vitest: the model, NEURON parity, the GABA crossover
npm run build        # static bundle in dist/ (tsc -b && vite build)
node scripts/fi.ts --help     # the same simulation from the command line
node scripts/fi.ts --model gnrh --steps 0,6,12,18,24,30 --step-dur 500 --sweep 800
```

Node ≥ 22.18 (`.nvmrc` pins 24). The CLI is plain TypeScript run by `node`, no
build step: imports inside `src/core/` carry explicit `.ts` extensions for that
reason.

## How it is built

- `src/core/` — the models, pure TypeScript, no DOM. `channels.ts` (every
  channel behind one `Channel` interface, with declarative gate builders and
  the Markov Na⁺ scheme), `models.ts` (the models as data), `cell.ts`
  (whole-cell ↔ density mapping, the leak and the measured Rin, the calcium steady state),
  `synapses.ts`, `noise.ts`, `simulate.ts` (electrode circuit and
  integrator), `analysis.ts` (spikes, threshold, F–I, Rin), `protocol.ts`
  (step lists and per-model presets).
- `src/worker.ts` — the simulation runs in a Web Worker so the page never
  freezes; a 13-sweep, 1 s family takes ~0.2 s.
- `src/App.tsx`, `src/ui/` — React and uPlot.
- `tools/neuron_oracle.py` — regenerates the NEURON reference in
  `src/core/oracle/neuron_rs.json`.
- `scripts/deploy.sh` — the deploy runbook (after colonel_kernel's).
- `scripts/screenshot.mjs` — renders the app headlessly and fails on console
  errors, third-party requests, or horizontal overflow at phone width.

Stack and hosting follow the author's sibling sites
([no_peak](https://github.com/syncytium2/no_peak),
[colonel_kernel](https://github.com/syncytium2/colonel_kernel)): Vite, a static
bundle, an assets-only Cloudflare Worker, a strict CSP (`connect-src 'none'`)
injected at build, no fonts, analytics, or third-party requests of any kind.
The build stamps the **born-on date and time** — the root commit,
21 Sep 2026, 11:53 (UTC−04:00) — and refuses to build from a shallow clone,
where that commit is missing.

## Literature

[`lit/`](lit/) holds every source the app takes a number, an equation or a
method from, with what it took and where that lives in the code:
[`lit/sources.json`](lit/sources.json) is the list, rendered into
[`lit/README.md`](lit/README.md), [`lit/references.bib`](lit/references.bib)
and the website's `/lit` page; [`lit/notes/`](lit/notes/) has the
transcriptions (for the GnRH model, every table and equation as read). PDFs
live only in the gitignored `lit/pdf/`: this repository is public.

## Process

This repository was public from its first push, and how it was built is
written down as it happened: [`docs/process.md`](docs/process.md). What is
deliberately left for later — plug-and-play channels and a channel editor
first — is in [`docs/roadmap.md`](docs/roadmap.md).

## Citing

Cite the model you use:

- Pospischil M, et al. (2008) Minimal Hodgkin–Huxley type models for different
  classes of cortical and thalamic neurons. *Biol Cybern* 99:427–441.
  [doi:10.1007/s00422-008-0263-8](https://doi.org/10.1007/s00422-008-0263-8).
- Adams C, Stroberg W, DeFazio RA, Schnell S, Moenter SM (2018)
  Gonadotropin-releasing hormone (GnRH) neuron excitability is regulated by
  estradiol feedback and kisspeptin. *J Neurosci* 38:1249–1263.
  [doi:10.1523/JNEUROSCI.2988-17.2017](https://doi.org/10.1523/JNEUROSCI.2988-17.2017).

MIT licensed. © 2026 Richard Anthony DeFazio.
