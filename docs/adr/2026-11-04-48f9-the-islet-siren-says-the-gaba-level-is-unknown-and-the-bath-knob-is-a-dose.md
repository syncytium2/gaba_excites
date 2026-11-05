# ADR 2026-11-04-48f9: The islet siren says the GABA level is unknown and the bath knob is a dose

Status: Accepted, 2026-11-04

Supersedes: [ADR 2026-11-04-8e7a](2026-11-04-8e7a-beta-cells-keep-the-psc-panel-and-the-siren-says-why.md)

## Context

[ADR 2026-11-04-8e7a](2026-11-04-8e7a-beta-cells-keep-the-psc-panel-and-the-siren-says-why.md) kept the PSC panel
on both beta cells and had the siren explain why their PSCs are not beta-cell physiology. Asked to "review the islet
gaba followup", a session re-read the four abstracts on PubMed and found the siren's note wrong in two places and
too strong in a third:

- It said GABA sits "at an ambient 100–1000 nM". Korol et al. 2018's abstract says the opposite: "The effective,
  physiological GABA concentration range within human islets is unknown." 100–1000 nM is where the receptors open
  most often, not a measured islet level.
- It called the bath GABA knob "that steady signal". The knob is calibrated at 10 µM, 100 µM and 1 mM (Riz et al.
  2014, from Braun et al. 2010), and its smallest step is 5 pS/pF: 10 to 10,000 times Korol's range, in a model
  with no desensitization, which Korol reports at saturating GABA.
- It said "Beta cells receive no GABA synapses". No source here says that; it was read from their silence.

Shown these, with the proposal to reword the note, update the to-do and record it here, the owner answered "go".

## Decision

Everything in the superseded ADR stands (E_GABA −40 mV, the three GABA patterns, the PSC panel on both beta cells,
the siren lighting for GABA or glutamate PSCs, the high-priority to-do) except the note's wording, which now:

- says no GABA synapses onto beta cells are described in these sources;
- gives both release routes, Braun's granule exocytosis and Menegaz's VRAC efflux, as the papers' own findings;
- says the islet's GABA level is unknown, and gives 100–1000 nM as where the receptors open most;
- on the human cell, calls the bath knob GABA applied at 10 µM to 1 mM, as in Braun's experiments, not the islet's
  own signal, and says this model does not desensitize.

## Consequences

- The app has no setting for GABA at the islet's own level. Whether it should, and from what numbers, is in the
  to-do (`docs/roadmap.md`, "GABA in the islet"), with the disagreement between Braun's granule release and
  Menegaz's missing vesicular transporter.
- The sources are still read from their abstracts only.

## Enforced by

- `src/core/extremes.test.ts`: on both beta cells the note says the islet's GABA level is unknown and does not
  claim an ambient level, that beta cells receive no GABA synapses, or that the bath knob is the steady signal; on
  the human cell it calls the bath knob a dose of 10 µM to 1 mM. The superseded ADR's tests still hold.
- `scripts/screenshot.mjs`: the siren lights with the note when GABA PSCs are on and clears when they go off.
