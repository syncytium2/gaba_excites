# lit — the literature behind gaba_excites

<!-- Rendered from sources.json by `node scripts/lit.ts`. Edit sources.json, not this file. -->

Every source gaba_excites takes a number, an equation or a method from, and what it took. The single source of truth: lit/README.md, lit/references.bib and public/lit.html are rendered from this file by `node scripts/lit.ts`, and src/lit.test.ts fails if they drift.

The same list is on the website at [/lit](https://gaba.tonydefazio.com/lit).

## What is here

| | |
|---|---|
| `sources.json` | every source: citation, identifiers, what was taken from it, where it is used — **the file to edit** |
| `README.md`, `references.bib` | rendered from it |
| `notes/` | transcriptions: every number taken from a source, where it came from, and any ambiguity met on the way |
| `NEEDED.md` | papers to fetch by hand into `pdf/` |
| `pdf/` | local copies of the papers — **gitignored, never committed**, even open-access ones: this repository is public, and a licence to read is not a licence to redistribute |

## Models

Where the cells come from.

### `pospischil2008`

Pospischil M, Toledo-Rodriguez M, Monier C, Piwkowska Z, Bal T, Frégnac Y, et al. (2008). Minimal Hodgkin–Huxley type models for different classes of cortical and thalamic neurons. Biol Cybern 99(4-5):427–441.

[doi:10.1007/s00422-008-0263-8](https://doi.org/10.1007/s00422-008-0263-8) · [PMID 19011929](https://pubmed.ncbi.nlm.nih.gov/19011929/) · *subscription* · models: pyramidal

**Took:** The regular-spiking pyramidal cell: its currents (Traub INa and IKd, slow IM) and the published cell they make.

**Used in:** [`src/core/channels.ts`](../src/core/channels.ts), [`src/core/models.ts`](../src/core/models.ts)

**Notes:** [`notes/pospischil2008.md`](notes/pospischil2008.md)

### `modeldb123623`

Destexhe A (2009). ModelDB 123623: minimal Hodgkin–Huxley models of cortical and thalamic neurons (NEURON code for Pospischil et al. 2008).

[modeldb.science/123623](https://modeldb.science/123623) · [code @ 8dfc13f](https://github.com/ModelDBRepository/123623/tree/8dfc13fb03c162f5ad1b5e13f94225c983391af7) · *open (code)* · models: pyramidal

**Took:** Every pyramidal-cell parameter, from sPY_template, HH_traub.mod and IM_cortex.mod — and the mechanisms themselves, run in NEURON as the oracle the port is tested against.

**Used in:** [`src/core/channels.ts`](../src/core/channels.ts), [`src/core/models.ts`](../src/core/models.ts), [`tools/neuron_oracle.py`](../tools/neuron_oracle.py), [`src/core/oracle.test.ts`](../src/core/oracle.test.ts)

**Notes:** [`notes/pospischil2008.md`](notes/pospischil2008.md)

### `adams2018`

Adams C, Stroberg W, DeFazio RA, Schnell S, Moenter SM (2018). Gonadotropin-releasing hormone (GnRH) neuron excitability is regulated by estradiol feedback and kisspeptin. J Neurosci 38(5):1249–1263.

[doi:10.1523/JNEUROSCI.2988-17.2017](https://doi.org/10.1523/JNEUROSCI.2988-17.2017) · [PMID 29263236](https://pubmed.ncbi.nlm.nih.gov/29263236/) · [PMC5792479](https://pmc.ncbi.nlm.nih.gov/articles/PMC5792479/) · *open (PubMed Central)* · models: GnRH

**Took:** The GnRH neuron: Equations 1–24, Tables 1–3 (negative-feedback parameter set), Cm = 20 pF and I_app = −6 pA, and the two published numbers the port is checked against — rest at −70 mV and the Fig. 7F spike counts.

> I app is the applied current, which was set to −6 pA to hold the cell at −70 mV.
> — Materials and Methods, Mathematical modeling

> cells were injected with current from 0 to 30 pA (500 ms, 2 pA steps)
> — Materials and Methods, Whole-cell patch-clamp

**Used in:** [`src/core/models.ts`](../src/core/models.ts), [`src/core/channels.ts`](../src/core/channels.ts), [`src/core/gnrh.test.ts`](../src/core/gnrh.test.ts)

**Notes:** [`notes/adams2018.md`](notes/adams2018.md)

## Parameters

Single values taken from measurements.

### `defazio2002`

DeFazio RA, Heger S, Ojeda SR, Moenter SM (2002). Activation of A-type γ-aminobutyric acid receptors excites gonadotropin-releasing hormone neurons. Mol Endocrinol 16(12):2872–2891.

[doi:10.1210/me.2002-0163](https://doi.org/10.1210/me.2002-0163) · [PMID 12456806](https://pubmed.ncbi.nlm.nih.gov/12456806/) · *free to read at the publisher* · models: GnRH

**Took:** The GnRH cell's default E_GABA, −36.5 mV: measured by gramicidin perforated patch, which leaves intracellular chloride undisturbed.

> E GABA measured 100 msec after GABA application was −36.5 ± 1.2 mV (n = 16 cells from 13 adult diestrous females).
> — Results; read from the publisher's full text, 2026-09-21

**Used in:** [`src/core/models.ts`](../src/core/models.ts), [`src/core/protocol.ts`](../src/core/protocol.ts)

**Notes:** [`notes/defazio2002.md`](notes/defazio2002.md)

## Methods

How the numbers are computed.

### `hines1997`

Hines ML, Carnevale NT (1997). The NEURON simulation environment. Neural Comput 9(6):1179–1209.

[doi:10.1162/neco.1997.9.6.1179](https://doi.org/10.1162/neco.1997.9.6.1179) · [PMID 9248061](https://pubmed.ncbi.nlm.nih.gov/9248061/) · *subscription* · models: pyramidal

**Took:** The simulator used as the oracle (NEURON 9.0.2), and the integration scheme copied from it: backward Euler for V, then gates at the new V.

**Used in:** [`tools/neuron_oracle.py`](../tools/neuron_oracle.py), [`src/core/simulate.ts`](../src/core/simulate.ts)

### `rush1978`

Rush S, Larsen H (1978). A practical algorithm for solving dynamic membrane equations. IEEE Trans Biomed Eng 25(4):389–392.

[doi:10.1109/TBME.1978.326270](https://doi.org/10.1109/TBME.1978.326270) · [PMID 689699](https://pubmed.ncbi.nlm.nih.gov/689699/) · *subscription* · models: pyramidal, GnRH

**Took:** The exact exponential update of each gate at fixed voltage ("Rush–Larsen").

**Used in:** [`src/core/channels.ts`](../src/core/channels.ts)

### `uhlenbeck1930`

Uhlenbeck GE, Ornstein LS (1930). On the theory of the Brownian motion. Phys Rev 36(5):823–841.

[doi:10.1103/PhysRev.36.823](https://doi.org/10.1103/PhysRev.36.823) · *subscription* · models: pyramidal, GnRH

**Took:** The Ornstein–Uhlenbeck process behind the membrane-noise current.

**Used in:** [`src/core/noise.ts`](../src/core/noise.ts)

### `colquhoun1995`

Colquhoun D, Sigworth FJ (1995). Fitting and statistical analysis of single-channel records. In: Single-Channel Recording, 2nd ed. (Sakmann B, Neher E, eds.). Plenum Press.

*book* · models: pyramidal, GnRH

**Took:** The Gaussian filter's σ = 0.1325 / fc, used to band-limit the recording noise.

**Used in:** [`src/core/noise.ts`](../src/core/noise.ts)

## Background

What the models were built on, credited but not read for any number here.

### `destexhe1998`

Destexhe A, Contreras D, Steriade M (1998). Mechanisms underlying the synchronizing action of corticothalamic feedback through inhibition of thalamic relay cells. J Neurophysiol 79(2):999–1016.

[doi:10.1152/jn.1998.79.2.999](https://doi.org/10.1152/jn.1998.79.2.999) · [PMID 9463458](https://pubmed.ncbi.nlm.nih.gov/9463458/) · *free to read at the publisher* · models: pyramidal

**Took:** Nothing directly: the thalamocortical model the RS cell was taken from, credited as the ModelDB code credits it.

### `traub1991`

Traub RD, Miles R (1991). Neuronal Networks of the Hippocampus. Cambridge University Press.

*book* · models: pyramidal

**Took:** The origin of the Na⁺ and K⁺ kinetics (the "Traub" in hh2's vtraub).

### `moran2016`

Moran S, Moenter SM, Khadra A (2016). A unified model for two modes of bursting in GnRH neurons. J Comput Neurosci 40(3):297–315.

[doi:10.1007/s10827-016-0598-4](https://doi.org/10.1007/s10827-016-0598-4) · [PMID 26975615](https://pubmed.ncbi.nlm.nih.gov/26975615/) · [PMC4860362](https://pmc.ncbi.nlm.nih.gov/articles/PMC4860362/) · *open (PubMed Central)* · models: GnRH

**Took:** The GnRH model Adams et al. 2018 modified; parameters marked "reestimated from Moran et al." in their Tables 2–3 come from here. Not read directly for any number in this app.

### `lebeau2000`

LeBeau AP, Van Goor F, Stojilkovic SS, Sherman A (2000). Modeling of membrane excitability in gonadotropin-releasing hormone-secreting hypothalamic neurons regulated by Ca2+-mobilizing and adenylyl cyclase-coupled receptors. J Neurosci 20(24):9290–9297.

[doi:10.1523/JNEUROSCI.20-24-09290.2000](https://doi.org/10.1523/JNEUROSCI.20-24-09290.2000) · [PMID 11125008](https://pubmed.ncbi.nlm.nih.gov/11125008/) · [PMC6773020](https://pmc.ncbi.nlm.nih.gov/articles/PMC6773020/) · *open (PubMed Central)* · models: GnRH

**Took:** The original Hodgkin–Huxley GnRH model that Moran et al. 2016 built on. Not read directly for any number in this app.

## Further reading

Related work not yet used — candidates for the next presets.

### `adams2019`

Adams C, DeFazio RA, Christian CA, Milescu LS, Schnell S, Moenter SM (2019). Changes in both neuron intrinsic properties and neurotransmission are needed to drive the increase in GnRH neuron firing rate during estradiol-positive feedback. J Neurosci 39(11):2091–2101.

[doi:10.1523/JNEUROSCI.2880-18.2019](https://doi.org/10.1523/JNEUROSCI.2880-18.2019) · [PMID 30655354](https://pubmed.ncbi.nlm.nih.gov/30655354/) · [PMC6507087](https://pmc.ncbi.nlm.nih.gov/articles/PMC6507087/) · *open (PubMed Central)* · models: GnRH

**Took:** Nothing yet. Drives model GnRH neurons with recorded GABAergic conductance trains — the natural next GnRH preset.

### `jaime2026`

Jaime J, DeFazio RA, Moenter SM (2026). Response of gonadotropin-releasing hormone neurons from female mice to dynamic-clamp-simulated GABAergic conductances across development and after prenatal androgenization. J Neuroendocrinol 38(2):e70144.

[doi:10.1111/jne.70144](https://doi.org/10.1111/jne.70144) · [PMID 41652850](https://pubmed.ncbi.nlm.nih.gov/41652850/) · [PMC12881841](https://pmc.ncbi.nlm.nih.gov/articles/PMC12881841/) · *open (PubMed Central)* · models: GnRH

**Took:** Nothing yet. Dynamic-clamp GABA conductances of 1–10 nS with 7 or 10 ms decay in GnRH neurons — a source for realistic GnRH GABA presets.

### `defazio2021`

DeFazio RA, Moenter SM (2021). Gonadotropin-releasing hormone (GnRH) neuron potassium currents and excitability in both sexes exhibit minimal changes upon removal of negative feedback. eNeuro 8(4):ENEURO.0126-21.2021.

[doi:10.1523/ENEURO.0126-21.2021](https://doi.org/10.1523/ENEURO.0126-21.2021) · [PMID 34135001](https://pubmed.ncbi.nlm.nih.gov/34135001/) · [PMC8266219](https://pmc.ncbi.nlm.nih.gov/articles/PMC8266219/) · *open (PubMed Central)* · models: GnRH

**Took:** Not used in the app. The slowly inactivating K⁺ current's inactivation (V½ ≈ −30 mV, slope ≈ 4.7, τ of seconds to tens of seconds) was added to the GnRH model's I_K in an experiment, to ask what it would do: at the published V½, nothing measurable.

> full inactivation and recovery required >10s at +50 and −100 mV, respectively.
> — Materials and Methods, Voltage-gated potassium current characterization

> Because inactivation was incomplete even after 51.29 s at −30 mV, this remaining current was not subtracted and the inactivation graphs level off at ∼30%.
> — Materials and Methods, Activation and inactivation of the slow current

**Used in:** [`tools/experiments/slow_ik_inactivation.ts`](../tools/experiments/slow_ik_inactivation.ts)

**Notes:** [`notes/defazio2021.md`](notes/defazio2021.md)
