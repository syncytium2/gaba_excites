# DeFazio et al. 2000 — the chloride calibration, and what "activity" hid

DeFazio RA, Keros S, Quick MW, Hablitz JJ (2000) Potassium-coupled chloride
cotransport controls intracellular chloride in rat neocortical pyramidal
neurons. *J Neurosci* 20:8069–8076. doi:10.1523/JNEUROSCI.20-21-08069.2000.

Read from the PDF the owner supplied, 2026-09-28 (kept in `lit/pdf/`, not
committed). The computation is in `tools/experiments/chloride_calibration.ts`;
`src/experiments.test.ts` pins its numbers. Nothing in the app uses this.

## Why this is here

The owner's recollection: "we could never get internal chloride estimates
(outside out patches) close to expected without decreasing the extracellular
chloride concentration. at the time we mistakenly thought we were correcting
for activity. but that's wrong I think." The owner is right. Scaling one side
of the Nernst ratio by an activity coefficient is not an activity correction.
A correct one scales both sides, and at similar ionic strength (both solutions
near 150 mM) it cancels. Scaling one side is a constant shift of every
reversal potential. With γ = 0.76 at 30 °C the shift is 26.1 mV × ln(1/0.76)
= 7.2 mV.

## What the paper says (verbatim)

- Nernst, one side scaled: "[Cl−]in = [Cl−]out exp(−Vrev F/RT). [Cl−]o was set
  to the extracellular Cl− concentration, corrected for activity (Robinson and
  Stokes, 1959) (e.g., in 3.5 mM [K+]o, 139.6 mM × 76% = 106.1 mM)."
- Junction potentials: "Liquid junction potentials for all solutions were
  measured, and all voltages reported are corrected values (Neher, 1992)." No
  value, sign or method is given. The owner recalls that they were measured by
  hand over about a week. The values were never published.
- Pipette: 135 K-gluconate, 5 EGTA, 10 HEPES, 2 MgATP, 0.2 NaGTP, 0.2 CaCl2;
  KCl substituted for K-gluconate "such that the final added Cl− concentration
  equaled 1, 20, or 40 mM"; [K⁺] 150 mM; pH 7.3; 300 mOsm with sucrose.
- Bath: 125 NaCl, 3.5 KCl, 26 NaHCO3, 10 glucose, 2.5 CaCl2, 1.3 MgCl2; 30 °C.
- GABA puffer: 125 NaCl, 3.5 KCl, 20 HEPES, 10 glucose, pH 7.3.
- Patches: 1 mM added Cl⁻ gave V_rev −102.8 ± 2.0 mV and [Cl⁻] 2.06 ± 0.16 mM
  (n = 4). The Results paragraph gives 2.10 ± 0.16 mM (n = 4) for the same
  patches. 20 mM gave 21.69 ± 0.72 mM (n = 7). The 40 mM patches are only in
  Fig. 2A.
- The paper's own reading of the 1 mM excess: gluconate permeability,
  P_glu/P_Cl ≈ 0.008. It also warns that isethionate and methylsulfate salts
  gave reversals "indicative of 10–15 mM internal Cl−" with none added.

## Bookkeeping slips (small)

- **Uncounted chloride.** The pipette's 0.2 mM CaCl2 adds 0.4 mM Cl⁻, so the
  "1 mM" pipette held 1.4 mM and the "20 mM" held 20.4.
- **The bath chloride.** The recipe gives 125 + 3.5 + 5 + 2.6 = 136.1 mM, not
  139.6, which may be 3.5 mM KCl counted twice. The difference is 0.66 mV. The
  Fig. 2A theory line uses 103.4 mM (= 136.1 × 0.76). The "expected −121 mV
  for 1 mM" in the text implies about 102.7 mM. So three different outside
  values appear in one paper.
- **The puffer.** An outside-out patch sits in the puffer stream. Its Cl⁻
  (128.5 mM) is 1.5 mV lower than the bath's, which shifts the reversal
  positive, the same direction as the other errors. The puffer also has no
  HCO3⁻.

## Refit

Everything below is at 30 °C, with the recipe's bath (136.1 mM), every source
of Cl⁻ counted, and activities equal on both sides. The 40 mM patches are only
in Fig. 2A. Reading off the figure's axes gives −26.8 mV; the same reading
gives −102.6 and −41.1 for the published values (−102.8 and −41.5).

| added Cl⁻ | V_rev | Nernst expected | gap | against the paper's theory line |
|---|---|---|---|---|
| 1 mM (1.4) | −103.0 mV | −119.6 mV | +16.6 mV | 18.2 mV above |
| 20 mM (20.4) | −41.5 mV | −49.6 mV | +8.1 mV | 1.4 mV above |
| 40 mM (40.4) | −26.8 mV (Fig. 2A) | −31.7 mV | +4.9 mV | 2.0 mV **below** |

The owner pointed out that the 40 mM patches sit under the theory line. So the
paper's own correction over-corrects at 40 mM and under-corrects at 1 mM. The
error shrinks as pipette Cl⁻ rises, so no single scaling of [Cl⁻]o could have
fitted all three points.

The table below uses weighted least squares with the SEMs, and ±1 mV as the
reading error for 40 mM:

| explanation | parameters | χ² (1 d.f.) | residuals, 1 / 20 / 40 mM |
|---|---|---|---|
| one-sided activity (the paper's) | γ = 0.76 | — | +18.2 / +1.4 / −2.0 mV |
| constant offset alone | 7.7 mV | 27.7 | +8.9 / +0.4 / −2.7 mV |
| constant offset + gluconate | 6.1 mV, P_glu/P_Cl 0.0054 | 4.1 | −0.4 / +1.3 / −1.5 mV |
| fraction of each pipette's LJP + gluconate | 0.46 × LJP, P_glu/P_Cl 0.0044 | 2.1 | −0.2 / +0.8 / −1.1 mV |

- **A voltage error alone fails.** The 1 mM gap is too large for anything
  that also fits 20 and 40 mM.
- **A voltage error plus a small permeant pipette anion fits.** The anion is
  worth about 0.6–0.7 mM of Cl⁻, from gluconate (P_glu/P_Cl ≈ 0.005) or from
  Cl⁻ contaminating the gluconate. The data cannot tell the two apart.
- **The best fit is a voltage error proportional to each pipette's own
  junction potential**: the reversals read as if only about 54% of the LJP had
  been subtracted. That is what a measurement that loses a fixed fraction
  would give, such as a bath reference whose own junction changes when the
  bath is switched. The two forms of the error differ by less than 2 mV across
  these solutions, though, so the figure cannot really choose between them.
- **The two-point fit made before the figure was read (7.5 mV + 0.0044)
  predicted −24.0 mV at 40 mM.** The figure reads −26.8, so that prediction
  missed by 2.8 mV and the three-point offset is smaller.
- **Why the fudge seemed to work:** a 6–8 mV error scales inferred [Cl⁻]i by
  0.74–0.79, and the one-sided γ scales it by 0.76. It absorbed an error that
  belongs in millivolts, and was right at about 20 mM only.

## The junction potential the solutions should have had

Henderson equation (Barry & Lynch 1991) with JPCalc mobilities (Barry 1994),
bath relative to pipette, so that true Vm = V_read − LJP:

| pipette | LJP |
|---|---|
| 1 mM KCl | +16.3 mV |
| 20 mM KCl | +14.4 mV |
| 40 mM KCl | +12.5 mV |

As checks, the same code gives +4.4 mV for 150 KCl against 150 NaCl and
+16.4 mV for 140 K-gluconate against the saline, the familiar values. The
fitted error, about 6 mV or 46% of each LJP, is roughly half the expected
correction. So the measured junction potentials were probably low by about
that much, or only part of the correction was applied.

This is not proven. One common way a by-hand measurement (Neher's method)
comes out low is the bath reference: unless it is a 3 M KCl bridge, its own
junction changes when the bath is switched from pipette solution to saline,
and that change subtracts from the reading. Rough Henderson estimates put it
at about 2 mV with 3 M KCl and about 5 mV with 1 M. How the bridge was made is
not recorded.

## What it does and does not change

The paper's conclusions (Cl⁻ accumulation at low pipette Cl⁻, and extrusion
by K⁺–Cl⁻ cotransport at high pipette Cl⁻) rest on comparing patches with
whole cells at the same pipette solution. A shared offset cancels in that
comparison. The absolute [Cl⁻]i values happen to be close, because 0.76 ≈
0.75. If part of the error is anion permeation, the low-Cl⁻ values are off in
a way that no single factor fixes.

## Next

This paper is the worked example for a planned teaching page: activity,
junction potentials and permeant anions in the GHK equation (`docs/roadmap.md`).
