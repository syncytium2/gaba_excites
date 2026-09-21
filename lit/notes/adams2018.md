# Adams et al. 2018 — transcription of the GnRH model

Adams C, Stroberg W, DeFazio RA, Schnell S, Moenter SM (2018) *J Neurosci*
38:1249–1263. doi:10.1523/JNEUROSCI.2988-17.2017 · PMC5792479.

This is everything `src/core/models.ts` takes from the paper, and how it was
read. No code for the model is public, so the paper is the only source.

## How the paper was read (2026-09-21)

- **Text and tables** came from the PubMed Central HTML (the PMC full-text API
  returned the abstract only). The tables arrived flattened into one line each;
  the column assignments below were reconstructed by counting cells against
  the headers, and every row had exactly the expected number of cells.
- **Equations** are images in PMC. All 25 (`FD1`–`FD25`) were downloaded and
  read; they are transcribed below.
- **Validation targets**: Fig. 7F was downloaded and read by eye.

## Equations (numbering as in the paper)

```
(1)  Cm dV/dt = −(I_NaF + I_NaP + I_A + I_K + I_HVA + I_LVA + I_S + I_h + I_KCa + I_L) + I_app
(3)  I_NaP = g m h (V − E_Na)
(4)  I_A   = g m (f_A h1 + (1 − f_A) h2)(V − E_K)               f_A = 0.8
(5)  I_K   = g m⁴ (V − E_K)
(6)  I_HVA = g m (f_HVA h1 + (1 − f_HVA) h2)(V − E_Ca)           f_HVA = 0.2
(7)  I_LVA = g m² h (V − E_Ca)
(8)  I_S   = g m (V − E_Ca)
(9)  I_h   = g (f_h h1 + (1 − f_h) h2)(V − E_h)                  f_h = 0.384
(11–12) dx/dt = (x∞(V) − x)/τ_x(V)
(13) x∞ = 1 / (1 + exp((V − Vh)/k))
(14) τ = e / (exp((a + V)/b) + exp((c + V)/d)) + f               for h_NaP, m_A, m_K, m_LVA
(15) τ = c · exp(−((V − a)/b)²)                                   for h1_h, h2_h
(16) I_NaF = g O³ (V − E_Na)
(17) dC/dt = r3(V) I + β(V) O − (α(V) + r4) C
(18) dO/dt = r2 I + α(V) C − (β(V) + r1) O
(19) I = 1 − C − O
(20) rate = a / (1 + exp((V + b)/c))                             for α, β, r3
(21) I_KCa = g Ca² / (K² + Ca²) (V − E_K)                        K = 1.0 µM
(22) dCa/dt = f (−α I_Ca − k_p Ca² / (K_p² + Ca²))
     f = 0.0025, α = 0.00185 µM/(pA·ms), k_p = 0.265 µM/ms, K_p = 1.2 µM
(23) I_Ca = I_LVA + I_HVA + I_S
(24) I_L = g_L (V − E_L)
```

Cm = 20 pF. I_app = −6 pA ("set to −6 pA to hold the cell at −70 mV").

## Table 1 — reversal potentials and conductances

The app uses the **Step 2 (negative feedback)** column.

| Current | E (mV) | Step 1 g_vc (nS) | Step 2 g_negFB (nS) |
|---|---:|---:|---:|
| I_NaF | 54 | — | 758 |
| I_NaP | 54 | — | 0.39 |
| I_A | −101 | 70.2 | 313 |
| I_K | −101 | 57 | 57 |
| I_LVA | 82.5 | 0.0679 | 0.0679 |
| I_HVA | 82.5 | 7.31 | 5.16 |
| I_S | 82.5 | — | 0.18 |
| I_h | −40 | — | 1 |
| I_KCa | −101 | — | 1.18 |
| I_L | −65 | — | 1 |
| I_A V½ inactivation (mV) | | −60 | **−69.8** |

## Table 2 — gates

Fourteen columns: NaP m, NaP h, A m, A h1, A h2, K m, LVA m, LVA h, HVA m,
HVA h1, HVA h2, S m, h h1, h h2.

| Gate | Vh (mV) | k (mV) | τ (ms) | a | b | c | d | e | f |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|
| NaP m | −41.5 | −3.0 | 0.4 | | | | | | |
| NaP h | −47.4 | 8.2 | Eq. 14 | 67.3 | −27.5 | 67.3 | 27.5 | 574.5 | 62.6 |
| A m | −29.4 | −6.64 | Eq. 14 | −2.91 | 25.6 | 65.3 | −10.6 | 1 | 0.0527 |
| A h1 | −60 (→ −69.8, Table 1) | 4.26 | 7.67 | | | | | | |
| A h2 | −60 (→ −69.8) | 4.26 | 100 | | | | | | |
| K m | −19.7 | −12.3 | Eq. 14 | 23.8 | 18 | 23.8 | −18 | 10.6 | 0 |
| LVA m | −51.4 | −4.07 | Eq. 14 | 31.3 | 10.1 | 31.3 | −10.1 | 109 | 0.0391 |
| LVA h | −80.1 | 5.5 | 250 | | | | | | |
| HVA m | −11 | −7 | 0.816 | | | | | | |
| HVA h1 | −36.6 | 14.6 | 53.4 | | | | | | |
| HVA h2 | −36.6 | 14.6 | 728 | | | | | | |
| S m | −45 | −12 | 1500 | | | | | | |
| h h1 | −77.4 | 9.2 | Eq. 15 | −89.8 | 11.6 | 35.8 | 7.6 | | |
| h h2 | −77.4 | 9.2 | Eq. 15 | −82.6 | 25.7 | 370.9 | 54.1 | | |

## Table 3 — Markov I_NaF

| | α(V) | β(V) | r1 | r2 | r3(V) | r4 |
|---|---:|---:|---:|---:|---:|---:|
| rate (ms⁻¹) | Eq. 20 | Eq. 20 | 1.0 | 0.2 | Eq. 20 | 0.05 |
| a (ms⁻¹) | 55 | 60 | | | 30 | |
| b (mV) | 6.4 | 32 | | | 77.5 | |
| c (mV) | −15.9 | 10 | | | 12 | |

g_NaF = 758 nS.

## The one ambiguity

Table 2 gives a fourth constant, d, for both I_h gates (7.6 and 54.1 ms), but
the printed Eq. 15 has only a, b and c. It is read as an additive floor,
τ = c·exp(−((V − a)/b)²) + d. Measured both ways: spike counts identical,
and the trough of a −30 pA step differs by 0.4 mV.

## What the port is checked against

- Rest: I_app = −6 pA holds the cell at −70 mV. **Port: −70.09 mV.**
- Fig. 7F (negative-feedback model): spikes during 500 ms steps of 0, 6, 12,
  18, 24, 30 pA read 0, 0, 0, 1, 4, 6. **Port: 0, 0, 0, 1, 4, 6.**

Both matched on the first run, before anything could have been tuned to them.
`src/core/gnrh.test.ts` holds them.
