# ADR 2026-11-03-d4b6: Spike threshold's dV/dt criterion belongs to the model, and students can switch it

Status: Accepted, 2026-11-03

## Context

The app measures spike threshold as the membrane potential where dV/dt first reaches a criterion on the upstroke,
walking back from the spike-counting crossing. Until 2026-11-03 every cell used 20 V/s (`THRESH_DVDT` in
`src/core/analysis.ts`). The criterion is a convention and it moves the number: on the GnRH cell, threshold is about
13 mV lower at 1 V/s than at 20 V/s. The notebook's report already tabulated 1, 2, 10 and 20 V/s for that reason
(`src/core/threshold.ts`, 2026-10-18 in `docs/process.md`).

The human beta cell (Riz, Braun & Pedersen 2014) forced the question. Its spikes rise at no more than about 7 V/s, so
at 20 V/s they have no threshold at all; the readout had been falling back to the −30 mV counting level and calling it
threshold. The overnight build of 2026-11-02 showed "—" instead. Reviewing that, the owner was asked whether to
approve "—" for a spike that never reaches 20 V/s. He answered:

> "in our lab threshold is different for different neurons. i think we should implement this as a teaching moment.
> gnrh 1mV/ms, aruate kndy 2mV/ms. etc"

Asked which criterion the cortical cells and the squid axon should use (they had 20 V/s, sourced only as "this app's
readout"), he chose "10 mV/ms (Kress 2010)". Asked how far the teaching moment should go, he chose "Also a criterion
switch". Asked which criterion the human beta cell should use, he replied "show me an action potential and the
derivative in one plot and i'll measure it". Shown that plot (below), he wrote:

> "by eye, it sure looks to me that 0.5V/s is appropriate (the point of no return)."

![The human beta cell's spike: V and dV/dt against time, and the phase plot, with the point where dV/dt reaches
0.5 V/s marked at −43.5 mV](figures/2026-11-03-d4b6-betahuman-spike-phase-plot.png)

*One spike of the human beta cell, published parameters, no current, dt 0.01 ms. The marked point is where dV/dt
first reaches 0.5 V/s: −43.5 mV. The fastest rise is 7.0 V/s, at −17.2 mV. Remake it with
`node scripts/apview.ts --model betahuman --pin 0.5 --before 120 --after 80 --png <file>`; without `--png`, `--out
<file>` writes the interactive page he measured on.*

## Decision

Each model carries its own threshold criterion (`ModelDef.thresholdDvdt`), one of the cited criteria in
`src/core/threshold.ts` `CRITERIA`:

| Cell | Criterion | Source |
|---|---|---|
| Pyramidal, fast-spiking, LTS, squid axon | 10 V/s | Kress et al. 2010, Hippocampus 20:558 |
| GnRH neuron | 1 V/s | DeFazio & Moenter 2002, Mol Endocrinol 16:2255 (attributed on the owner's word; the PDF has not been read here) |
| Human beta cell | 0.5 V/s | the owner's reading of this model's phase plot, 2026-11-03; not a published value |
| Mouse beta cell | none | the app never measures its threshold: it lives on the oscilloscope ([ADR 2026-11-03-1f97](2026-11-03-1f97-the-mouse-beta-cell-lives-on-the-oscilloscope.md)) |

- Sweeps carry their model's criterion, and every measurement of threshold and half-width uses it by default: the
  readout, the per-sweep analysis, the report's headline threshold.
- **The switch.** The phase plot's caption offers 0.5, 1, 2, 10 and 20 V/s, opening on the cell's own. Choosing
  another re-measures the run at that criterion: the dashed line, the threshold dot and the readout all move. The
  choice holds for the model it was made on.
- A spike that never reaches the chosen criterion has no threshold or half-width ("—"), never the counting level.
- The readout's tooltip and the text under the phase plot name the criterion and its source.
- The report keeps tabulating every criterion, now including 0.5 V/s, and reads each by its value, so a notebook
  saved before 0.5 V/s existed keeps its columns. A run records the criterion its headline threshold used.

## Consequences

- **Quoted numbers moved.** Cortical thresholds are about 2 mV lower at 10 than at 20 V/s, and their half-widths a
  little wider: fast-spiking 0.57 against pyramidal 0.71 ms (were 0.56 and 0.70), in `src/core/protocol.ts` and
  `public/methods.html`. The GnRH cell's threshold readout drops by about 13 mV. The human beta cell gets a threshold,
  about −45 mV at rheobase and −43.5 mV on its spontaneous spikes.
- **0.5 V/s rests on the owner's judgment, not a paper.** The methods page says so. If a published beta-cell
  criterion turns up, it supersedes this row with a new ADR.
- **2 V/s stays attributed to AVPV kisspeptin neurons** (Wang, DeFazio & Moenter 2016). The owner recalled arcuate
  KNDy neurons; the same recollection was checked against that paper on 2026-10-18 and its cells are AVPV. He will
  find the KNDy paper; when he does, it is added as a source.
- **The low criteria can catch the charging ramp** after a step's onset rather than the spike. The report already
  marks that "ramp"; the readout does not. At each model's own criterion, the rheobase thresholds checked on
  2026-11-03 (pyramidal, fast-spiking, LTS, squid, GnRH, human beta) were on the spike, not the ramp; not every preset
  was checked.
- `THRESH_DVDT` (20 V/s) remains only as the fallback for a trace that carries no model, such as a hand-built test
  trace.

## Enforced by

- `src/core/threshold-criterion.test.ts`: every model's criterion is one of `CRITERIA` (or none only for an
  oscilloscope-only cell), every criterion has a source, the values are the owner's, a sweep carries its model's
  criterion, and asking for another moves GnRH's threshold.
- `src/core/human-app.test.ts`: the human beta cell's spikes have a threshold near −43.5 mV and a 6.1 ms half-width
  at 0.5 V/s, and none at 20 V/s.
- `src/core/fs.test.ts`: the 0.57 and 0.71 ms half-widths the presets and methods page quote.
- `src/core/report.test.ts`: a record without 0.5 V/s keeps each threshold in its own column (fails with the old
  read-by-position code).
- `scripts/screenshot.mjs`: on the human cell the switch opens on 0.5 V/s with a threshold in the −40s, and at 20 V/s
  the readout shows "—".
- `src/apview.test.ts`: the measuring page still reproduces the figure's numbers and fetches nothing.
- `ModelDef.thresholdDvdt` is required, so a new model without one fails `npx tsc -b`.

Unenforced: that the methods page's paragraph (`#threshold`) and llms.txt describe the criteria the code uses.
