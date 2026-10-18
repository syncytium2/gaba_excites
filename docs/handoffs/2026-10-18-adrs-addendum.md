# Handoff 2026-10-18: additions to the ADR handoff, and ADR hygiene, enforced

**Adds to [`2026-10-18-adrs.md`](2026-10-18-adrs.md); read that one first.** Everything in it still holds, except where
this handoff says otherwise: the hygiene checks below are code, and Tony asked for them. His words: *"all four a nice.
go"*, approving the first four additions, then *"note that the estate has tools in the armory repo. we need to enforce
adr hygiene"* (both 2026-10-18).

## ADR hygiene, enforced

Tony wants hygiene **enforced**, not just described. Each rule below gets a check that fails. Use the estate's tools
first. armory (`~/Developer/armory`) catalogs tools across every repository in `MANIFEST.json`, and `tools/dragnet.py`
searches for one before anyone writes a replacement. On 2026-10-18 the catalog had one ADR tool, and bugarach had the
one ADR test:

- **interface2's `tools/next_adr.sh`** allocates the next free number by scanning every local and remote branch and the
  working tree. Its `--check` mode exits 1 on a collision. It was written after interface2 found eight numbers each used
  by two unrelated records. Every collision had one cause: a session took "the highest number I can see, plus one", and
  it could see only its own branch. `ls docs/adr/` can't tell you whether a number is free. Only a scan across every ref
  can.
- **bugarach's `tests/test_adr_index.py`** checks the index.

What to build:

- **`scripts/next_adr.sh`:** vendor interface2's script. Change only its folder, which is hardcoded as `decisions/`, to
  `docs/adr/`. Credit the source repository and commit in its header. Every new ADR takes its number from this script,
  **at commit time, not when writing starts**. AGENTS.md says so.
- **`src/adr.test.ts`:** a vitest version of bugarach's index test, extended. Read files the way `src/lit.test.ts` does,
  resolving `root` from `import.meta.url`. It fails when:
  - an ADR file is missing from the index in `docs/adr/README.md`, or an index row names no file;
  - two ADRs share a number;
  - a filename doesn't match `NNNN-kebab-case.md`, or its heading doesn't carry the same number;
  - a status isn't `Proposed`, `Accepted`, `Deprecated` or `Superseded by ADR-NNNN`, with a date;
  - a supersession isn't reciprocal. `Superseded by` must name an ADR that exists and says `Supersedes` back, and the
    reverse;
  - a relative link in an ADR, or a link to `docs/adr/` from AGENTS.md or `docs/process.md`, doesn't resolve.
- **Immutability:** once accepted, an ADR's body changes only in its Status line or in dated amendment notes. Check this
  against git: compare each accepted ADR with the version that first carried `Accepted`. This one needs history, so run it
  where the clone is full. AGENTS.md already forbids building from a shallow clone. If it can't be made reliable, say so
  and ask Tony before dropping it; don't leave a check that passes because it never ran.
- **Before merging to main,** run `scripts/next_adr.sh --check`. A collision between two unmerged branches is invisible to
  any test that sees one checkout. Put the command in AGENTS.md's Commands list.
- **Citing an ADR:** link it and name it by its title, as house style does for everything else. Never cite a bare
  "ADR-0007". interface2 made the same rule after its collisions: a bare number can point at two records.
- **Offer the vendored script back to armory.** If a second repository now carries `next_adr.sh`, armory is where it
  should live. Tell Tony; don't change armory or interface2 from this session.

## Merge the framework first

Put `docs/adr/README.md`, the adoption ADR, the script and the test on main **before** any backfilled ADR. Then the
channel-editor session can see the convention and take numbers from the script. A number belongs to whichever branch
reaches main first, and the other branch renumbers when it rebases.

## The adoption ADR comes first

The first handoff's table starts with the decisions from 2026-09-21. Put an ADR ahead of them, `0001`, that adopts ADRs
for this repository, with the hygiene rules above as its consequences. Its context: decisions live only as narrative in
`docs/process.md` and as rules in AGENTS.md, and neither answers "what is decided now, and is it still in force?".
**Ask Tony for his words asking for ADRs,** for its status line. No session has recorded them. Number the extracted
decisions after it, in the order they were decided.

## Show supersession with the leak

The first handoff's table has the 2026-09-23 decision: the leak (gL, nS) is the control, and Rin is measured. The log
also records the decision it replaced. From 2026-09-21 ("Mistakes caught, and how"), Rin was the Cell-panel control, and
the leak was solved by bisection so that the Rin measured at rest matched the slider. Write that as its own ADR, with
status `Superseded by ADR-NNNN`, and write the 2026-09-23 decision as the ADR that supersedes it. It is the repository's
clearest case of one decision replacing another. It also gives the reciprocity check a real pair to test against. Quote
the log's reason for the change: a leak re-solved to hold Rin would hide the change in Rin that a channel edit is meant
to show.
