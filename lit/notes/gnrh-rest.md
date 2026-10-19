# The GnRH neuron's resting potential: what the papers measured

Collected 2026-10-19 to choose the resting potential the GABA opening screen runs at. The owner chose about −60 mV
(see `docs/process.md`). Nothing in the app uses these numbers yet.

## The answer depends on the method

| Vm at rest | method | junction potential | n, animals | source | checked how |
|---|---|---|---|---|---|
| −72.7 ± 2.3 mV | on-cell (K⁺-channel reversal in the patch) | — | 18 | DeFazio et al. 2002, Table 2 | summarizing web fetch of the publisher's page; **check against the PDF** |
| −50.7 ± 1.7 mV | gramicidin perforated patch, current clamp | Fig. 2 legend: "corrected" | not stated in the sentence | DeFazio et al. 2002, Results | summarizing web fetch; **check against the PDF** |
| −69 ± 2 mV, the potential the current steps started from | whole-cell, chosen to match their on-cell value | corrected online, −14.2 mV | — | Adams et al. 2018, Results | open full text, word for word |
| −59.4 ± 1.0 (♂, 39), −55.5 ± 1.5 (diestrus, 11), −59.3 ± 1.2 (proestrus, 14), −55.6 ± 2.5 (estrus, 13), −58.8 ± 1.1 (OVX, 11) mV | gramicidin perforated patch | "nulled before giga-seal formation" | as listed | Han & Herbison 2008, Results | open full text, word for word |
| −55 ± 1 mV | gramicidin perforated patch | not corrected, ~−2 mV | 188, ♂ and ♀ | Liu, Lee & Herbison 2008, Methods | open full text, word for word |
| "between −65 and −50 mV" (interspike potential); on-cell "~−75 mV" | review of whole-cell, perforated patch and on-cell | — | — | Moenter 2010, review | open full text, word for word |

## Quotes

DeFazio, Heger, Ojeda & Moenter 2002, *Mol Endocrinol* 16:2872, doi:10.1210/me.2002-0163. Read through a web tool
that summarizes and truncates quotes to 125 characters, so these are fragments:

> This was positive relative to the resting potential (−50.7 ± 1.7 mV, from current-clamp measurements)

Table 2 is titled "Absolute Membrane Potentials (Vm) Calculated From On-Cell Measures at Rest and After Brief GABA
Application". GnRH neurons (n = 18): Vm at rest −72.7 ± 2.3 mV, after GABA −56.5 ± 1.6 mV. On the on-cell method, the
Methods say the absolute potentials "were on average more hyperpolarized than measurements in whole-cell or gramicidin
methods", and offer Donnan potentials in those configurations as a possible reason.

Adams et al. 2018, *J Neurosci* 38:1249, doi:10.1523/JNEUROSCI.2988-17.2017:

> Current injections were initiated from a mean membrane potential of −69 ± 2 mV, near the value determined in the
> above experiments.

> All potentials reported were corrected online for liquid junction potential of −14.2 mV

Han & Herbison 2008, *Endocrinology* 149:1129, doi:10.1210/en.2007-1241:

> Under perforated-patch, resting membrane potentials (RMP; mV) were -59.4±1.0 (males, N=39), -55.5±1.5 (diestrous
> females, N=11), -59.3±1.2 (proestrous females, N=14), -55.6±2.5 (estrous females, N=13) and -58.8±1.1 (OVX females,
> N=11).

Liu, Lee & Herbison 2008, *Endocrinology* 149:4605, doi:10.1210/en.2008-0321:

> The 188 GnRH neurons included in this report had an average resting membrane potential (RMP) of -55±1mV and Rin of
> 1478±35MOhms.

> RMPs were the potentials recorded in current clamp without applying any holding current and were not corrected for
> the liquid junction potentials of ~-2 mV.

Moenter 2010, *Brain Res* 1364:10, doi:10.1016/j.brainres.2010.09.066:

> The interspike potential of the majority of GnRH neurons is between −65 and −50 mV recorded in either whole-cell or
> perforated-patch configuration, with embryonic and isolated GnRH neurons tending to be more towards the depolarized
> end of that range.

> Measurements made using a non-invasive method suggested a more hyperpolarized membrane potential of ~−75 mV.

## What the model does with it

The GnRH model rests at −67.5 mV with no current, and at −70 mV on Adams' −6 pA. A holding current of +8 pA puts it at
−60.3 mV, at the edge of firing (+8.5 pA fires on its own). Measured with `node scripts/fi.ts` on 2026-10-19; not yet
pinned by a test.

## Not checked

Whole-cell values from other labs (Sim et al. 2001; Spergel et al. 1999; Chu et al. 2006–2012, whose −13 mV junction
potential was left uncorrected) and the range in Constantin, Moenter & Piet 2022 came from a search agent and were not
read here. Suter et al. 2000 and Kato et al. 2003 have no open full text.
