# ADR 2026-11-11-6db4: Dynamic clamp is an injected conductance outside the model and it is ideal

Status: Proposed, 2026-11-11

## Context

`docs/roadmap.md` names dynamic clamp as the amplifier's fourth mode. The handoffs
[`2026-11-11-kndy-kv4-leak.md`](../handoffs/2026-11-11-kndy-kv4-leak.md) and
[`2026-11-11-kndy-qiu-code.md`](../handoffs/2026-11-11-kndy-qiu-code.md) ask for it to test the owner's objection
to Mendonça et al. 2018: a Kv4 conductance added by dynamic clamp is partly open at rest, so it is also a leak.
On 2026-11-11, answering the list of open decisions, the owner wrote: "dynamic clamp should definielty be added
to public page for this same reason (DC models change passive properties)". The standing rule is that the solver
learns about no particular channel (AGENTS.md, "Stock channels only").

## Decision

- **An injected conductance is a `Channel` that belongs to the rig, not the model**: `CellParams.inject`
  (`src/core/cell.ts`), a list of `{ channel, g, erev }`. `g` is in nS as set, may be negative (the clamp then
  subtracts), and does not scale with Cm. Injected channels join the cell's channels after the model's own
  (`BuiltCell.nOwn` marks the boundary), so the steady-state I–V, resting potential, input resistance, current
  clamp and voltage clamp all feel them, and nothing in the solver changed to make that so.
- **The clamp is ideal**: it reads Vm itself every integration step, with no series resistance, filter or loop
  delay. This keeps the rule that measurements are on Vm. Proposed; the handoff left "ideal first, or through the
  electrode from the start" to the owner.
- **Mendonça's Kv4 is the first injected conductance** (`src/core/dynclamp.ts`), dosed as their papers dose it,
  by the peak conductance at 0 mV. Two assumptions are recorded there because the 2018 paper states neither: the
  injection reverses at −90 mV, and the 0 mV test step starts from −90 mV.
- **Every injection comes with its leak control.** `linearizedAt` builds the plain leak with the injection's
  steady current and slope at a potential, and `opposite` subtracts it. That pair is the lesson: what the leak
  reproduces is owed to passive properties, and what survives its subtraction is owed to gating.
- **The owner's:** dynamic clamp goes on the public page. Not built yet: the mode in the UI, its presets and the
  pages that quote numbers.

## Consequences

- A subtraction larger than what the cell has leaves no stable rest; the UI will have to bound the knob and say why.
- An ideal clamp cannot show what a real one gets wrong (bridge error in the measured Vm, loop delay). If that
  is wanted, it is a second, non-ideal mode, and it would be the first place a measurement depends on the electrode.
- A calcium-carrying injected conductance is not supported: injected channels never feed the calcium pool.

## Enforced by

- `src/core/dynclamp.test.ts`: the Kv4 equations and the dose conversion (0.416 of ḡ); an injected conductance
  joins after the model's own, unscaled by Cm; adding and subtracting the same conductance leaves the cell as it
  was; a leak injected into the pyramidal cell changes its rest, input resistance and firing; the linearization
  reproduces the injected cell's rest and input resistance, and its subtraction restores the control's.
- `src/experiments.test.ts`: the Kv4 leak experiment's pieces (`tools/experiments/kv4_leak.ts`).
- Not enforced by anything: that the UI, once built, offers the leak control beside every injection.
