# gaba_excites

A current-clamp simulator of a cortical pyramidal neuron that runs in the
browser. Set the passive properties the way you would read them off a rig
(Rin, Cm, Rs, Ihold), run a family of current steps, and read off threshold,
rheobase and the F–I curve. Add glutamatergic and GABAergic PSCs, move
E_GABA, and watch the same inhibitory conductance hyperpolarize, shunt, or
excite.

*Work in progress — the full README arrives with the app.*

The model is the regular-spiking pyramidal cell of Pospischil et al. (2008),
ported from its ModelDB source (123623) and checked spike-for-spike against
NEURON running the original mechanisms.

MIT licensed. The process by which this was built is written down, as it
happened, in [`docs/process.md`](docs/process.md).
