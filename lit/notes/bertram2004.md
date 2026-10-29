# Bertram et al. 2004 — transcription of the mouse beta-cell model (the Dual Oscillator Model)

Bertram R, Satin L, Zhang M, Smolen P, Sherman A (2004) Calcium and glycolysis
mediate multiple bursting modes in pancreatic islets. *Biophys J* 87:3074–3087.
doi:10.1529/biophysj.104.049262 · PMID 15347584 · PMC1304779.

This is everything `src/core/beta.ts` and `bertramPool` in `src/core/pools.ts`
take from the paper, and how it was read. The model is the one later papers
call the Dual Oscillator Model (DOM 1.0); the Integrated Oscillator Model
builds on it.

## How the paper was read (2026-10-29)

- **Text and Table 1** from the PubMed Central HTML (the PMC full-text API
  returned the abstract only; Europe PMC's XML service returned an error; the
  PDF link served a browser check instead of the PDF).
- **Equations** are images in PMC: 24 display images (`M1`–`M27`, Eqs. 1–24)
  and 8 inline ones (`M8`, `M22`, `M26`, `M28`–`M32`). All were downloaded and
  read by eye; they are transcribed below.
- **The authors' errata** (`errata.pdf` on the model's page,
  artielbm.github.io/Models/DOM1.0) were read and applied.
- **The authors' XPP code** (same page; `glycophan.ode` and one file per
  figure) was read for one piece the paper does not print, the PFK rate law,
  and used afterwards to check the port. None of it is in this repository.
  Arthur Sherman approved use of the group's Chen 2008 model in an educational
  web app on 2026-10-29; this model was not named in that exchange (see
  `docs/process.md`).

## Equations (numbering as in the paper)

```
(1)  Cm dV/dt = −(I_K + I_Ca + I_K(Ca) + I_K(ATP))
(2)  I_K      = ḡ_K n (V − V_K)
(3)  I_Ca     = ḡ_Ca m∞(V) (V − V_Ca)
(4)  I_K(Ca)  = g_K(Ca) (V − V_K)
(5)  I_K(ATP) = g_K(ATP) (V − V_K)
(6)  g_K(Ca)  = ḡ_K(Ca) Ca² / (K_D² + Ca²)
     g_K(ATP) = ḡ_K(ATP) o∞(ADP, ATP)
(7)  dn/dt    = (n∞(V) − n)/τn
(8)  n∞(V)    = 1 / (1 + exp(−(16 + V)/5))
(9)  m∞(V)    = 1 / (1 + exp(−(20 + V)/12))          activation is instantaneous
(10) o∞ = [0.08(1 + 2 MgADP⁻/17 µM) + 0.89 (MgADP⁻/17 µM)²]
          / [(1 + MgADP⁻/17 µM)² (1 + ADP³⁻/26 µM + ATP⁴⁻/1 µM)]
(11) MgADP⁻ = 0.165 ADP,  ADP³⁻ = 0.135 ADP,  ATP⁴⁻ = 0.05 ATP
(12) dCa/dt   = f_cyt (J_mem + J_er)
(13) J_mem    = −(α I_Ca + k_PMCA Ca)
(14) J_er     = J_leak − J_SERCA
(15) J_leak   = p_leak (Ca_er − Ca)
(16) J_SERCA  = k_SERCA Ca
(17) dCa_er/dt = −f_er (V_cyt/V_er) J_er
(18) dG6P/dt  = λ (R_GK − R_PFK)                     λ is κ, per the errata
(19) dFBP/dt  = λ (R_PFK − ½ R_GPDH)
(20) F6P      = 0.3 G6P
     R_GPDH   = 0.2 √(FBP / 1 µM) µM s⁻¹             (inline, M22 and M28)
(21) AMP + ADP + ATP = A_tot
(22) AMP      = ADP² / ATP
(23) dADP/dt  = (ATP − ADP exp[(r + γ)(1 − Ca/r1)]) / τa
(24) γ        = v_γ R_GPDH / (k_γ + R_GPDH)
```

Solving (21)–(22) for ATP, which the paper leaves to the reader:
ATP = ½[(A_tot − ADP) + √((A_tot − ADP)² − 4 ADP²)], the root that gives ATP = A_tot at ADP = 0.

## Table 1, with the errata

| parameter | value | note |
|---|---|---|
| p_leak | 0.0002 ms⁻¹ | |
| V_cyt/V_er | 31 | |
| k_SERCA | 0.4 ms⁻¹ | |
| V_K | −75 mV | |
| V_Ca | 25 mV | |
| ḡ_K | 2700 pS | |
| ḡ_Ca | 1000 pS | |
| C_m | 5300 fF | |
| v_m, s_m | −20 mV, 12 mV | as in Eq. 9 |
| v_n, s_n | −16 mV, 5 mV | as in Eq. 8 |
| τn | 20 ms | |
| K_D | 0.5 µM | |
| ḡ_K(Ca) | 600 pS | Table 1 prints g_K(Ca); the errata give ḡ |
| α | 4.5 × 10⁻⁶ fA⁻¹ µM ms⁻¹ | 4.5 × 10⁻³ pA⁻¹ µM ms⁻¹ here |
| k_PMCA | 0.2 ms⁻¹ | |
| f_cyt, f_er | 0.01, 0.01 | |
| ḡ_K(ATP) | 25 nS | Table 1 prints g_K(ATP); the errata give ḡ |
| A_tot | 3000 µM | |
| v_γ | 2.2 | |
| k_γ | 10 µM s⁻¹ | |
| R_GK | 0.2 s⁻¹ | the paper's units; it enters Eq. 18 beside R_PFK in µM s⁻¹ |
| K_dd, K_td, K_tt | 17, 26, 1 µM | as in Eq. 10 |
| τa | 300 000 ms | "τa = 5 min" in the text |
| r, r1 | 1, 0.35 µM | |
| V_max | **2** | Table 1 prints "1 µM s⁻¹"; the errata say "V_max = 2.0 ms⁻¹ omitted"; the code uses 2. Taken as 2 |
| λ (PFK) | 0.06 | the PFK rate's λ, not Eq. 18's |
| κ | **0.005** | omitted from Table 1 (errata); the text gives it as "λ = 0.005 in Eqs. 18 and 19" |
| K1, K2, K3, K4 | 30, 1, 50 000, 1000 µM | K3 and K4 divide F6P² and ATP², so they act as µM² |
| K5, f53 | — | "not used and should be removed" (errata) |
| f13, f23, f41, f42, f43 | 0.02, 0.2, 20, 20, 20 | |

## The PFK rate law (from the code; the paper cites Smolen 1995, Eqs. 3 and 12)

The paper says only that "Eqs. 3 and 12 of Smolen (1995) are used to describe
the PFK reaction". Smolen (1995) *J Theor Biol* 174:137 was not read. The law
below is what the authors' `glycophan.ode` computes, re-expressed:

- Four sites, each empty or bound: AMP (term AMP/K1), FBP (FBP/K2), F6P
  (F6P²/K3), ATP (ATP²/K4). Sixteen states.
- A state's weight is the product of its bound terms, divided by one factor
  per bound pair: f13 for AMP with F6P, f23 for FBP with F6P, f41 for AMP with
  ATP, f42 for FBP with ATP, f43 for F6P with ATP; AMP with FBP has none. (The
  code names them famp, ffbp, fmt, fbt, fatp, and says which is which.)
- Only F6P-bound states turn over. The state with AMP, FBP and F6P bound and
  ATP not bound turns over at V_max; every other F6P-bound state at λ·V_max.
- R_PFK = V_max (λ·Σ_other F6P-bound + w_AMP,FBP,F6P) / Σ_all.

## What the paper reports, and what the tests pin

| figure | conditions (legend) | what the paper says | test |
|---|---|---|---|
| 2 | glycolysis alone, ATP 2000 µM of 3000 | oscillates at R_GK = 0.2; "settles into a steady state after a single transient oscillation" at 0.4, from F6P 81, FBP 5 | `beta.test.ts` |
| 3 | R_GK = 0.4, Table 1 | bursting with glycolysis stationary; glycolytic variables oscillate "much more rapid (period ≈ 30 s)" than the ≈ 5 min glycolytic period | `beta.test.ts` |
| 5 | R_GK = 0.2, ḡ_K(ATP) 25 nS, ḡ_K(Ca) 600 pS | compound bursting; "periodic pulses of FBP … with a period of ≈5 min" | `beta-bursts.test.ts` |
| 6 | R_GK = 0.2, 23 nS, 600 pS | accordion bursting: "bursting never shuts off", plateau fraction slowly modulated | `beta-bursts.test.ts` |
| 7 | R_GK = 0.2, 27 nS, 100 pS | glycolytic bursting: "a single long burst"; FBP pulses "at 5-min intervals" | `beta-glycolytic.test.ts` |
| 8 | R_GK = 0.2, 30 nS, 100 pS | slow subthreshold oscillations in V and Ca, no spikes | `beta-glycolytic.test.ts` |
| 9 | from Figs. 3 and 8 | ADP in phase with Ca during Ca²⁺-driven bursting (B); out of phase during glycolytic oscillations (A) | both |
| 10 | glycolysis alone, R_GK = 0.3 | bistable: F6P 75, FBP 8 "comes to rest at the equilibrium F6P ≈ 64 μM, FBP ≈ 9.1 μM"; F6P 78 "oscillates with a period of ∼5 min" | `beta.test.ts` |

The whole-cell runs start from the authors' figure files' initial values
(`Fig3.ode` … `Fig8.ode`), which the paper does not print.

## Results of the port (2026-10-29)

| check | paper | port |
|---|---|---|
| Fig. 2, R_GK 0.2 | ≈ 5 min | 5.8 min |
| Fig. 10, rest | F6P ≈ 64, FBP ≈ 9.1 | 63.7, 9.0 (FBP's steady state is exactly (2·R_GK/0.2)² = 9) |
| Fig. 10, oscillation | ∼5 min | 5.2 min |
| Fig. 3 burst period | ≈ 30 s | 32.4 s at dt 0.01 ms |
| Fig. 5 FBP period | ≈ 5 min | 5.05 min; episodes of 4 bursts 32 s apart, then 206 s silent |
| Fig. 6 | never shuts off | burst intervals swing 18–30 s with each FBP pulse |
| Fig. 7 | one long burst per pulse | one per 5.6 min |
| Fig. 8 | no spikes | none; V −66 to −64 mV |

**Code-derived check.** The authors' equations, transcribed literally from
`glycophan.ode` into a scratch Python script (not committed) and integrated
by scipy's LSODA (rtol = atol = 1e-9) from `Fig3.ode`'s start, give 345
spikes in 6 min and burst periods of 30.3–31.6 s. The port at dt = 0.01 ms
gives 340 spikes and 32.4 s; at 0.005 ms 32.7 s, at 0.0025 ms 31.7 s (the
period moves in whole spikes per burst, so not monotonically), at 0.05 ms
34.7 s. State at 60 s from the same start: LSODA V −60.61, Ca 0.0785, ADP
789.64, Ca_er 172.46, G6P 186.91, FBP 16.021; port (0.01 ms) −61.05, 0.0786,
790.28, 174.53, 186.81, 16.076.

## Where the port departs from the paper

- **I_Ca's activation is a gate with τ = 1e-9 ms**, set to m∞ at the new V
  each step, because a channel's open fraction in this solver does not see V.
  The conductance therefore lags V by one step (0.01 ms).
- **Units**: pS, fA, fF become nS, pA, pF; α × 1000 accordingly.
- **No leak**: the model has none; the app's leak control starts at 0 nS.
