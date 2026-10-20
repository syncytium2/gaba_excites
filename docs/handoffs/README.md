# Handoffs

A handoff is what one session knew at one moment, written for the next session to pick up. Do not edit a handoff's body
to bring it up to date. A later handoff supersedes an earlier one by saying so, which keeps each record honest about its
date.

Name: `YYYY-MM-DD-<slug>.md`, the date it was written.

## Open

- [`2026-10-18-explainer.md`](2026-10-18-explainer.md): a simple explainer so anyone can play with the simulator,
  built from Tony's text. **Since 2026-10-19, on branch `gnrh-rest`:** his first draft is `/explainer`, reached from the
  guided tour; the pop-up is retired and the glossary waits (see `docs/process.md`).
- [`2026-10-18-channel-editor.md`](2026-10-18-channel-editor.md): a single-cell Na⁺ channel editor and an excitability
  scorecard, for threshold and hyperexcitability.
- [`2026-10-18-adrs.md`](2026-10-18-adrs.md): architecture decision records, extracted from `docs/process.md`. Read
  it with [`2026-10-18-adr-enforcement.md`](2026-10-18-adr-enforcement.md): ADR hygiene enforced by tests, a CI step and
  a Claude Code hook, never by instructions in AGENTS.md.

All three can run **in parallel**, each in its own worktree. Each handoff says which files it owns, so the sessions do
not collide. The explainer and the channel editor both touch `src/App.tsx`, so read both of their "Coordination"
sections before starting either. The ADR session touches `docs/`, plus its script, test, hook and
one CI step. It merges that framework to main first, so the other sessions can number ADRs of their own.

- [`2026-10-19-gaba-opening.md`](2026-10-19-gaba-opening.md): the owner's upgrades to the explainer: open on the GnRH
  cell with GABA PSPs at about −60 mV, then build up in steps with "try this" buttons, and make it formally
  accessible. Read it with the explainer handoff.

- [`2026-10-20-lts-cell.md`](2026-10-20-lts-cell.md): a rebound-bursting cell (the LTS cell of ModelDB 123623,
  checked in NEURON) to teach that hyperpolarization can excite. **Confirm with the owner before building.** Also the
  state of the site after the v0.2.2 deploy and what is open with him.

## Superseded

- [`2026-10-18-adrs-addendum.md`](2026-10-18-adrs-addendum.md): superseded the same day by
  `2026-10-18-adr-enforcement.md`, because it enforced rules by writing them into AGENTS.md.
