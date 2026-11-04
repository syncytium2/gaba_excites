# Handoff 2026-11-03 (night): the human beta cell, half reviewed

**Supersedes the review status in [`2026-11-03-human-beta.md`](2026-11-03-human-beta.md)**; everything else there
(Pedersen's model, how it was checked, the open science issues, merge and deploy steps) still holds. Written by the
session that went through the overnight decisions with the owner until he went to sleep.

**Still: do not merge to main or deploy until the owner says so.** Branch `human-beta`, worktree
`~/Developer/gaba_excites-worktrees/human-beta`, pushed.

## Reviewed

| Overnight decision | Owner's answer | Where recorded |
|---|---|---|
| Channels may read the Ca²⁺ current (`Channel.readsICa`) | approved; sum it once per step (done) | `docs/process.md`, 2026-11-03 |
| A model may count spikes at its own level (human −30/−50 mV) | approved | `docs/process.md` |
| The siren skips the overshoot check for this cell | approved | `docs/process.md` |
| "—" for a spike below 20 V/s | replaced: every model has its own threshold criterion, with a switch | [ADR 2026-11-03-d4b6](../adr/2026-11-03-d4b6-spike-thresholds-criterion-belongs-to-the-model.md) |
| Pedersen's permission | recorded | `lit/sources.json`, `docs/process.md` |

## Not yet reviewed (ask him one at a time, as before)

1. A step preset that sets knobs shows as Custom once the knobs move (`presetHolds`). This also changes the squid
   axon: "Warmed to 18.5 °C" shows as Custom when its temperature moves.
2. Knobs in pS/pF, not the papers' nS/pF.
3. The step protocol is on for this cell (one preset, picoamp steps; rheobase undefined for a spontaneously firing
   cell; siren scale 1.0 pA).
4. E_GABA opens at −40 mV (Riz's E_Cl), and the three GABA patterns.

Each answer that is a decision gets an ADR in `docs/adr/` (see its README for the format), with his words and the
question they answered.

## Waiting on the owner

- **The KNDy paper** for 2 mV/ms. He said "i'll find the kndy paper but not today". Until then 2 V/s stays cited as
  AVPV kisspeptin neurons (Wang, DeFazio & Moenter 2016), which the 2026-10-18 log already checked.
- **The ADR kit.** Session "mac armory adr" owns it (armory `docs/handoffs/2026-11-03-adr-kit-decisions.md`). When it
  is vendored here, run it over `docs/adr/` first.

## Checks run on this branch, 2026-11-03

`npm test`, `npx tsc -b`, `npm run build`, and `node scripts/screenshot.mjs` against a local preview: clean.
