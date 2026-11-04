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

**Not yet enforced.** The checks above come with armory's kit, which is not built yet. Until it is vendored here,
nothing fails when an ADR breaks this convention. What each ADR's "Enforced by" names is enforced today.

## Index

| ADR | Decision | Status |
|---|---|---|
| [2026-11-03-1f97](2026-11-03-1f97-the-mouse-beta-cell-lives-on-the-oscilloscope.md) | The mouse beta cell lives on the oscilloscope; the step protocol is off for it | Accepted, 2026-10-29 |
| [2026-11-03-d4b6](2026-11-03-d4b6-spike-thresholds-criterion-belongs-to-the-model.md) | Spike threshold's dV/dt criterion belongs to the model, and students can switch it | Accepted, 2026-11-03 |
