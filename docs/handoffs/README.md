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
  checked in NEURON) to teach that hyperpolarization can excite. **Built 2026-10-21 on branch `lts-cell`** (owner
  approved; not yet merged or deployed; see `docs/process.md`). Also the
  state of the site after the v0.2.2 deploy and what is open with him.

- [`2026-10-30-workstation.md`](2026-10-30-workstation.md): set the owner's workstation up to deploy, deploy `main`
  (the voltage-clamp review round, v0.2.10), and push the release and its record before the session ends. Written for
  a workstation session the cloud session "cloud gaba deploy" will orchestrate. Read it with
  [`2026-10-30-workstation-windows.md`](2026-10-30-workstation-windows.md): the workstation is Windows (line endings,
  Git Bash, `bash scripts/deploy.sh` in place of `npm run deploy`).

- [`2026-11-03-human-beta.md`](2026-11-03-human-beta.md): the human beta cell (Riz, Braun & Pedersen 2014), built
  on branch `human-beta`, **not merged or deployed until the owner reviews it**. Lists the overnight decisions he must
  confirm, Pedersen's permission (granted; correspondence to be pasted) and every open concern.

- [`2026-11-03-human-beta-review.md`](2026-11-03-human-beta-review.md): the human beta cell, half reviewed by the
  owner on 2026-11-03. Four overnight decisions still to put to him; do not merge or deploy until he says so. Read with
  [`2026-11-03-human-beta.md`](2026-11-03-human-beta.md), whose review status it supersedes.
- [`2026-11-04-human-beta-reviewed.md`](2026-11-04-human-beta-reviewed.md): every overnight choice reviewed;
  the branch waits only for the owner's go-ahead to merge and deploy. Supersedes the review status above.
  **Done 2026-11-04:** the owner said "Yep go", then "deploy"; merged to `main` and deployed as v0.2.13. These three
  human-beta handoffs are closed.

- [`2026-11-11-kndy-kv4-leak.md`](2026-11-11-kndy-kv4-leak.md): build the Qiu et al. 2024 arcuate kisspeptin (KNDy)
  cell, then test the owner's objection to Mendonça et al. 2018: a Kv4 conductance added by dynamic clamp is partly
  open at rest, so it changes the resting leak, and that change may explain the reported firing effects. Approved by
  the owner; written by a td-resume session.
- [`2026-11-11-kndy-qiu-code.md`](2026-11-11-kndy-qiu-code.md): read with the handoff above. The Qiu 2024 reference
  code is found (Software Heritage) and read: what a port has to face, where the code and the paper's table disagree,
  an Octave oracle, and how an injected conductance and a fourth amplifier mode fit this codebase. Lists what the
  owner must decide. On branch `kndy-kv4`, which the work should continue on.

## Superseded

- [`2026-10-18-adrs-addendum.md`](2026-10-18-adrs-addendum.md): superseded the same day by
  `2026-10-18-adr-enforcement.md`, because it enforced rules by writing them into AGENTS.md.
