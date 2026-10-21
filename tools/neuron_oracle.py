"""
NEURON oracle for the Pospischil et al. 2008 cells.

Runs the ORIGINAL ModelDB 123623 mechanisms (HH_traub.mod, IM_cortex.mod) in
NEURON, on one of the paper's published one-compartment cells, and writes the
spike times of a current-step family to src/core/oracle/neuron_<cell>.json.
src/core/oracle.test.ts then requires the TypeScript port to reproduce them.

    rs   sPY_template, the regular-spiking pyramidal cell (the default)
    fs   sIN_template, the fast-spiking interneuron: the same INa and IK at
         double the K+ density, no M current, a 67 um sphere
    lts  sPYr_template with demo_PY_LTS.hoc's parameters, the low-threshold-spike
         pyramidal cell: the pyramidal cell's INa, IK and M current plus
         Huguenard's T-type Ca2+ current (IT_huguenard.mod) and Destexhe's
         calcium decay (cadecay_destexhe.mod); leak reversal -85 mV

The mechanisms are not vendored here: they are ModelDB's, fetched from
github.com/ModelDBRepository/123623 at the commit recorded in the output.

    python3 -m venv .venv-neuron && .venv-neuron/bin/pip install neuron
    git clone https://github.com/ModelDBRepository/123623 /tmp/md123623
    (cd /tmp/md123623 && ../path/to/.venv-neuron/bin/nrnivmodl HH_traub.mod IM_cortex.mod \
        IT_huguenard.mod cadecay_destexhe.mod)
    .venv-neuron/bin/python tools/neuron_oracle.py /tmp/md123623        # rs
    .venv-neuron/bin/python tools/neuron_oracle.py /tmp/md123623 fs     # fs
    .venv-neuron/bin/python tools/neuron_oracle.py /tmp/md123623 lts    # lts

Protocol, matched on the TypeScript side, for rs and fs: 3000 ms settle at 0 pA, then a
sweep with a step from 100 ms for 800 ms. Fixed step dt = 0.01 ms, implicit
Euler (NEURON's default), 36 degC.

For lts the sweeps come in families, each with its own holding current, on
from t = 0 so that the 3000 ms settle happens at the hold: a 500 ms step from
200 ms in a 2000 ms sweep, long enough to see a rebound after release. At its
own rest (-84 mV, 0 pA) the cell bursts on depolarization; held near -65 mV
it fires on release from hyperpolarization.
"""
import json, math, os, subprocess, sys

md = os.path.abspath(sys.argv[1])
CELL = sys.argv[2] if len(sys.argv) > 2 else "rs"
# Each cell exactly as its template defines it (sPY_template, sIN_template).
CELLS = {
    "rs": dict(diam=96, g_pas=1e-4, gkbar=0.005, gkbar_im=7e-5, v_init=-70.571,
               amps=[500, 550, 600, 700, 800, 1000, 1500]),
    "fs": dict(diam=67, g_pas=1.5e-4, gkbar=0.01, gkbar_im=0, v_init=-70.0,
               amps=[250, 300, 350, 400, 500, 800, 1600, 3200]),
    # demo_PY_LTS.hoc: gcabar_it = 4e-4, gkbar_im = 3e-5, g_pas = 1e-5,
    # e_pas = -85; the template's cad (depth 1 um, taur 5 ms, cainf 2.4e-4 mM)
    # and cao = 2 mM.
    "lts": dict(diam=96, g_pas=1e-5, e_pas=-85, gkbar=0.005, gkbar_im=3e-5, gcabar_it=4e-4, v_init=-84,
                settle=3000.0, step_on=200.0, step_dur=500.0, sweep=2000.0,
                families=[(0, [-100, 50, 80, 100, 150, 300]),
                          (60, [0, -50, -100, -200]),
                          (50, [-50]),
                          (30, [-100])]),
}
C = CELLS[CELL]
os.chdir(md)
from neuron import h
if not hasattr(h, "hh2"):  # NEURON 9 writes arm64/libnrnmech.dylib; older ones, arm64/.libs/
    lib = next(p for p in [os.path.join(md, "arm64", "libnrnmech.dylib"),
                           os.path.join(md, "arm64", ".libs", "libnrnmech.dylib")] if os.path.exists(p))
    h.nrn_load_dll(lib)
h.load_file("stdrun.hoc")

SETTLE, STEP_ON, STEP_DUR, SWEEP = C.get("settle", 3000.0), C.get("step_on", 100.0), C.get("step_dur", 800.0), C.get("sweep", 1000.0)
FAMILIES = C.get("families", [(0, C.get("amps"))])
DT = 0.01

soma = h.Section(name="soma")
soma.nseg = 1; soma.diam = C["diam"]; soma.L = C["diam"]; soma.cm = 1; soma.Ra = 100
soma.insert("pas"); soma.e_pas = C.get("e_pas", -70); soma.g_pas = C["g_pas"]
soma.insert("hh2"); soma.ek = -100; soma.ena = 50
soma.vtraub_hh2 = -55; soma.gnabar_hh2 = 0.05; soma.gkbar_hh2 = C["gkbar"]
if C["gkbar_im"]:
    soma.insert("im"); h.taumax_im = 1000; soma.gkbar_im = C["gkbar_im"]
if C.get("gcabar_it"):
    soma.insert("cad"); soma.depth_cad = 1; soma.taur_cad = 5; soma.cainf_cad = 2.4e-4; soma.kt_cad = 0
    soma.insert("it"); soma.cai = 2.4e-4; soma.cao = 2; soma.gcabar_it = C["gcabar_it"]
h.celsius = 36

stim = h.IClamp(soma(0.5))
hold = h.IClamp(soma(0.5)); hold.delay = 0; hold.dur = 1e9
vvec = h.Vector().record(soma(0.5)._ref_v)
tvec = h.Vector().record(h._ref_t)
h.dt = DT; h.steps_per_ms = 1 / DT; h.secondorder = 0

def run(amp_pa, hold_pa=0):
    hold.amp = hold_pa / 1000.0
    stim.delay = SETTLE + STEP_ON; stim.dur = STEP_DUR; stim.amp = amp_pa / 1000.0
    h.v_init = C["v_init"]
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
for hp, amps in FAMILIES:
    for a in amps:
        sp, v0, vmax = run(a, hp)
        sw = {"amp": a, "spikes": sp, "vStart": v0, "vMax": vmax}
        if "families" in C: sw = {"hold": hp, **sw}
        out["sweeps"].append(sw)
        print(hp, a, len(sp), sp[:4], round(v0, 3))
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "core", "oracle", f"neuron_{CELL}.json")
with open(dest, "w") as f: json.dump(out, f, indent=1)
print("wrote", os.path.normpath(dest))
