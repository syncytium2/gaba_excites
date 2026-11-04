# Handoff 2026-11-04: the human beta cell, fully reviewed, waiting for the owner's merge

**Supersedes the review status in [`2026-11-03-human-beta-review.md`](2026-11-03-human-beta-review.md).** The merge
and deploy steps in [`2026-11-03-human-beta.md`](2026-11-03-human-beta.md) still hold.

**Still: do not merge to main or deploy until the owner says so.** Branch `human-beta`, worktree
`~/Developer/gaba_excites-worktrees/human-beta`, pushed.

## The rest of the overnight choices, reviewed 2026-11-04

Each is an ADR in `docs/adr/` with his words and the question they answered:

| Overnight choice | Owner's answer | ADR |
|---|---|---|
| A preset whose knobs move shows as Custom | Custom, and keep its note, marked; step preset notes are back as a tooltip (they had none since `7cabed8`) | `2026-11-04-f5f6` |
| Knobs in pS/pF | "Toggle": a pS/pF / nS/pF switch, display only | `2026-11-04-f9aa` |
| Step protocol on for the human cell | Kept; rheobase measured held at −70 mV (3.6 pA), and every rheobase states its Vm. −70 mV for every cell is a "Not now" item on the roadmap | `2026-11-04-3b16` |
| E_GABA −40 mV and the GABA patterns | Kept; PSC panel kept with a siren warning; islet GABA findings are the roadmap's first high-priority item | `2026-11-04-8e7a` |

## Also on the branch since 2026-11-03

- The ADR kit's Claude Code hook, wired (the owner's yes, 2026-11-04), re-vendored at armory `2ded5cd3`. It fires
  only once this branch reaches `main`.

## Waiting on the owner

- His go-ahead to merge and deploy.
- The KNDy paper for 2 mV/ms.

## Checks run, 2026-11-04

`npm test` (288), `npx tsc -b`, `npm run build`, `node scripts/fi.ts --help`, `python3 tools/adr/adr.py check`, and
`node scripts/screenshot.mjs` against a local preview: clean.
