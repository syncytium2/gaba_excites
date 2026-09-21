# DeFazio & Moenter 2021 — slow K⁺ inactivation, tried on the Adams 2018 GnRH model

DeFazio RA, Moenter SM (2021) *eNeuro* 8(4):ENEURO.0126-21.2021.
doi:10.1523/ENEURO.0126-21.2021 · PMC8266219.

The owner characterized a slowly inactivating K⁺ current in GnRH neurons,
struggled to get Caroline Adams's model running in QuB, and never got to ask
what that inactivation would do to it. Asked on 2026-09-21. The Adams et al.
2018 model's I_K is g·m⁴ with no inactivation, so the question has a clean form.

## What was read (Fig. 3, by eye; text quoted in sources.json)

- activation V½ ≈ −10 mV, slope ≈ 4.5 (Fig. 3B, D)
- inactivation V½ ≈ −30 mV, slope ≈ −4.7 (Fig. 3C, E), measured after 10 s
  conditioning, while inactivation is "incomplete even after 51.29 s at
  −30 mV", so the steady-state V½ is likely more negative than −30
- at −30 mV: ~0.55 of max by 16 s, ~0.3 by 64 s → single exponential τ ≈ 17 s
  with a ~25% floor; recovery at −80 mV τ ≈ 2–4 s (Fig. 3G)

## The experiment (`tools/experiments/slow_ik_inactivation.ts`)

The slow gate was added to Adams I_K: g·m⁴·(0.25 + 0.75·h_s). τ ran from 3 s
at −80 mV to 17 s at −30 mV. The published cell was then driven with 30 s
steps at 24 pA, and V½ was swept.

| h_s V½ | h∞ at −70 mV | mean h∞ while firing | spikes in 30 s | first s → last s |
|---|---:|---:|---:|---|
| (published: no inactivation) | — | — | 339 | 10 → 11 |
| −30 mV (the paper's) | 1.00 | 0.97 | 339 | 10 → 11 |
| −40 | 1.00 | 0.92 | 340 | 10 → 11 |
| −50 | 0.99 | 0.71 | 344 | 10 → 11 |
| −55 | 0.96 | 0.53 | 351 | 10 → 12 |
| −60 | 0.89 | 0.32 | 363 | 10 → 12 |
| −65 | 0.74 | 0.16 | 387 | 11 → 13 |

The Fig. 7F counts (0/0/0/1/4/6) are unchanged at −30 and −40 mV.

## Reading

Two reasons it does nothing at the measured V½:

1. **The gate never closes.** While firing at 24 pA the cell spends 94% of its
   time below −45 mV, with a mean Vm of −55 mV. An inactivation centred at
   −30 mV with a 4.7 mV slope barely registers: the mean h∞ is 0.97. Spikes
   cross −30 mV only for about a millisecond each, which is nothing against a
   τ of 17 s.
2. **Even when it closes, this I_K has little leverage.** With V½ pushed to
   −65 mV the gate is 84% shut on average, yet firing rises only 14%. In the
   Adams model, I_A (313 nS) sets firing rate, and I_K (57 nS) mostly
   repolarizes the spike.

## Where it could matter (untested)

Anywhere the cell sits depolarized for many seconds without spiking back to
−60: plateaus, kisspeptin-driven depolarization, or sustained GABA tone. With
E_GABA at −36.5 mV, tonic GABA pulls Vm toward exactly the range where h_s
inactivates. There, slow I_K inactivation would be a memory of tens of
seconds, making the cell more excitable after a depolarized episode. That is
a conditioning-then-test protocol, not a step family, and it has not been run.
