# Architecture decision records

One decision per file: what was decided, when, by whom, why, and what enforces it. `docs/process.md` stays the
narrative of how the work went; an ADR is the answer to "what is decided now, and is it still in force?". The owner,
2026-11-03, on whether to record a rule in AGENTS.md: "agents.md is unreliable. thses should be ADRs".

## Convention

The estate's, as armory's ADR kit defines it (armory `docs/handoffs/2026-11-03-adr-kit-decisions.md`):

- **File:** `docs/adr/YYYY-MM-DD-<4 hex>-<the decision, kebab-case>.md`. The date is the day it was written; the four
  hex characters are random, so sessions on different branches and machines never take the same ID.
- **Heading:** `# ADR YYYY-MM-DD-<hex>: <the decision as a sentence>`, the same ID as the file.
- **Status line:** `Proposed`, `Accepted, <date>`, `Deprecated, <date>` or `Superseded by <link>, <date>`.
- **Sections:** Context, Decision, Consequences, and "Enforced by": the tests, CI steps or hooks that fail if the
  decision is broken. A rule nothing enforces is listed as unenforced, not left implied.
- **Accepted ADRs do not change.** A later decision is a new ADR that supersedes the old one; the old one gets a dated
  status change and a link forward, nothing else.
- **Cite an ADR by a link to its file**, never by a bare ID.
- **Quote the owner with the question he was answering**, so a short reply never reads as a broader ruling.
- Figures live in `docs/adr/figures/`, named with their ADR's ID.

**Enforced by** `tools/adr/adr.py check`, vendored from armory's ADR kit (see armory's `tools/adr/README.md` for the
rules: file and heading IDs, status, supersession both ways, this index, links, bare citations, accepted ADRs left
unchanged, ID collisions across refs). It runs in CI (`.github/workflows/test.yml`, with full history). `.adr-kit.json`
excludes `docs/handoffs/` from the citation scan, because handoffs are dated records whose bodies are not edited. It also
excludes `tools/adr/adr.py`, whose self-test fixtures cite IDs on purpose: the checker skips only its own running
copy, so the main checkout's hook, checking a worktree, otherwise flagged the worktree's copy (2026-11-04). Armory fixed the kit at
`305696e9`, vendored here; the exclusion comes out once that copy is on `main`, where the hook runs from.
`.gitattributes` merges this index by union, so two branches that each add a row do not conflict.

**And by the kit's Claude Code hook** (`.claude/settings.json`, `adr.py hook`): before every `git commit`, `merge`,
`push`, `pull` or `rebase` in a Claude Code session it runs the check and blocks the command while anything fails,
however the command is chained. It is the only layer that sees unpushed work in sibling worktrees. Asked by the
armory session "should gaba_excites turn on the hook that blocks git commit, merge and push while an ADR check
fails?", the owner answered "Yes" (2026-11-04), and in this repository's session, "Yes wire it". Claude Code reads
the hook from the main checkout's `.claude/settings.json`, so it fires once this reaches `main`. It follows
`cd X &&`, `cd X;` and `git -C X` to the tree each git command acts on, so a commit in a worktree is checked against
that worktree; a directory it cannot open is reported as unchecked and let through. If the main checkout has no
`tools/adr/adr.py`, the hook does nothing rather than blocking every command.

**Not enforced by anything:** that a decision gets an ADR at all; that an ADR and AGENTS.md or `docs/process.md` agree
in substance; that an ADR's reasons are the ones the history shows; that a Proposed ADR is ever decided.

## Index

| ADR | Decision | Status |
|---|---|---|
| [2026-11-03-1f97](2026-11-03-1f97-the-mouse-beta-cell-lives-on-the-oscilloscope.md) | The mouse beta cell lives on the oscilloscope; the step protocol is off for it | Accepted, 2026-10-29 |
| [2026-11-03-d4b6](2026-11-03-d4b6-spike-thresholds-criterion-belongs-to-the-model.md) | Spike threshold's dV/dt criterion belongs to the model, and students can switch it | Accepted, 2026-11-03 |
| [2026-11-04-f5f6](2026-11-04-f5f6-a-moved-presets-menu-says-custom-and-keeps-its-note.md) | A step preset whose knobs have moved shows as Custom and keeps its note, marked | Accepted, 2026-11-04 |
| [2026-11-04-f9aa](2026-11-04-f9aa-conductance-knobs-switch-between-ps-and-ns-per-pf.md) | The human beta cell's conductance knobs switch between pS/pF and nS/pF | Accepted, 2026-11-04 |
| [2026-11-04-3b16](2026-11-04-3b16-rheobase-is-measured-from-a-stated-membrane-potential.md) | Rheobase states the Vm it was measured from; the human beta cell's is measured from −70 mV | Accepted, 2026-11-04 |
| [2026-11-04-8e7a](2026-11-04-8e7a-beta-cells-keep-the-psc-panel-and-the-siren-says-why.md) | The beta cells keep E_GABA −40 mV, their GABA patterns and the PSC panel; PSCs light the siren | Superseded by [2026-11-04-48f9](2026-11-04-48f9-the-islet-siren-says-the-gaba-level-is-unknown-and-the-bath-knob-is-a-dose.md), 2026-11-04 |
| [2026-11-04-48f9](2026-11-04-48f9-the-islet-siren-says-the-gaba-level-is-unknown-and-the-bath-knob-is-a-dose.md) | The islet siren says the GABA level is unknown and the bath knob is a dose | Accepted, 2026-11-04 |
