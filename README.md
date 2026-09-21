# gaba_excites

[![tests](https://github.com/syncytium2/gaba_excites/actions/workflows/test.yml/badge.svg)](https://github.com/syncytium2/gaba_excites/actions/workflows/test.yml)

**A current-clamp excitability simulator that runs in the browser.** Set the
passive properties the way you would read them off a rig (Rin, Cm, Rs,
Ihold), run a family of current steps, and read off rheobase, spike threshold
and the F–I curve. Add glutamate and GABA PSCs, move E_GABA, and watch the
same inhibitory conductance hyperpolarize, shunt, or excite.

Two cell models, chosen from a menu:

- **Cortical pyramidal (regular spiking)** — Pospischil et al. (2008), ported
  from its ModelDB source (123623) and **checked spike-for-spike against
  NEURON** running the original mechanisms.
- **GnRH neuron (mouse, negative feedback)** — Adams et al. (2018, J Neurosci
  38:1249): ten currents including a Markov fast Na⁺ scheme and a calcium
  pool. Transcribed from the paper; there is no public code to compare against,
  so it is checked against what the paper reports: −6 pA holds it at −70 mV,
  and it fires 0, 0, 0, 1, 4 and 6 spikes at 0–30 pA, as in the paper's Fig. 7F.

Live site: *not yet deployed*; `https://gaba.tonydefazio.com` is the intended address.
The methods page, with every equation, is `public/methods.html` (served at `/methods`).

## What you can do with it

| Control | What it does |
|---|---|
| **Rin** | Input resistance *as measured at rest*. The leak is solved so that the measured Rin equals the value you set, active conductances included. |
| **Cm** | Sets the size of the cell. Channel densities are fixed, so a bigger cell has more channels. With Rin held, rheobase barely moves; the kinetics do. |
| **Ihold** | Constant current throughout. The cell is settled at Ihold for 3 s before each run. |
| **Rs, bridge, pipette C** | Series resistance changes the *record*, not Vm: an I·Rs offset (removed by bridge balance) and, with pipette capacitance, a low-pass on spikes. |
| **Step protocol** | A family (first, increment, count) or any list of steps; step onset, duration, sweep length. Presets for an F–I family, fine threshold steps, a synaptic barrage, and three GABA demonstrations. |
| **Noise** | Recording noise (RMS, bandwidth, mains hum) on the trace only; membrane noise (an Ornstein–Uhlenbeck current, σ and τ) that the cell feels and that leaves Rin unchanged. |
| **Glutamate / GABA PSCs** | Conductance-based. Rate, peak conductance, rise and decay τ, Poisson or regular timing. E_glu = 0 mV; E_GABA from −100 to 0 mV, default −80. Seeded, so changing the cell replays the same events. |

Readouts: rheobase (refinable to 1 pA), threshold (dV/dt ≥ 20 V/s), AP peak
and half-width, measured Rin, holding Vm, F–I gain; recorded voltage with the
true Vm on demand, command current, synaptic conductances, the F–I curve
(mean and initial rate, with up to four pinned curves for comparison, and CSV
export), a phase plot, and a per-sweep table.

## The result it is named for

On the published pyramidal cell, with clock-like GABA (200 Hz, 3 nS, 0.5/10 ms),
rheobase bisected to 1 pA:

| GABA | Rheobase | |
|---|---:|---|
| off | 561 pA | |
| E = −80 mV | 765 pA | inhibitory |
| E = −60 mV | 628 pA | depolarizes the cell (rest is −70.6 mV) — and still inhibits |
| E = −50 mV | 560 pA | neutral |
| E = −35 mV | 457 pA | excites |

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
  the Markov Na⁺ scheme), `models.ts` (the two models as data), `cell.ts`
  (whole-cell ↔ density mapping, the Rin solve, the calcium steady state),
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
