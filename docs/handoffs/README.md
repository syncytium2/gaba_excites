# Handoffs

A handoff is what one session knew at one moment, written for the next session to pick up. Do not edit a handoff's body
to bring it up to date. A later handoff supersedes an earlier one by saying so, which keeps each record honest about its
date.

Name: `YYYY-MM-DD-<slug>.md`, the date it was written.

## Open

- [`2026-10-18-explainer.md`](2026-10-18-explainer.md): a simple explainer so anyone can play with the simulator,
  built from Tony's text. **It waits for his text.**
- [`2026-10-18-channel-editor.md`](2026-10-18-channel-editor.md): a single-cell Na⁺ channel editor and an excitability
  scorecard, for threshold and hyperexcitability.
- [`2026-10-18-adrs.md`](2026-10-18-adrs.md): architecture decision records, extracted from `docs/process.md`. Read
  it with [`2026-10-18-adrs-addendum.md`](2026-10-18-adrs-addendum.md), which adds what Tony approved, including ADR
  hygiene enforced by `scripts/next_adr.sh` (vendored from interface2) and `src/adr.test.ts`.

All three can run **in parallel**, each in its own worktree. Each handoff says which files it owns, so the sessions do
not collide. The explainer and the channel editor both touch `src/App.tsx`, so read both of their "Coordination"
sections before starting either. The ADR session touches only `docs/`, plus its script and test. It
merges the ADR framework to main first, so the other sessions can number ADRs of their own.
