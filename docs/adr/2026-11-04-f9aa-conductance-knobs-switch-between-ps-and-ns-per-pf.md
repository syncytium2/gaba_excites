# ADR 2026-11-04-f9aa: The human beta cell's conductance knobs switch between pS/pF and nS/pF

Status: Accepted, 2026-11-04

## Context

The human beta cell (Riz, Braun & Pedersen 2014; Pedersen 2010) has four conductance knobs: gK(ATP), GABA, gSK and
gHERG. The papers write them in nS/pF (0.010, 0.1, 0.2, 0.3). The overnight build of 2026-11-02 put the knobs in
pS/pF, so the published values are whole numbers that fit the dial's readout, with both units in each knob's tooltip
and on the methods page. Asked "Keep pS/pF?", with the alternative of switching to nS/pF to match the papers, the
owner answered "Toggle".

## Decision

- A two-way switch, "Units: pS/pF | nS/pF", in the knob row of any model with a pS/pF knob (today only the human
  beta cell). It opens on pS/pF.
- Display only: the model, presets, patterns and saved runs keep their values in pS/pF; the switch changes what the
  dials show and accept (×1000). The "you have moved" tooltip of a step preset uses the units on show.
- The choice is remembered in this browser as a convenience (`gaba_excites.nsknobs.v1`), every access guarded.

## Consequences

- A student can read the dials against the papers' Table 1 directly, or keep whole numbers.
- Notes and pattern texts still quote pS/pF (with nS/pF in the knob tooltips); they do not follow the switch.

## Enforced by

- `scripts/screenshot.mjs`: on the human cell, the switch reads gK(ATP) as "0.010 nS/pF" and back as "10 pS/pF".

Unenforced: that the switch never changes the simulation. It converts only at the dial (`knobShow` in
`src/App.tsx`); no test runs the cell under both settings.
