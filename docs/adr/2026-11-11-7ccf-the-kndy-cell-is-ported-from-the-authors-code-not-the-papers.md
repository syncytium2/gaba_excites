# ADR 2026-11-11-7ccf: The KNDy cell is ported from the authors code not the papers table and stays out of the app

Status: Accepted, 2026-11-11

## Context

The arcuate kisspeptin (KNDy) cell of Qiu et al. 2024 (*eLife* 13:RP96691) exists twice: as the authors' MATLAB
code, archived at Software Heritage with no license file, and as the paper's Appendix 1—table 1. The handoff
[`2026-11-11-kndy-qiu-code.md`](../handoffs/2026-11-11-kndy-qiu-code.md) found about ten differences between
them and proposed porting the code. Asked "Whether the code or the paper's table is the source of truth (the
handoff proposes the code), and whether to write to the authors about the differences and the license", the
owner answered on 2026-11-11: "do both and compare. this will run in private mode until we know how well ti
works. this maybe an example for the latch bio take home test. it might not make it to the actual public page."

Both were built and run, in the authors' own right-hand side (MATLAB R2025b, `tools/kndy_oracle.m`) and in the
port. The comparison is in [`lit/notes/qiu2024.md`](../../lit/notes/qiu2024.md): fifteen values and one equation
differ. The code's cell rests at −66.36 mV with 389 MΩ and fires at 7 to 13 Hz with 10 to 20 pA. The table's
values give a cell that fires one spike at most, and with the paper's leak equation as written it sits near
−55 mV with about 21 MΩ and never fires.

## Decision

- **The owner's:** both are built and compared, and the cell is private. `src/core/kndy.ts` exports it, and it
  is in neither `MODELS` nor `MODEL_LIST` (`src/core/models.ts`), so the app does not offer it.
- **The owner's, after the comparison:** asked "Is the code's cell 'the KNDy cell' from here on? I assumed yes,
  since the table's cell does not fire", he answered "yes, but note the table cell failure". The cell called "the
  KNDy cell" is the code's (`KNDY_OVX`, `KNDY_E2`), and wherever it is described the table's failure is stated:
  its `validation` line, `lit/notes/qiu2024.md`, and its entry in the literature list.
  The table's cells (`QIU_TABLE`, `QIU_TABLE_E2`, `QIU_AS_WRITTEN`) are kept only so the comparison can be re-run.
  The reason is the comparison itself: only the code's cell fires.
- None of the authors' MATLAB is committed. The oracle's runner fetches it by its Software Heritage ID; the
  numbers it produces are committed (`src/core/oracle/matlab_kndy.json`).
- GIRK is left out: it is exactly zero without an agonist in code and paper alike.
- The cell's `validation` line says what was checked: against the authors' code, not against recordings.

## Consequences

- Whether the archived parameters are the ones behind the paper's figures is not known; the script's own comment
  gives resting potentials (−68.92, −70.92 mV) that the archived parameters do not reproduce (−66.36, −69.98).
  Writing to the authors about that and about a license is still the owner's call.
- The cell has no delayed rectifier and its action potentials are about 8 ms wide. Anything built on it inherits that.
- `ModelId` has no `kndy` member, so the cell's id is a cast (`KNDY_ID`). Making the cell public means adding it
  to the registry, giving it presets and a threshold criterion (2 V/s is set provisionally), and removing the cast.
- The branch is pushed (the owner, 2026-11-11: "commit and push the branch to preserve the work for other machines"),
  so "private" means the app and the website do not offer the cell, not that the repository hides it.
- The literature list is public and now names Qiu 2024 and its code, each marked "Not offered in the app", as
  the experiment-only DeFazio & Moenter 2021 entry is.

## Enforced by

- `src/core/kndy.test.ts`: the port rests where the code rests in all six cells (to 0.001 mV), has the code's
  input resistance (0.5%), and reproduces every spike of the OVX step family from 5 to 60 pA (counts exact, times
  within 6 ms over 5 s at dt = 0.01 ms, within 1 ms at 0.0025); the table's cells fire as the table's values do
  in the code; and the cell is in neither `MODELS` nor `MODEL_LIST`.
- Not enforced by anything: that no MATLAB is ever committed, and that the cell stays private once someone
  decides to register it.
