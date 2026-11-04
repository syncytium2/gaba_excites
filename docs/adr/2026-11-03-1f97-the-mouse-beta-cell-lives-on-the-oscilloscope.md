# ADR 2026-11-03-1f97: The mouse beta cell lives on the oscilloscope; the step protocol is off for it

Status: Accepted, 2026-10-29

Written 2026-11-03, after the decision, from `docs/process.md` (2026-10-29, "the beta cell in the app, on the
oscilloscope"; 2026-11-02, "the beta cell's channels were not fitted to voltage clamp"). It was written because the
decision lived only in that narrative: on 2026-11-03 the owner, asked what threshold criterion the mouse cell should
carry since its steps are off, replied "i thought we turned steps on? it was vc that was challenging". Steps had not
been turned on.

## Context

The mouse beta cell (Bertram et al. 2004, `src/core/beta.ts`) fires on its own in glucose, in bursts whose rhythms
run from 30 s to 5 min. The step protocol's sweeps are seconds long. On 2026-10-29 a 10 s step sweep at the defaults
showed nothing but the silent phase, and rheobase is undefined for a cell that fires on its own.

On 2026-11-02 the owner asked why steps are disabled on this cell, then whether the model was built from voltage-clamp
recordings or long whole-cell recordings without current injection. Read on PubMed Central (PMC1304779), Bertram et
al. 2004 never injects current and never voltage-clamps: its voltage equation has no applied-current term, and its
data are islet membrane potential with no current injected and fura-2 calcium. Its experiment is changing glucose.

## Decision

The mouse beta cell is oscilloscope-only (`ModelDef.scopeOnly`). Choosing it switches to the oscilloscope and disables
the Step protocol button, whose tooltip says why. Its experiments are the paper's: the glucose and K⁺ knobs, and
patterns that reproduce its figures.

Voltage clamp does run on it. Because its channels were not fitted to voltage-clamp recordings, the voltage-clamp view
says so (`ModelDef.vcNote`, and `#beta-vc` on the methods page): its I–V and G–V curves show the model's assumptions,
not beta-cell measurements. That part is the 2026-11-02 decision; the owner agreed it should be said.

## Consequences

- No rheobase, F–I curve, phase plot or threshold readout for this cell, so it carries no threshold criterion
  ([ADR 2026-11-03-d4b6](2026-11-03-d4b6-spike-thresholds-criterion-belongs-to-the-model.md)).
- A placeholder step preset exists only so model switching and reset have one to hold.
- The human beta cell (Riz, Braun & Pedersen 2014) is different: it spikes at about 6 Hz, so its step protocol is on.
  Turning steps on for the mouse cell would be a new decision, superseding this one, and would need sweeps long enough
  for its bursts and a meaning for rheobase in a cell that fires on its own.

## Enforced by

- `src/core/beta.test.ts`: `MODELS.betamouse.scopeOnly` is set.
- `scripts/screenshot.mjs`: on the mouse beta cell the step protocol button is disabled, and the voltage-clamp note
  shows (and does not show on the pyramidal cell).
- `src/core/beta-app.test.ts`: the voltage-clamp note and the methods paragraph exist.
- `src/core/threshold-criterion.test.ts`: a model may carry no threshold criterion only if it is oscilloscope-only.
