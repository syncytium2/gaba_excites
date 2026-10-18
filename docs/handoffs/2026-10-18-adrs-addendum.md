# Handoff 2026-10-18: four additions to the ADR handoff

**Adds to [`2026-10-18-adrs.md`](2026-10-18-adrs.md); read that one first.** Everything in it still holds, except the one
place this handoff says otherwise: the index test below is code, and Tony approved it. Tony read the four additions and
answered: *"all four a nice. go"* (2026-10-18).

## The index test

Add **`src/adr.test.ts`**, a vitest version of bugarach's `tests/test_adr_index.py`. It makes three checks:

- every `docs/adr/NNNN-*.md` file is in the index table in `docs/adr/README.md`;
- every index row names a file that exists;
- no two ADRs share a number.

Why: in bugarach, the ADR that went missing from the index was the last one written before the habit lapsed for 25
days. An ADR that the index doesn't list is one that nobody finds.

Read files the way `src/lit.test.ts` does: resolve `root` from `import.meta.url`. This test is the only code the ADR
session writes. The "Docs only" rule in the first handoff still covers everything else.

## Merge the framework first

Put `docs/adr/README.md`, the adoption ADR and the index test on main **before** any backfilled ADR. Then the
channel-editor session can see the convention and number its own ADRs. Until the framework is on main, two branches can
both claim a number. A number belongs to whichever branch reaches main first, and the other branch renumbers when it
rebases. The index test catches a duplicate that slips through.

## The adoption ADR comes first

The first handoff's table starts with the decisions from 2026-09-21. Put an ADR ahead of them, `0001`, that adopts ADRs
for this repository. Its context: decisions live only as narrative in `docs/process.md` and as rules in AGENTS.md, and
neither answers "what is decided now, and is it still in force?". **Ask Tony for his words asking for ADRs,** for its
status line. No session has recorded them. Number the extracted decisions after it, in the order they were decided.

## Show supersession with the leak

The first handoff's table has the 2026-09-23 decision: the leak (gL, nS) is the control, and Rin is measured. The log
also records the decision it replaced. From 2026-09-21 ("Mistakes caught, and how"), Rin was the Cell-panel control, and
the leak was solved by bisection so that the Rin measured at rest matched the slider. Write that as its own ADR, with
status `Superseded by ADR-NNNN`, and write the 2026-09-23 decision as the ADR that supersedes it. It is the repository's
clearest case of one decision replacing another. Done this way, the first batch of ADRs shows a reader what supersession
looks like. Quote the log's reason for the change: a leak re-solved to hold Rin would hide the change in Rin that a
channel edit is meant to show.
