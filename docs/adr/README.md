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
excludes `docs/handoffs/` from the citation scan, because handoffs are dated records whose bodies are not edited.
`.gitattributes` merges this index by union, so two branches that each add a row do not conflict.

**And by the kit's Claude Code hook** (`.claude/settings.json`, `adr.py hook`): before every `git commit`, `merge`,
`push`, `pull` or `rebase` in a Claude Code session it runs the check and blocks the command while anything fails,
however the command is chained. It is the only layer that sees unpushed work in sibling worktrees. Asked by the
armory session "should gaba_excites turn on the hook that blocks git commit, merge and push while an ADR check
fails?", the owner answered "Yes" (2026-11-04), and in this repository's session, "Yes wire it". Claude Code reads
the hook from the main checkout's `.claude/settings.json`, so it fires once this reaches `main`. It checks the
tree of the command's working directory, so a `cd <worktree> && git commit` sent from the main checkout is checked
against the main checkout.

**Not enforced by anything:** that a decision gets an ADR at all; that an ADR and AGENTS.md or `docs/process.md` agree
in substance; that an ADR's reasons are the ones the history shows; that a Proposed ADR is ever decided.

## Index

| ADR | Decision | Status |
|---|---|---|
| [2026-11-03-1f97](2026-11-03-1f97-the-mouse-beta-cell-lives-on-the-oscilloscope.md) | The mouse beta cell lives on the oscilloscope; the step protocol is off for it | Accepted, 2026-10-29 |
| [2026-11-03-d4b6](2026-11-03-d4b6-spike-thresholds-criterion-belongs-to-the-model.md) | Spike threshold's dV/dt criterion belongs to the model, and students can switch it | Accepted, 2026-11-03 |
