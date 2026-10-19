# Handoff 2026-10-19: the GABA opening and the step-by-step explainer

**Written by the session that evaluated the other sessions and took the owner's explainer upgrades (2026-10-18 to
19).** It adds to [`2026-10-18-explainer.md`](2026-10-18-explainer.md) and changes its order of work; read both.
Nothing here is built. Only the literature record and this note are committed.

## What the owner asked for

Pasted on 2026-10-18 as upgrades to integrate:

- **Open with the puzzle:** GABA is "the inhibitory transmitter", so why does it excite GnRH neurons? That is his own
  first-author paper (DeFazio, Heger, Ojeda & Moenter 2002, doi:10.1210/me.2002-0163, already in `lit/sources.json`).
  Leave its citation count off the page.
- **Build up in steps, each with a "try this" button that sets the sliders:** a resting cell; inject current to find
  threshold; change the leak; change the capacitance; add synaptic input; slide E_GABA past rest and watch inhibition
  turn into excitation.
- **Define each term where it first appears** (rheobase, leak, reversal potential, and so on).
- **Accessible in the formal sense:** keyboard-operable controls, readable contrast, a text description of each plot,
  and no meaning carried by color alone.

## What the owner decided

- **The opening runs in oscilloscope mode, on the GnRH cell, with GABA PSPs,** where some PSPs fire a spike.
- **Resting potential about −60 mV,** set with a holding current. Why, and the literature, are in `docs/process.md`
  (2026-10-19) and `lit/notes/gnrh-rest.md`.

## Measurements so far (`node scripts/fi.ts`, not yet pinned)

GnRH cell, GABA at the measured event (1 nS peak, 10 ms decay, instantaneous rise, E_GABA −36.5 mV), Poisson timing,
10 s runs, seeds 1, 2, 3:

| Holding current (Vm) | GABA events/s | E_GABA | spikes in 10 s |
|---|---|---|---|
| −6 pA (−70 mV) | 2 to 50 | −36.5 | 0 at every rate |
| +7 pA (about −61.5 mV) | 5 | −36.5 | 2, 2, 4 |
| +8 pA (−60.3 mV) | 2 | −36.5 | 4, 2, 5 |
| +8 pA | 5 | −36.5 | 14, 12, 13 |
| +8 pA | 5 | −50 | 4, 3, 5 |
| +8 pA | 5 | −60 | 0 (PSPs vanish) |
| +8 pA | 5 | −70 | 0 (PSPs hyperpolarize) |

+8.5 pA fires on its own, so −60 mV is the edge of firing; Rin climbs from 386 MΩ at −70 mV to about 2.6 GΩ there.
Pick the opening's settings with that in mind, then pin them in a test in the style of `src/core/gaba.test.ts`, as
a GnRH-only scope preset. The CLI reads a negative `--ihold` as a flag; omit it to get the default −6 pA.

## Advice given, not yet answered

- **A step that drops the cell to −70 mV,** the on-cell value, where the same synapse stops firing it. It turns the
  disagreement between recording methods into a lesson.
- **The capacitance step is really a cell-size step.** The Cm slider scales every channel density with it
  (`src/core/cell.ts`), so the text should say "make the cell bigger", not "change the capacitance".
- **The steps as a panel inside the app,** whose buttons set the controls directly, before the static `/explainer`
  page and URL deep links. Not yet decided.
- **Who writes the step text and definitions.** The explainer handoff's rule stands: the text starts from the
  owner's. The offer was to draft it in one file, marked as a draft, for his yes or no.
- **Accessibility, seen so far:** native range sliders work from the keyboard but get an accessible name only when
  their label is plain text (`src/ui/NumField.tsx`); the Old school knobs were not checked; no plot has a text
  description; contrast and color-only meaning were not audited. Enforce what is fixed through
  `scripts/screenshot.mjs` or a test.

## State of the other work, 2026-10-19

- The lab notebook (report branch) is merged and deployed. The na-shift branch is merged.
- The explainer plan (`docs/explainer-plan.md`, on the explainer branch) is proposed and unapproved.
- No ADR framework is on main yet.
- The 2002 PDF is on the owner's literature want-list; the publisher is not on the fetch tool's open-access list.
