# Mendonça et al. 2018 and 2016: the Kv4 conductance injected by dynamic clamp

Mendonça PRF, Kyle V, Yeo S-H, Colledge WH, Robinson HPC (2018) Kv4.2 channel activity controls intrinsic firing
dynamics of arcuate kisspeptin neurons. *J Physiol* 596:885–899. doi:10.1113/JP274474 · PMID 29214635 · PMC5830417
(CC BY).

Mendonça PRF, Vargas-Caballero M, Erdélyi F, Szabó G, Paulsen O, Robinson HPC (2016) Stochastic and deterministic
dynamics of intrinsically irregular firing in cortical inhibitory interneurons. *eLife* 5:e16475.
doi:10.7554/eLife.16475 · PMID 27536875 · PMC5030087 (CC BY).

This is everything `src/core/dynclamp.ts` and `tools/experiments/kv4_leak.ts` take from the two papers, and what
they leave unsaid.

## How they were read (2026-11-11)

- **2018**: the PubMed Central full text as plain text, in which equations are flattened. The Kv4 equations were
  read there and checked against the 2016 paper's typeset Model 3; they agree.
- **2016**: the owner's PDF (`lit/pdf/mendonca2016.pdf`, gitignored), by `pdftotext -layout`, which drops this
  font's minus signs ("reversing at 70 mV" for −70 mV, "EK = 90 mV"). Signs below were read from the equations'
  structure and from the 2018 text. Figures were not read for numbers.

## The injected conductance (2018, "Artificial conductance injection"; 2016, "Model 3")

```
I_Kv4 = ḡ·m·h·(V − E_K)                       first power of m
dm/dt = (m∞ − m)/τm          dh/dt = (h∞ − h)/τh
m∞(V) = 1/(1 + exp((−30 − V)/10))           τm(V) = 0.346·exp(−V/18.272) + 2.09   ms
h∞(V) = 1/(1 + exp(0.0878·(V + 55.1)))      τh(V) = 2.1·exp(−V/21.2) + 4.627      ms
```

The kinetics were fitted to voltage-clamp steps in irregular-spiking cortical interneurons (2016) and reused in
kisspeptin neurons as "virtually identical" (2018). The 2016 paper injected three parameter sets (Models 1 and 2
in rate-constant form, Model 3 above) and pooled them; the 2018 paper gives only Model 3.

**The dose is not ḡ.** Both papers state it as "the peak transient value reached at a potential of 0 mV",
g_max0. Neither says what potential the test step starts from; the 2018 paper's pre-pulse protocol (Fig. 5D)
steps from −90 mV, and that is taken here. From −90 mV the peak of m·h at 0 mV is 0.4160 of ḡ (0.345 from
−70 mV), so ḡ = 2.40 × g_max0. `dynclamp.test.ts` pins the number.

**E_K of the injection is not stated in the 2018 paper.** The 2016 paper converts its recorded currents
"assuming E_K ≈ −90 mV" and its model has E_K = −90 mV. −90 mV is taken here (`KV4.eK`), as an assumption.

**The window.** m∞·h∞, the share of ḡ open at steady state: 1.42% at −70 mV, 1.73% at −67.4 (Mendonça's mean
rest), 2.87% at −60, 3.78% at −55, 4.65% at −50.

## Numbers used to size the experiment

- Doses: Fig. 6E of the 2018 paper runs from about −0.4 to +0.6 nS/pF (as read by the handoff; the figure was
  not opened here). Fig. 6C's example is +2.18 nS. Native Kv4: 16.2 ± 4.9 nS peak at 0 mV (n = 16), 0.48 nS/pF.
- The cells (2018 Results, mean ± SD, n = 49): input resistance 1.34 ± 0.69 GΩ, membrane time constant
  41.9 ± 18.55 ms, capacitance 33.7 ± 13.68 pF, rest −67.4 ± 8.17 mV. Passive properties from a −20 to −40 pA
  step with an exponential fit.
- Firing irregularity: "a square current step (2–10 s) sufficient to evoke firing at 7–13 Hz", then the CV of
  the interspike intervals. Recordings in gabazine, CNQX and APV, at 30–33 °C, sampled at 20 kHz through a 4 kHz
  Bessel filter, bridge balanced.

## What the authors did about input resistance

The 2016 paper ran a control in cortical interneurons (Figure 5—figure supplement 1): "an intense (2 nS) static
shunting conductance, reversing at −70 mV, near to the resting potential – effectively greatly reducing input
resistance". Spikes got smaller and the fluctuations between spikes diminished, "but irregularity is not
reduced", and they add that the artificial K⁺ conductance "also decreases input resistance" and raised
variability. So they knew the injection changes input resistance. What that control does not cover: kisspeptin
neurons (about 0.75 nS at rest against about 3 nS in those interneurons); a shunt matched to the injected
conductance; a reversal at E_K; and excitability, as against irregularity. Whether the 2018 paper repeats the
control was looked for in its text and not found. Neither paper reports the resting potential or the input
resistance with the conductance on.

## Their account of irregularity, which this simulator does not have

The 2016 model is two compartments, with Kv1, Kv3, transient and persistent Na⁺, and the transient K⁺
conductance. It fires irregularly without noise (long pauses and unstable subthreshold oscillations), and more
so with channel noise: an Ornstein–Uhlenbeck term on persistent Na⁺ and on the transient K⁺ conductance whose
variance follows the current. The simulator's membrane noise is a current of fixed variance
(`src/core/noise.ts`). The model's code is published with the paper as Source code 1 and has not been
downloaded.
