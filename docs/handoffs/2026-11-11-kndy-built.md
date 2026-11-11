# Handoff 2026-11-11: the KNDy cell and the Kv4 leak experiment are built; the dynamic clamp mode is not

**Written by the gaba_excites session that did the work, the same day as
[`2026-11-11-kndy-kv4-leak.md`](2026-11-11-kndy-kv4-leak.md) and
[`2026-11-11-kndy-qiu-code.md`](2026-11-11-kndy-qiu-code.md). It supersedes their "nothing is built".** Their
experiment and their list of what a port has to face still stand as the brief.

## What exists, on branch `kndy-kv4` (worktree `../gaba_excites-worktrees/kndy-kv4`), committed and not pushed

Not pushed because this repository is public and the owner asked for private mode; whether that covers the
repository or only the website is his to say. `npm test` and `npx tsc -b` pass.

- `tools/kndy_oracle.m` and `src/core/oracle/matlab_kndy.json`: the authors' code run unchanged in MATLAB.
- `src/core/kndy.ts`, `src/core/kndy.test.ts`: the cell, private (not in `MODELS`), held to the oracle.
- `src/core/dynclamp.ts`, `src/core/dynclamp.test.ts`, `CellParams.inject` in `src/core/cell.ts`: injected
  conductances, Mendonça's Kv4, and the linearized-leak control. Works on every model.
- `tools/experiments/kv4_leak.ts`, `kv4_leak_report.ts`: the experiment and its report.
- `lit/notes/qiu2024.md`, `lit/notes/mendonca2018.md`, four entries in `lit/sources.json`.
- Two Proposed ADRs and a `docs/process.md` entry with the results.
- Figures, data and example traces: darkroom folder `gaba_excites/2026-11-11_kv4-leak/`.

## What the owner has decided

Both sources built and compared; the cell private; dynamic clamp on the public page.

## What waits for the owner

- **Confirm the code's cell as "the KNDy cell"** (the table's does not fire), and whether to write to the
  authors about the fifteen differences, the script comment the code does not reproduce, and a license.
- **Irregularity.** This host cannot test it. The next host is Mendonça et al. 2016's own two-compartment model
  with channel noise (Source code 1 of that paper, Java, not downloaded). It needs a second compartment and a
  noise whose variance follows the current, both new to this simulator. Worth it?
- **The dose axis for the public page**: nS, nS/pF, or the share of resting conductance it adds.
- **Ideal clamp only, or also one through the electrode.**
- **Which cells and conductances the public mode offers.** The core takes any channel on any cell. A first
  version could be Mendonça's Kv4 and a plain leak on the cells already public, with the "same as a leak"
  control one click away.
- The host's refit to his 2019 recordings, the parameter set, and the threshold criterion (2 V/s is provisional)
  are still open from the earlier handoff.

## Next piece of work, once he has looked at the figures

The fourth amplifier mode in the UI: knobs for an injected conductance (dose, sign, reversal), the readouts
that make the lesson visible (resting potential and input resistance with the clamp on, beside the control's),
the leak control, a bound on subtraction with the reason, presets scoped to a model with numbers a test pins,
then `README.md`, `public/methods.html`, `public/llms.txt`, and `node scripts/screenshot.mjs`. No deploy without
his word.

## For the LatchBio take-home

`traces/` in the darkroom folder holds Vm, command current and clamp current for the control and each
condition at +0.4 nS/pF, at the step that gives 10 Hz, with and without noise, and a `manifest.json` that
records the injection, bias, step, sampling, noise and that the recording is the true membrane potential with no
filter. The trap and its answer are in the report's first section.
