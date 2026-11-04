# ADR 2026-11-04-8e7a: The beta cells keep E_GABA −40 mV, their GABA patterns and the PSC panel; PSCs light the siren

Status: Superseded by [ADR 2026-11-04-48f9](2026-11-04-48f9-the-islet-siren-says-the-gaba-level-is-unknown-and-the-bath-knob-is-a-dose.md), 2026-11-04

## Context

The overnight build of 2026-11-02 gave the human beta cell (Riz, Braun & Pedersen 2014) E_GABA −40 mV, Riz's chloride
reversal (Table 1, citing Rorsman & Braun 2013), and three oscilloscope patterns from Riz's Figs. 5A and 5B, each
opening with bath GABA at 0 for the student to raise. The GABA and glutamate PSC panels kept the app's generic
neuronal barrage (3 nS events), unsourced for beta cells and, on a 10 pF cell, 300 pS/pF per event.

Asked how this should go, the owner replied: "Describe gaba inputs to beta cells. I don't know this literature. Is it
synaptic or paracrine like". The answer, from PubMed abstracts: autocrine and paracrine, from the beta cells
themselves (Braun et al. 2010), much of it non-vesicular and pulsatile through VRAC (Menegaz et al. 2019), at an
ambient 100–1000 nM (Korol et al. 2018); no GABA synapses onto beta cells are described. Offered the choice of hiding
the PSC panels on the beta cells, he answered: "Document your findings for more detailed follow up as a todo with
high priority. Keep the psc panel with a siren warning. This is exactly what we built the site for".

## Decision

- E_GABA −40 mV and the three GABA patterns stay as built.
- The PSC panels stay on both beta cells. Switching on a GABA or glutamate PSC input lights the siren in every mode,
  and its explanation says why these events are not beta-cell physiology, citing the three papers
  (`ModelDef.pscNote` in `src/core/human.ts` and `src/core/beta.ts`; `settingWarnings` in
  `src/core/extremes.ts`). The bath GABA knob is named there as the steady signal the papers describe.
- The findings and the follow-up are the first "High priority" item of `docs/roadmap.md`.

## Consequences

- The siren, until now a warning about trips measured on Vm and current, also warns about a setting. Its heading
  ("driven past what a real cell would do") fits: the cell computes an answer, but not physiology.
- The papers are cited from their abstracts only (`lit/sources.json` says so). The full texts are on the to-do.

## Enforced by

- `src/core/extremes.test.ts`: the warning shows for either PSC input on either beta cell, not when the input is off
  or at rate 0, and never for any other model; its three papers are in `lit/sources.json`.
- `scripts/screenshot.mjs`: on the human cell, switching GABA PSCs on lights the siren with the note, and switching
  them off clears it.
- `src/core/human-app.test.ts`: the patterns' numbers (unchanged).
