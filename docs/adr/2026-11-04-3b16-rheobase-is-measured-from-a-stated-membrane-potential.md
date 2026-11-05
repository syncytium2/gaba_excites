# ADR 2026-11-04-3b16: Rheobase states the Vm it was measured from; the human beta cell's is measured from −70 mV

Status: Accepted, 2026-11-04

## Context

The overnight build of 2026-11-02 turned the step protocol on for the human beta cell (Riz, Braun & Pedersen 2014),
which fires on its own at about 6 Hz: its preset's steps of −2 to +4 pA give 0 to 18 spikes in 2 s. Reviewing it, the
header read "Rheobase 1 pA": the app's rheobase is the least positive step of the family that fired
(`src/core/analysis.ts`), which is false for a cell that fires at 0 pA and at −1 pA.

Asked "Keep steps on, and what should rheobase say?", the owner answered: "Rheobase is usually measured from a
standardized membrane potential. Let's use a standard potenial and state rheobase from that potential". Asked which
potential, he chose "−70 mV, every cell"; asked whether it should replace today's definition everywhere or only for
cells that fire with no current, he chose "Everywhere". While it was being built he wrote "Maybe restrict to current
task for now. Mark as to do to make it global", and then "Each rheobase should list the vm it was measured from".

## Decision

- **The step protocol stays on for the human beta cell**, with its preset.
- **Its rheobase is measured from −70 mV** (`ModelDef.rheobaseFromMv`, `src/core/rheobase.ts`): the steady
  current that holds the cell at −70 mV (about −5.6 pA at the preset's settings, where it is silent), then the least
  step of the protocol's duration that fires, bisected to 0.1 pA, with the run's synaptic inputs. About 3.6 pA for
  the preset's 2 s step. It runs with every family, in the worker, and replaces the family's rheobase in the header
  and the notebook, which also records the holding current.
- **Every rheobase states the Vm it was measured from**: "Rheobase 600 pA from −70.6 mV". For the family's rheobase
  that is the Vm over the 50 ms before the step that fired (`FamilySummary.rheobaseVm`). The notebook records it
  and the report tabulates it ("Rheobase from"). Records made before 2026-11-04 have no such value and show "—".
- The separate "Holding Vm" readout is hidden when it agrees with the rheobase's Vm to within 0.05 mV, as it does
  for a quiet cell without synaptic input, so the readout line stays one line; it shows when they differ.
- **Every other cell keeps the family's least firing step** for now. Measuring every cell from −70 mV is on
  `docs/roadmap.md` ("Not now"), with the numbers it would move.

## Consequences

- The human beta cell's threshold, AP peak and half-width are still those of the first spike of the family's
  rheobase sweep (the least positive step that fired), not of the −70 mV measurement.
- The holding current is the steady-state one, computed without synaptic inputs; with PSCs on, the Vm before the
  step can sit off −70 mV, and the readout says where it actually was.
- Going global needs a decision about the GABA crossover: holding the pyramidal cell at −70 mV with current cancels
  the shift of Vm that GABA causes, which is the experiment the app is named for.

## Enforced by

- `src/core/human-app.test.ts`: the human cell measures from −70 mV, is held there by about −5.6 pA, and fires at
  3.5–3.75 pA; it is the only model that measures so.
- `src/core/report.test.ts`: the record carries the rheobase's Vm, and the report has the "Rheobase from" column.
- `scripts/screenshot.mjs`: the human cell's header reads about 3.6 pA "from −70.0 mV"; the pyramidal cell's reads
  "from" a Vm in pA/pF too; the amplifier does not move on a mode switch (which the longer readout first broke).

Unenforced: that the methods page, README and llms.txt describe it.
