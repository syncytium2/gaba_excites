"""
NEURON oracle for the stock cell.

Runs the ORIGINAL ModelDB 123623 mechanisms (HH_traub.mod, IM_cortex.mod;
Pospischil et al. 2008) in NEURON, on the published regular-spiking cell, and
writes the spike times of a current-step family to
src/core/oracle/neuron_rs.json. src/core/oracle.test.ts then requires the
TypeScript port to reproduce them.

The mechanisms are not vendored here: they are ModelDB's, fetched from
github.com/ModelDBRepository/123623 at the commit recorded in the output.

    python3 -m venv .venv-neuron && .venv-neuron/bin/pip install neuron
    git clone https://github.com/ModelDBRepository/123623 /tmp/md123623
    (cd /tmp/md123623 && ../path/to/.venv-neuron/bin/nrnivmodl HH_traub.mod IM_cortex.mod)
    .venv-neuron/bin/python tools/neuron_oracle.py /tmp/md123623

Protocol, matched on the TypeScript side: 3000 ms settle at 0 pA, then a
sweep with a step from 100 ms for 800 ms. Fixed step dt = 0.01 ms, implicit
Euler (NEURON's default), 36 degC.
"""
import json, math, os, subprocess, sys

md = os.path.abspath(sys.argv[1])
os.chdir(md)
from neuron import h
h.nrn_load_dll(os.path.join(md, "arm64", ".libs", "libnrnmech.dylib")) if not hasattr(h, "hh2") else None
h.load_file("stdrun.hoc")

SETTLE, STEP_ON, STEP_DUR, SWEEP = 3000.0, 100.0, 800.0, 1000.0
AMPS_PA = [500, 550, 600, 700, 800, 1000, 1500]
DT = 0.01

soma = h.Section(name="soma")
soma.nseg = 1; soma.diam = 96; soma.L = 96; soma.cm = 1; soma.Ra = 100
soma.insert("pas"); soma.e_pas = -70; soma.g_pas = 1e-4
soma.insert("hh2"); soma.ek = -100; soma.ena = 50
soma.vtraub_hh2 = -55; soma.gnabar_hh2 = 0.05; soma.gkbar_hh2 = 0.005
soma.insert("im"); h.taumax_im = 1000; soma.gkbar_im = 7e-5
h.celsius = 36

stim = h.IClamp(soma(0.5))
vvec = h.Vector().record(soma(0.5)._ref_v)
tvec = h.Vector().record(h._ref_t)
h.dt = DT; h.steps_per_ms = 1 / DT; h.secondorder = 0

def run(amp_pa):
    stim.delay = SETTLE + STEP_ON; stim.dur = STEP_DUR; stim.amp = amp_pa / 1000.0
    h.v_init = -70.571
    h.finitialize(h.v_init)
    h.continuerun(SETTLE + SWEEP)
    v = vvec.as_numpy(); t = tvec.as_numpy()
    spikes, armed = [], v[0] < -20
    for i in range(1, len(v)):
        if not armed:
            if v[i] < -40: armed = True
            continue
        if v[i-1] < -20 <= v[i]:
            armed = False
            tc = t[i-1] + (-20 - v[i-1]) / (v[i] - v[i-1]) * (t[i] - t[i-1])
            if tc >= SETTLE: spikes.append(round(tc - SETTLE, 4))
    k0 = int(round(SETTLE / DT))
    return spikes, float(v[k0]), float(max(v[k0:]))

commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip() or "unknown"
out = {"source": "ModelDB 123623 (github.com/ModelDBRepository/123623)", "commit": commit,
       "neuron": h.nrnversion(5), "dt": DT, "settle": SETTLE, "stepOn": STEP_ON, "stepDur": STEP_DUR,
       "sweep": SWEEP, "sweeps": []}
for a in AMPS_PA:
    sp, v0, vmax = run(a)
    out["sweeps"].append({"amp": a, "spikes": sp, "vStart": v0, "vMax": vmax})
    print(a, len(sp), sp[:4], round(v0, 3))
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "core", "oracle", "neuron_rs.json")
with open(dest, "w") as f: json.dump(out, f, indent=1)
print("wrote", os.path.normpath(dest))
