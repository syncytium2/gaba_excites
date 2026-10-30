# Hodgkin & Huxley 1952: the squid giant axon

Hodgkin AL, Huxley AF (1952) J Physiol 117:500–544. doi:10.1113/jphysiol.1952.sp004764. Open access (PMC1392413).

**Status, 2026-10-29: transcribed from NEURON's built-in `hh.mod`, not yet checked line by line against the paper.**
Automated fetches of the PDF were refused (PubMed Central, Europe PMC), and it is on the owner's want-list. Until it is
read, nothing in the app quotes a page, figure, table or equation number from it. NEURON's `hh.mod` is the 1952 model
in the modern sign convention, and the port is held to it (src/core/hh.test.ts), so the check here is the code oracle.

## What the port takes (src/core/channels.ts, src/core/models.ts)

Modern convention: V in mV, rest −65 mV, depolarization positive. Rates in 1/ms at 6.3 °C, each multiplied by
φ = 3^((T − 6.3)/10). `vtrap(x, y) = x / (exp(x/y) − 1)`, with its limit y at x = 0.

| gate | α(V) | β(V) |
|---|---|---|
| m | 0.1 · vtrap(−(V + 40), 10) | 4 · exp(−(V + 65)/18) |
| h | 0.07 · exp(−(V + 65)/20) | 1 / (exp(−(V + 35)/10) + 1) |
| n | 0.01 · vtrap(−(V + 55), 10) | 0.125 · exp(−(V + 65)/80) |

I_Na = gNa m³h (V − E_Na), I_K = gK n⁴ (V − E_K), I_L = gL (V − E_L).

| value | here | note |
|---|---|---|
| C_m | 1 µF/cm² | |
| gNa, gK, gL | 120, 36, 0.3 mS/cm² | |
| E_Na, E_K | +50, −77 mV | the paper's values relative to rest, shifted by −65 mV |
| E_L | −54.387 mV | the paper's value, shifted; puts rest at −65 mV. NEURON's default `el_hh` rounds it to −54.3 |
| T | 6.3 °C | default of the app's temperature knob |

The app's patch is 10 000 µm² (100 pF), so 100 pA = 1 µA/cm² and densities in mS/cm² × 100 = nS.

## To check once the PDF is in hand

- each rate function and constant above against the paper's own equations, after the sign change;
- E_L: the value relative to rest that gives −54.387;
- numbers the app could quote, with page and figure: the threshold of the computed membrane action potential, the
  refractory period, anode break excitation, and the temperature dependence.
