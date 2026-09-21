# Pospischil et al. 2008 — the pyramidal cell, via ModelDB 123623

The parameters come from the model's code, not from the paper's text: the
ModelDB cell is the one with runnable mechanisms to check against, and it
differs from some in-vitro fits described in the paper.

Source: github.com/ModelDBRepository/123623 at commit `8dfc13f`.

## `sPY_template`

```
diam = 96, L = 96          "so that area is about 29000 um2"   → π·96² = 28 953 µm² → 289.53 pF
cm = 1
insert pas   e_pas = -70,  g_pas = 0.0001          "Rin = 34 Meg"
insert hh2   ek = -100, ena = 50, vtraub_hh2 = -55
             gnabar_hh2 = 0.05, gkbar_hh2 = 0.005
insert im    taumax_im = 1000, gkbar_im = 7e-5
celsius = 36 (demo_PY_RS.hoc)
```

The template's "Rin = 34 Meg" is the leak alone. With the channels open at
rest included, the input resistance at rest (−70.57 mV) is **32.13 MΩ**, which
is the app's Rin default.

## `HH_traub.mod` (hh2), with v2 = v − vtraub

```
αm = 0.32·vtrap(13 − v2, 4)     βm = 0.28·vtrap(v2 − 40, 5)
αh = 0.128·exp((17 − v2)/18)    βh = 4/(1 + exp((40 − v2)/5))
αn = 0.032·vtrap(15 − v2, 5)    βn = 0.5·exp((10 − v2)/40)
vtrap(x, y) = x/(exp(x/y) − 1)
tadj = 3^((celsius − 36)/10) = 1 at 36 °C
states advanced exactly at fixed v:  x ← x + (1 − exp(−dt/τ))(x∞ − x)
```

## `IM_cortex.mod`

```
m∞ = 1/(1 + exp(−(v + 35)/10))
τ  = taumax / (3.3·exp((v + 35)/20) + exp(−(v + 35)/20))
tadj = 2.3^((celsius − 36)/10) = 1 at 36 °C
```

## The oracle

`tools/neuron_oracle.py` compiles these two .mod files in NEURON 9.0.2, runs
the published cell (3 s settle, 800 ms steps, dt = 0.01 ms, implicit Euler),
and writes `src/core/oracle/neuron_rs.json`. Spike counts match exactly at
500–1500 pA; every spike time agrees within 0.20 ms.
