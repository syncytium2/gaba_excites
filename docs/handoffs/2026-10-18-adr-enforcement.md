# Handoff 2026-10-18: ADR hygiene, enforced by mechanism rather than by instruction

**Supersedes [`2026-10-18-adrs-addendum.md`](2026-10-18-adrs-addendum.md) entirely.** Read
[`2026-10-18-adrs.md`](2026-10-18-adrs.md) first, then this handoff, and skip the addendum. Everything in `2026-10-18-adrs.md`
still holds, except that the checks below are code, and Tony asked for them.

The addendum enforced several rules by writing them into AGENTS.md. Tony's correction, 2026-10-18: *"the general
principle of armory is that claude.md and associated docs are not enforceable or reliable."* armory's README carries the
evidence. Of the estate's coordination and verification instruments, the six that ever reached a second repository all
fire automatically: a session-start briefing, a commit-time gate. Everything that has to be invoked stayed in the
repository that wrote it. A rule in AGENTS.md is something a session has to remember to invoke.

**So the test for every hygiene rule here is: what fails, without anyone choosing to run it, when the rule is broken?**
AGENTS.md may point at the mechanisms, but it is never the mechanism.

Tony's earlier words, which still apply: *"all four a nice. go"*, approving the additions that the addendum first
carried, then *"note that the estate has tools in the armory repo. we need to enforce adr hygiene"*.

## The estate's tools

armory (`~/Developer/armory`) catalogs every tool in the estate in `MANIFEST.json`. Its `tools/dragnet.py` searches
every branch and worktree for a tool before anyone writes a replacement. On 2026-10-18 the estate had:

- **interface2's `tools/next_adr.sh`.** It allocates the next free number by scanning every local and remote branch and
  the working tree. Its `--check` mode exits 1 on a collision. interface2 wrote it after finding eight numbers each used
  by two unrelated records. Every collision had one cause: a session took "the highest number I can see, plus one", and
  it could see only its own branch.
- **bugarach's `tests/test_adr_index.py`,** the only ADR check written as a test.
- **armory's `.claude/settings.json`** shows how the estate wires a Claude Code hook: PreToolUse and PostToolUse
  commands, committed with the repository, that fire on every session's tool calls.
- **armory's `tools/mutation_check.sh`,** vendored from short-course, breaks each tool on purpose and requires its
  selftest to go red. It exists because two green selftests in armory had stayed green with the code under test
  disabled.

## Each rule, and what enforces it

Three layers fire without being invoked. Use all three, because each one sees something the others can't:

- **`npm test`**, in CI on every push and pull request. It sees one checkout, with full history (CI already clones with
  `fetch-depth: 0` for the Born stamp).
- **A CI step running `scripts/next_adr.sh --check`.** The full clone carries every pushed branch, so it sees collisions
  between branches.
- **A Claude Code PreToolUse hook** in `.claude/settings.json`, on Bash calls that run `git commit`, `git merge` or
  `git push` and touch `docs/adr/`. It runs `scripts/next_adr.sh --check --no-fetch` and blocks the call on a collision.
  It is the only layer that sees **unpushed** branches in sibling worktrees, which are where this repository's parallel
  sessions work. Don't use a git hook: `core.hooksPath` is local configuration, and nothing makes a fresh clone set it.

| Rule | Enforced by |
|---|---|
| Every ADR file is in the index, and every index row names a file | `src/adr.test.ts` |
| No two ADRs share a number on one branch | `src/adr.test.ts` |
| No two branches give one number to different ADRs | the CI step (pushed branches), and the hook (local branches) |
| Filename is `NNNN-kebab-case.md`, and the heading carries the same number | `src/adr.test.ts` |
| Status is `Proposed`, `Accepted`, `Deprecated` or `Superseded by ADR-NNNN`, with a date | `src/adr.test.ts` |
| Supersession is reciprocal: `Superseded by` names an existing ADR that says `Supersedes` back, and the reverse | `src/adr.test.ts` |
| Relative links in ADRs, and links to `docs/adr/` from anywhere in the repository, resolve | `src/adr.test.ts` |
| An ADR is cited by its linked title, never as a bare `ADR-NNNN` outside a link to its file | `src/adr.test.ts`, scanning `docs/`, `AGENTS.md`, `README.md` and `src/` comments |
| An accepted ADR's body changes only in its Status line and in dated amendment notes | `src/adr.test.ts`, comparing against the version that first carried `Accepted`, via git |
| Numbers are allocated at commit time, max + 1, never reusing a gap | `scripts/next_adr.sh`, vendored from interface2; the collision checks catch a number taken any other way |
| Every check can fail | fixtures (below) |

- **Vendor `next_adr.sh` as interface2 wrote it.** Change only its folder, which is hardcoded as `decisions/`, to
  `docs/adr/`. Put a `vendored from syncytium2/interface2 @ <sha>` line in its header and state the one deviation, as
  armory's copy of `mutation_check.sh` does. That stamp is how armory tells a deliberate copy from a reinvention.
- **Give every check a fixture that breaks it.** Keep small fixture ADR folders under `src/adr.fixtures/`, one per rule,
  each violating exactly that rule, and assert that the check rejects each one. A check that has never been seen to fail
  is a claim, not a check. Give `next_adr.sh` the same treatment: a test that builds a throwaway repository with two
  branches sharing a number, and requires `--check` to exit 1.
- **If the immutability check can't be made reliable, say so and ask Tony.** Don't ship a check that passes because it
  never ran. In particular, it must fail loudly, not skip, on a shallow clone.

## What nothing here enforces, said plainly

These stay as instructions, and the ADR README should list them as unenforced, so that nobody mistakes them for checked
rules:

- **That a decision gets an ADR at all.** No mechanism can tell that a decision was made in conversation. The closest is
  the review at merge time.
- **That AGENTS.md and an ADR agree in substance.** The tests check that links resolve, not that the words match.
- **That an ADR's reasons are the log's reasons**, not better-sounding ones. That needs a reader: offer Tony a
  murderboard pass, as `2026-10-18-adrs.md` says.

## Order of work

Get the framework onto main before any backfilled ADR: the ADR README, the adoption ADR, `scripts/next_adr.sh`, the
hook, the CI step, `src/adr.test.ts` and its fixtures. Until the hook and the CI step are on main, they protect nothing,
and the channel-editor session may start numbering ADRs of its own.

## The adoption ADR comes first

Put an ADR ahead of the decisions from 2026-09-21: `0001`, adopting ADRs for this repository. Its consequences are the
table above, including the unenforced list. Its context: decisions live only as narrative in `docs/process.md` and as
rules in AGENTS.md. Neither answers "what is decided now, and is it still in force?", and neither is enforced. **Ask
Tony for his words asking for ADRs,** for its status line. No session has recorded them. Number the extracted decisions
after it, in the order they were decided.

## Show supersession with the leak

The log records two decisions about the Cell panel. From 2026-09-21 ("Mistakes caught, and how"), Rin was the control,
and the leak was solved by bisection so that the Rin measured at rest matched the slider. From 2026-09-23 ("the leak is
the control, and Rin is measured"), gL in nS is the control, Rin is measured, and nothing but the slider moves gL. Write
them as two ADRs, the first `Superseded by` the second. They are the repository's clearest case of one decision replacing
another, and they give the reciprocity check a real pair. Quote the log's reason for the change: a leak re-solved to hold
Rin would hide the change in Rin that a channel edit is meant to show.

## Coordination

- **You own:** `docs/adr/`, `scripts/next_adr.sh`, `src/adr.test.ts`, `src/adr.fixtures/`, the ADR hook, and its entry
  in `.claude/settings.json`.
- **You share:** `.github/workflows/test.yml`, where you add one step. You also add one pointer line to AGENTS.md, and
  one entry at the bottom of `docs/process.md`.
- **Do not change armory or interface2 from this session.** Once two repositories carry `next_adr.sh`, armory is where it
  should become canonical. Tell Tony.
- **Worktrees, always:** `git worktree add ../gaba_excites-worktrees/<slug> -b <slug>`. Never `git add -A`. In the main
  checkout, the untracked `docs/first draft explainer.docx` must not be committed: this repository is public.
- **No deploy is needed.** Ask Tony before pushing.
