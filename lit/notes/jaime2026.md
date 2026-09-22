# Jaime, DeFazio & Moenter 2026 — GABA PSCs in GnRH neurons

Jaime J, DeFazio RA, Moenter SM (2026) *J Neuroendocrinol* 38:e70144.
doi:10.1111/jne.70144 · PMC12881841.

## What the app takes

The GnRH cell's default GABA input (`GNRH.gabaKinetics` in `src/core/models.ts`):

| | value | from |
|---|---|---|
| decay τ | **10 ms** | 9.9 ± 0.25 ms, adult females (n = 12 cells, VEH and PNA pooled; no PNA effect); 7.4 ± 0.13 ms at 3 weeks |
| peak conductance | **1 nS** | adult isolated PSCs ≈ −30 pA at −70 mV (Fig. 2B, read by eye); with E_GABA −36.5 mV the driving force is ≈ 33.5 mV, so ≈ 0.9 nS. The paper calls 1–2 nS physiological, and 5–10 nS "moderately above" |
| rise | **instantaneous** | not reported for the recorded PSCs; their dynamic clamp used an instantaneous rise and a single-exponential decay |
| E_GABA | −36.5 mV | the same value they used, from DeFazio et al. 2002 (see `defazio2002.md`) |

How the PSCs were measured: isolated events (≥ 50 ms from neighbours),
averaged per cell (5–40 events), with a single-exponential fit from 80% to 20%
of the peak. Whole-cell at −70 mV and 30–31 °C, with a K-gluconate pipette
holding 20 mM Cl⁻, "based on the native intracellular chloride
concentrations in GnRH neurons determined using gramicidin‐perforated‐patch
recordings".

## The caveat (the owner's, 2026-09-22)

The decay time constant depends on chloride, and **intracellular chloride in
GnRH neurons was never actually measured**. What was measured, by gramicidin
perforated patch, is E_GABA. The pipette chloride is inferred from it, so the
10 ms decay was recorded at an assumed chloride. In the owner's words, "it is
the best we have." Treat these defaults as the best available, not ground
truth. Measurements made with high-chloride pipettes report longer decays.

## Current versus voltage

The conductance decays with τ ≈ 10 ms. The PSP it produces lasts much longer:
their dynamic-clamp PSPs take roughly 25–40 ms to decay (Fig. 4), because the
membrane (τm = Rin·Cm) integrates the charge. With GABA ticked, the app shows
both — the conductance trace and the voltage.
