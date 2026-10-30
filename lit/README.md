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

[doi:10.1007/s00422-008-0263-8](https://doi.org/10.1007/s00422-008-0263-8) · [PMID 19011929](https://pubmed.ncbi.nlm.nih.gov/19011929/) · *subscription* · models: pyramidal, fs, LTS

**Took:** The regular-spiking pyramidal cell, the fast-spiking interneuron and the low-threshold-spike (LTS) pyramidal cell: their currents (Traub INa and IKd, slow IM; for the LTS cell, a T-type Ca²⁺ current and a calcium shell) and the published cells they make.

**Used in:** [`src/core/channels.ts`](../src/core/channels.ts), [`src/core/models.ts`](../src/core/models.ts), [`src/core/pools.ts`](../src/core/pools.ts)

**Notes:** [`notes/pospischil2008.md`](notes/pospischil2008.md)

### `modeldb123623`

Destexhe A (2009). ModelDB 123623: minimal Hodgkin–Huxley models of cortical and thalamic neurons (NEURON code for Pospischil et al. 2008).

[modeldb.science/123623](https://modeldb.science/123623) · [code @ 8dfc13f](https://github.com/ModelDBRepository/123623/tree/8dfc13fb03c162f5ad1b5e13f94225c983391af7) · *open (code)* · models: pyramidal, fs, LTS

**Took:** Every pyramidal-cell parameter, from sPY_template; every fast-spiking-cell parameter, from sIN_template; every LTS-cell parameter, from sPYr_template with demo_PY_LTS.hoc's settings; with HH_traub.mod, IM_cortex.mod, IT_huguenard.mod and cadecay_destexhe.mod — and the mechanisms themselves, run in NEURON as the oracle each port is tested against, in current clamp and, for the pyramidal cell, in voltage clamp (SEClamp).

**Used in:** [`src/core/channels.ts`](../src/core/channels.ts), [`src/core/models.ts`](../src/core/models.ts), [`tools/neuron_oracle.py`](../tools/neuron_oracle.py), [`src/core/oracle.test.ts`](../src/core/oracle.test.ts), [`src/core/oracle/neuron_fs.json`](../src/core/oracle/neuron_fs.json), [`src/core/pools.ts`](../src/core/pools.ts), [`src/core/oracle/neuron_lts.json`](../src/core/oracle/neuron_lts.json), [`src/core/lts.test.ts`](../src/core/lts.test.ts), [`tools/neuron_oracle_vc.py`](../tools/neuron_oracle_vc.py), [`src/core/oracle/neuron_vc_rs.json`](../src/core/oracle/neuron_vc_rs.json), [`src/core/vclamp.test.ts`](../src/core/vclamp.test.ts)

**Notes:** [`notes/pospischil2008.md`](notes/pospischil2008.md)

### `hodgkin1952`

Hodgkin AL, Huxley AF (1952). A quantitative description of membrane current and its application to conduction and excitation in nerve. J Physiol 117(4):500–544.

[doi:10.1113/jphysiol.1952.sp004764](https://doi.org/10.1113/jphysiol.1952.sp004764) · [PMID 12991237](https://pubmed.ncbi.nlm.nih.gov/12991237/) · [PMC1392413](https://pmc.ncbi.nlm.nih.gov/articles/PMC1392413/) · *open* · models: squid axon

**Took:** The squid giant axon: INa = gNa m³h (V − ENa) and IK = gK n⁴ (V − EK), their rate functions (Eqs. 12, 13, 20, 21, 23, 24), the constants of Table 3 (gNa 120, gK 36, gl 0.3 mS/cm²; C 1 µF/cm²; V_Na −115, V_K +12, V_l −10.613 mV, i.e. E_Na +50, E_K −77, E_L −54.387 mV with rest at −65) and the Q10 of 3 from 6.3 °C, all checked against the port; the computed membrane action potentials of Table 4 and the threshold of Fig. 12, which the port reproduces; and the protocols of Figs. 3 and 6 for two voltage-clamp presets.

**Used in:** [`src/core/channels.ts`](../src/core/channels.ts), [`src/core/models.ts`](../src/core/models.ts), [`src/core/protocol.ts`](../src/core/protocol.ts), [`src/core/hh.test.ts`](../src/core/hh.test.ts), [`public/methods.html`](../public/methods.html)

**Notes:** [`notes/hodgkin1952.md`](notes/hodgkin1952.md)

### `neuronhh`

Hines ML, Carnevale NT (2025). hh.mod: the Hodgkin–Huxley mechanism built into the NEURON simulator.

[github.com/neuronsimulator/nrn/blob/master/src/nrnoc/hh.mod](https://github.com/neuronsimulator/nrn/blob/master/src/nrnoc/hh.mod) · *open (code)* · models: squid axon

**Took:** The 1952 rate functions as NEURON writes them (vtrap at the removable singularities) and the temperature factor 3^((T − 6.3)/10); and the mechanism itself, run in NEURON 9.0.2 as the oracle the port is tested against (tools/neuron_oracle_hh.py).

**Used in:** [`src/core/channels.ts`](../src/core/channels.ts), [`tools/neuron_oracle_hh.py`](../tools/neuron_oracle_hh.py), [`src/core/hh.test.ts`](../src/core/hh.test.ts)

### `adams2018`

Adams C, Stroberg W, DeFazio RA, Schnell S, Moenter SM (2018). Gonadotropin-releasing hormone (GnRH) neuron excitability is regulated by estradiol feedback and kisspeptin. J Neurosci 38(5):1249–1263.

[doi:10.1523/JNEUROSCI.2988-17.2017](https://doi.org/10.1523/JNEUROSCI.2988-17.2017) · [PMID 29263236](https://pubmed.ncbi.nlm.nih.gov/29263236/) · [PMC5792479](https://pmc.ncbi.nlm.nih.gov/articles/PMC5792479/) · *open (PubMed Central)* · models: GnRH

**Took:** The GnRH neuron: Equations 1–24, Tables 1–3 (negative-feedback parameter set), Cm = 20 pF and I_app = −6 pA, and the two published numbers the port is checked against — rest at −70 mV and the Fig. 7F spike counts.

> I app is the applied current, which was set to −6 pA to hold the cell at −70 mV.
> — Materials and Methods, Mathematical modeling

> cells were injected with current from 0 to 30 pA (500 ms, 2 pA steps)
> — Materials and Methods, Whole-cell patch-clamp

> Current injections were initiated from a mean membrane potential of −69 ± 2 mV, near the value determined in the above experiments.
> — Results; the earlier experiments are on-cell measurements of Vm

**Used in:** [`src/core/models.ts`](../src/core/models.ts), [`src/core/channels.ts`](../src/core/channels.ts), [`src/core/gnrh.test.ts`](../src/core/gnrh.test.ts), [`src/core/tour.ts`](../src/core/tour.ts)

**Notes:** [`notes/adams2018.md`](notes/adams2018.md)

### `bertram2004`

Bertram R, Satin L, Zhang M, Smolen P, Sherman A (2004). Calcium and glycolysis mediate multiple bursting modes in pancreatic islets. Biophys J 87(5):3074–3087.

[doi:10.1529/biophysj.104.049262](https://doi.org/10.1529/biophysj.104.049262) · [PMID 15347584](https://pubmed.ncbi.nlm.nih.gov/15347584/) · [PMC1304779](https://pmc.ncbi.nlm.nih.gov/articles/PMC1304779/) · *open (PubMed Central)* · models: mouse β-cell

**Took:** The mouse beta cell: Equations 1–24 and Table 1 with the authors' errata (κ = 0.005, V_max = 2), Cm = 5300 fF, the figure legends' parameter sets (Figs. 3, 5–8), and the reported behavior the port is checked against — the ≈5 min glycolytic period, the ≈30 s burst-driven rhythm, the bistability point of Fig. 10, and the burst patterns and phase relations of Figs. 3 and 5–9.

> Oscillations are produced at the larger value RGK = 0.2 s−1 (Fig. 2 A). However, when RGK is increased further, to 0.4 s−1, the glycolytic subsystem stops oscillating
> — Results, The glycolytic subsystem is a conditional oscillator

> Notice that these oscillations are much more rapid (period ≈ 30 s) than the larger-amplitude oscillations observed when glycolysis is in an oscillatory mode (period ≈ 5 min).
> — Results, Bursting can occur without glycolytic oscillations

> the system is started with the initial condition F6P = 75 μM, FBP = 8 μM and comes to rest at the equilibrium F6P ≈ 64 μM, FBP ≈ 9.1 μM after some damped oscillations. In the other case (solid line), the system is started at F6P = 78 μM, FBP = 8 μM, but does not come to rest. Instead it oscillates with a period of ∼5 min.
> — Results, The glycolytic subsystem exhibits bistability

**Used in:** [`src/core/beta.ts`](../src/core/beta.ts), [`src/core/pools.ts`](../src/core/pools.ts), [`src/core/beta-run.ts`](../src/core/beta-run.ts), [`src/core/beta.test.ts`](../src/core/beta.test.ts), [`src/core/beta-bursts.test.ts`](../src/core/beta-bursts.test.ts), [`src/core/beta-glycolytic.test.ts`](../src/core/beta-glycolytic.test.ts)

**Notes:** [`notes/bertram2004.md`](notes/bertram2004.md)

### `dom10code`

Bertram R, Sherman A (2004). XPP files and errata for Bertram et al. 2004 (the Dual Oscillator Model, DOM 1.0).

[artielbm.github.io/Models/DOM1.0/](https://artielbm.github.io/Models/DOM1.0/) · *open (code; no license stated)* · models: mouse β-cell

**Took:** The PFK rate law, which the paper cites from Smolen (1995) without printing it; the errata (κ = 0.005 and V_max = 2 omitted from Table 1; K5 and f53 unused); and the figure files' initial values, which the tests start from. The equations were also integrated literally, outside this repository, as a check on the port (lit/notes/bertram2004.md). No file of the authors' is in this repository.

**Used in:** [`src/core/beta.ts`](../src/core/beta.ts), [`src/core/beta-run.ts`](../src/core/beta-run.ts)

**Notes:** [`notes/bertram2004.md`](notes/bertram2004.md)

## Parameters

Single values taken from measurements.

### `defazio2002`

DeFazio RA, Heger S, Ojeda SR, Moenter SM (2002). Activation of A-type γ-aminobutyric acid receptors excites gonadotropin-releasing hormone neurons. Mol Endocrinol 16(12):2872–2891.

[doi:10.1210/me.2002-0163](https://doi.org/10.1210/me.2002-0163) · [PMID 12456806](https://pubmed.ncbi.nlm.nih.gov/12456806/) · *free to read at the publisher* · models: GnRH

**Took:** The GnRH cell's default E_GABA, −36.5 mV: measured by gramicidin perforated patch, which leaves intracellular chloride undisturbed.

> E GABA measured 100 msec after GABA application was −36.5 ± 1.2 mV (n = 16 cells from 13 adult diestrous females).
> — Results; read from the publisher's full text, 2026-09-21

> This was positive relative to the resting potential (−50.7 ± 1.7 mV, from current-clamp measurements)
> — Results, gramicidin perforated patch; read through a summarizing web fetch, 2026-10-19 (Table 2 gives the on-cell rest, −72.7 ± 2.3 mV, n = 18); check against the PDF

**Used in:** [`src/core/models.ts`](../src/core/models.ts), [`src/core/protocol.ts`](../src/core/protocol.ts), [`src/core/tour.ts`](../src/core/tour.ts)

**Notes:** [`notes/defazio2002.md`](notes/defazio2002.md)

### `jaime2026`

Jaime J, DeFazio RA, Moenter SM (2026). Response of gonadotropin-releasing hormone neurons from female mice to dynamic-clamp-simulated GABAergic conductances across development and after prenatal androgenization. J Neuroendocrinol 38(2):e70144.

[doi:10.1111/jne.70144](https://doi.org/10.1111/jne.70144) · [PMID 41652850](https://pubmed.ncbi.nlm.nih.gov/41652850/) · [PMC12881841](https://pmc.ncbi.nlm.nih.gov/articles/PMC12881841/) · *open (PubMed Central)* · models: GnRH

**Took:** The GnRH cell's default GABA PSC: decay τ 10 ms (9.9 ± 0.25 ms in adult females), peak ≈ 1 nS (≈ −30 pA at −70 mV, Fig. 2B read by eye), instantaneous rise as in their dynamic clamp. Best available rather than ground truth: decay τ depends on chloride, and intracellular chloride in GnRH neurons was never measured directly.

> The decay time constant of GABAergic PSCs is strongly dependent on the concentration of chloride in the recording pipette.
> — Methods 2.5, Properties of isolated GABAergic PSCs in GnRH neurons

> an age‐dependent increase in decay time constant from 7.4 ± 0.1 ms to 9.9 ± 0.2 ms was detected
> — Methods 2.6, Modelling of the GABAergic postsynaptic conductances

> a range of conductances within and moderately above the physiological range of GABA PSCs was used (1, 2, 5, 10 nS)
> — Methods 2.6

**Used in:** [`src/core/models.ts`](../src/core/models.ts), [`src/core/protocol.ts`](../src/core/protocol.ts), [`src/core/gnrh.test.ts`](../src/core/gnrh.test.ts)

**Notes:** [`notes/jaime2026.md`](notes/jaime2026.md)

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

### `defazio2002k`

DeFazio RA, Moenter SM (2002). Estradiol feedback alters potassium currents and firing properties of gonadotropin-releasing hormone neurons. Mol Endocrinol 16(10):2255–2265.

[doi:10.1210/me.2002-0155](https://doi.org/10.1210/me.2002-0155) · *not in hand (on the owner's want-list)* · models: GnRH

**Took:** The 1 V/s dV/dt criterion for GnRH action-potential threshold, which the owner defined in this paper. The notebook's report tabulates threshold at 1 V/s alongside 2, 10 and 20 V/s. Also the report that estradiol lowers GnRH threshold and latency through I_A, which motivated the K⁺-block experiments. Attributed on the owner's word (2026-10-18); the PDF has not been read here, so there is no quotation yet.

**Used in:** [`src/core/threshold.ts`](../src/core/threshold.ts), [`src/core/report.ts`](../src/core/report.ts), [`tools/experiments/threshold_criteria.ts`](../tools/experiments/threshold_criteria.ts)

### `kress2010`

Kress GJ, Dowling MJ, Eisenman LN, Mennerick S (2010). Axonal sodium channel distribution shapes the depolarized action potential threshold of dentate granule neurons. Hippocampus 20(4):558–571.

[doi:10.1002/hipo.20667](https://doi.org/10.1002/hipo.20667) · *open (NIH author manuscript)* · models: pyramidal, fs, GnRH

**Took:** The 10 V/s threshold criterion, tabulated in the notebook's report. Also the comparison the threshold experiments reproduce: intracellular TEA, with a bias current restoring a negative rest, left voltage threshold unchanged and changed rheobase.

> The membrane potential at which phase plot slope reached 10 mV ms-1 (Kress et al., 2008; Naundorf et al., 2006; Shu et al., 2007) was denoted voltage threshold.
> — Methods

> Blocking DG neuron KVs with intracellular TEA depolarized the resting membrane potential and altered rheobase but did not alter action potential voltage threshold.
> — Discussion

> It is possible that subthreshold potassium currents, especially those on the axon, might participate in setting voltage threshold (Bekkers and Delaney, 2001; Shah et al., 2008).
> — Results

**Used in:** [`src/core/threshold.ts`](../src/core/threshold.ts), [`src/core/report.ts`](../src/core/report.ts), [`tools/experiments/threshold_criteria.ts`](../tools/experiments/threshold_criteria.ts), [`tools/experiments/na_shift.ts`](../tools/experiments/na_shift.ts)

### `wang2016`

Wang L, DeFazio RA, Moenter SM (2016). Excitability and burst generation of AVPV kisspeptin neurons are regulated by the estrous cycle via multiple conductances modulated by estradiol action. eNeuro 3(3):ENEURO.0094-16.2016.

[doi:10.1523/ENEURO.0094-16.2016](https://doi.org/10.1523/ENEURO.0094-16.2016) · [PMID 27280155](https://pubmed.ncbi.nlm.nih.gov/27280155/) · [PMC4895127](https://pmc.ncbi.nlm.nih.gov/articles/PMC4895127/) · *open (PubMed Central)* · models: 

**Took:** The 2 V/s dV/dt criterion for action-potential threshold, which the notebook's report tabulates alongside 1, 10 and 20 V/s. The owner remembered it as the lab's KNDy convention, from Luhong Wang's recordings; the paper's cells are AVPV kisspeptin neurons, and it measures threshold at rheobase from −70 mV, as the app does.

> The action potential threshold was defined as the membrane potential at which the derivative exceeded 2 V/s.
> — Materials and Methods

**Used in:** [`src/core/threshold.ts`](../src/core/threshold.ts), [`src/core/report.ts`](../src/core/report.ts)

### `barry1991`

Barry PH, Lynch JW (1991). Liquid junction potentials and small cell effects in patch-clamp analysis. J Membr Biol 121(2):101–117.

[doi:10.1007/BF01870526](https://doi.org/10.1007/BF01870526) · *subscription* · models: pyramidal

**Took:** The generalized Henderson equation for a liquid junction potential, and its sign convention (true Vm = V_read − LJP). Used only in an experiment.

**Used in:** [`tools/experiments/chloride_calibration.ts`](../tools/experiments/chloride_calibration.ts)

**Notes:** [`notes/defazio2000.md`](notes/defazio2000.md)

### `barry1994`

Barry PH (1994). JPCalc, a software package for calculating liquid junction potential corrections in patch-clamp, intracellular, epithelial and bilayer measurements and for correcting junction potential measurements. J Neurosci Methods 51(1):107–116.

[doi:10.1016/0165-0270(94)90031-0](https://doi.org/10.1016/0165-0270(94)90031-0) · *subscription* · models: pyramidal

**Took:** Relative ion mobilities (K⁺ = 1; Na⁺ 0.682, Cl⁻ 1.0388, gluconate 0.33, HCO3⁻ 0.605, Ca²⁺ 0.4048, Mg²⁺ 0.361), for the Henderson equation. Used only in an experiment.

**Used in:** [`tools/experiments/chloride_calibration.ts`](../tools/experiments/chloride_calibration.ts)

**Notes:** [`notes/defazio2000.md`](notes/defazio2000.md)

## Background

What the models were built on, credited but not read for any number here.

### `destexhe2001`

Destexhe A, Contreras D, Steriade M (2001). LTS cells in cerebral cortex and their role in generating spike-and-wave oscillations. Neurocomputing 38–40:555–563.

[doi:10.1016/S0925-2312(01)00348-4](https://doi.org/10.1016/S0925-2312(01)00348-4) · *subscription* · models: LTS

**Took:** Credited as the original of the LTS cell, which sPYr_template says it is taken from. No number is read from the paper: every value is ModelDB 123623's code.

**Used in:** [`src/core/models.ts`](../src/core/models.ts)

**Notes:** [`notes/pospischil2008.md`](notes/pospischil2008.md)

### `huguenard1992`

Huguenard JR, McCormick DA (1992). Simulation of the currents involved in rhythmic oscillations in thalamic relay neurons. J Neurophysiol 68(4):1373–1383.

[doi:10.1152/jn.1992.68.4.1373](https://doi.org/10.1152/jn.1992.68.4.1373) · *subscription* · models: LTS

**Took:** Credited as the source of the T-type Ca²⁺ current's kinetics, as IT_huguenard.mod cites it. The equations used are the .mod file's, transcribed in the note; they have not been checked against the paper's text.

**Used in:** [`src/core/channels.ts`](../src/core/channels.ts)

**Notes:** [`notes/pospischil2008.md`](notes/pospischil2008.md)

### `huguenard1992b`

Huguenard JR, Prince DA (1992). A novel T-type current underlies prolonged Ca(2+)-dependent burst firing in GABAergic neurons of rat thalamic reticular nucleus. J Neurosci 12(10):3804–3817.

[doi:10.1523/JNEUROSCI.12-10-03804.1992](https://doi.org/10.1523/JNEUROSCI.12-10-03804.1992) · [PMID 1403085](https://pubmed.ncbi.nlm.nih.gov/1403085/) · [PMC6575965](https://pmc.ncbi.nlm.nih.gov/articles/PMC6575965/) · *open (PubMed Central)* · models: LTS

**Took:** Credited because IT_huguenard.mod names it beside Huguenard & McCormick 1992 as the data its T current is based on. Nothing is read from it here.

**Used in:** [`src/core/channels.ts`](../src/core/channels.ts)

**Notes:** [`notes/pospischil2008.md`](notes/pospischil2008.md)

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

### `han2008`

Han SK, Herbison AE (2008). Norepinephrine suppresses gonadotropin-releasing hormone neuron excitability in the adult mouse. Endocrinology 149(3):1129–1135.

[doi:10.1210/en.2007-1241](https://doi.org/10.1210/en.2007-1241) · [PMID 18079196](https://pubmed.ncbi.nlm.nih.gov/18079196/) · [PMC6103434](https://pmc.ncbi.nlm.nih.gov/articles/PMC6103434/) · *open (PubMed Central)* · models: GnRH

**Took:** GnRH neuron resting potentials by gramicidin perforated patch, by sex and cycle stage (−55.5 to −59.4 mV): evidence for the GABA opening's resting potential near −60 mV.

> Under perforated-patch, resting membrane potentials (RMP; mV) were -59.4±1.0 (males, N=39), -55.5±1.5 (diestrous females, N=11), -59.3±1.2 (proestrous females, N=14), -55.6±2.5 (estrous females, N=13) and -58.8±1.1 (OVX females, N=11).
> — Results

**Used in:** [`src/core/tour.ts`](../src/core/tour.ts)

**Notes:** [`notes/gnrh-rest.md`](notes/gnrh-rest.md)

### `liu2008`

Liu X, Lee K, Herbison AE (2008). Kisspeptin excites gonadotropin-releasing hormone neurons through a phospholipase C/calcium-dependent pathway regulating multiple ion channels. Endocrinology 149(9):4605–4614.

[doi:10.1210/en.2008-0321](https://doi.org/10.1210/en.2008-0321) · [PMID 18483150](https://pubmed.ncbi.nlm.nih.gov/18483150/) · [PMC6116891](https://pmc.ncbi.nlm.nih.gov/articles/PMC6116891/) · *open (PubMed Central)* · models: GnRH

**Took:** GnRH neuron resting potential by gramicidin perforated patch, −55 ± 1 mV (n = 188), junction potential not corrected (~−2 mV).

> The 188 GnRH neurons included in this report had an average resting membrane potential (RMP) of -55±1mV and Rin of 1478±35MOhms.
> — Results

**Used in:** [`src/core/tour.ts`](../src/core/tour.ts)

**Notes:** [`notes/gnrh-rest.md`](notes/gnrh-rest.md)

### `moenter2010`

Moenter SM (2010). Identified GnRH neuron electrophysiology: a decade of study. Brain Res 1364:10–24.

[doi:10.1016/j.brainres.2010.09.066](https://doi.org/10.1016/j.brainres.2010.09.066) · [PMID 20920482](https://pubmed.ncbi.nlm.nih.gov/20920482/) · [PMC2992586](https://pmc.ncbi.nlm.nih.gov/articles/PMC2992586/) · *open (PubMed Central)* · models: GnRH

**Took:** The range of GnRH neuron interspike potentials (−65 to −50 mV, whole-cell or perforated patch) against the on-cell estimate (~−75 mV).

> The interspike potential of the majority of GnRH neurons is between −65 and −50 mV recorded in either whole-cell or perforated-patch configuration
> — review text

> Measurements made using a non-invasive method suggested a more hyperpolarized membrane potential of ~−75 mV.
> — review text

**Notes:** [`notes/gnrh-rest.md`](notes/gnrh-rest.md)

## Further reading

Related work not yet used — candidates for the next presets.

### `adams2019`

Adams C, DeFazio RA, Christian CA, Milescu LS, Schnell S, Moenter SM (2019). Changes in both neuron intrinsic properties and neurotransmission are needed to drive the increase in GnRH neuron firing rate during estradiol-positive feedback. J Neurosci 39(11):2091–2101.

[doi:10.1523/JNEUROSCI.2880-18.2019](https://doi.org/10.1523/JNEUROSCI.2880-18.2019) · [PMID 30655354](https://pubmed.ncbi.nlm.nih.gov/30655354/) · [PMC6507087](https://pmc.ncbi.nlm.nih.gov/articles/PMC6507087/) · *open (PubMed Central)* · models: GnRH

**Took:** Nothing yet. Drives model GnRH neurons with recorded GABAergic conductance trains — the natural next GnRH preset.

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

### `defazio2000`

DeFazio RA, Keros S, Quick MW, Hablitz JJ (2000). Potassium-coupled chloride cotransport controls intracellular chloride in rat neocortical pyramidal neurons. J Neurosci 20(21):8069–8076.

[doi:10.1523/JNEUROSCI.20-21-08069.2000](https://doi.org/10.1523/JNEUROSCI.20-21-08069.2000) · [PMID 11050128](https://pubmed.ncbi.nlm.nih.gov/11050128/) · [PMC6772739](https://pmc.ncbi.nlm.nih.gov/articles/PMC6772739/) · *open (PubMed Central)* · models: pyramidal

**Took:** Not used in the app. Its outside-out patch calibrations (pipette Cl⁻ known; 40 mM read off Fig. 2A) and solution recipes, refitted in an experiment to ask what the paper's one-sided activity factor was absorbing: a voltage error of about 6 mV (about half the Henderson junction potential) plus a small permeant pipette anion.

> [Cl−]o was set to the extracellular Cl− concentration, corrected for activity (Robinson and Stokes, 1959) (e.g., in 3.5 mM [K+]o, 139.6 mM × 76% = 106.1 mM).
> — Materials and Methods, Intracellular chloride calculation

> Liquid junction potentials for all solutions were measured, and all voltages reported are corrected values (Neher, 1992).
> — Materials and Methods

> Our results with excised patches demonstrated an effective concentration of pipette Cl− of 2.06 ± 0.16 mM when only 1 mM KCl was added.
> — Materials and Methods, The role of bicarbonate and other anions

**Used in:** [`tools/experiments/chloride_calibration.ts`](../tools/experiments/chloride_calibration.ts), [`src/experiments.test.ts`](../src/experiments.test.ts)

**Notes:** [`notes/defazio2000.md`](notes/defazio2000.md)
