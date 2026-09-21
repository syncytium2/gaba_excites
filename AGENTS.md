# AGENTS.md

For an AI agent working in this repository. Humans want `README.md`.

## What this is

A browser simulator of current clamp, for teaching excitability, on two cell
models defined as data in `src/core/models.ts`: a cortical pyramidal cell
(Pospischil et al. 2008, ModelDB 123623) and a mouse GnRH neuron (Adams et al.
2018). The core is `src/core/` (pure TypeScript, no DOM); the UI is React +
uPlot; the simulation runs in `src/worker.ts`.

## Commands

- `npm test` — vitest. The suite is the contract: `oracle.test.ts` holds the
  pyramidal port to NEURON's spike times, `gnrh.test.ts` holds the GnRH port
  to the numbers its paper reports, `gaba.test.ts` holds the GABA crossover
  numbers that the presets, README, methods page and llms.txt all quote.
- `npx tsc -b` — typecheck (vitest does not). `npm run build` — static bundle.
- `node scripts/fi.ts --help` — the model from the command line.
- `node scripts/screenshot.mjs <url> <outdir>` — look at the app; fails on
  console errors, third-party requests, phone overflow. Run it after any UI change.
- `npm run deploy` — the only way to deploy. Do not hand-roll `wrangler deploy`.

## Rules that are load-bearing

- **Imports inside `src/core/` and `scripts/` carry explicit `.ts`
  extensions.** That is what lets plain `node` run the CLI. Vite resolves both
  forms, so no test catches a stripped extension except CI's CLI step.
- **If you change the model, the integrator, or dt, re-run the NEURON oracle**
  (`tools/neuron_oracle.py`, instructions in its docstring) and the GABA
  numbers, and update every place that quotes them: `src/core/protocol.ts`
  preset notes, `README.md`, `public/methods.html`, `public/llms.txt`.
- **Stock channels only, for now.** New channels arrive as objects satisfying
  `Channel` (`src/core/channels.ts`); the solver should not learn about any
  particular channel. A new MODEL is an entry in `models.ts` plus a test that
  checks it against its source, plus presets scoped to it. See `docs/roadmap.md`.
- **Presets quote measured numbers, so each belongs to one model.** Never let
  a pyramidal-cell claim show while the GnRH model is selected.
- **The GnRH model has no code oracle.** Its check is the paper's reported
  numbers. Do not describe it as validated the way the pyramidal cell is.
- **Measurements are on Vm, not the recorded trace.** Electrode settings and
  recording noise must change what the traces show, never the F–I curve. Tests
  enforce both. The owner asked to hold off on changing this.
- **No third-party requests, ever.** No CDNs, fonts, analytics. The CSP is
  injected into the built HTML by `vite.config.ts`; the dev server runs without
  it so HMR works.
- **The Born stamp comes from the root commit** (`git log --max-parents=0`).
  Never rewrite the root commit; never build from a shallow clone.
- **Log the process.** `docs/process.md` is the running record of decisions
  and why; add to it when you make one. The owner asked for this.
- House style: "data" is plural. Name things instead of pointing at
  "step 4" or "option 2".
