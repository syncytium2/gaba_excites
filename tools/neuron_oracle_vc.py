"""
NEURON oracle for voltage clamp, on the Pospischil et al. 2008 pyramidal cell.

Runs the ORIGINAL ModelDB 123623 mechanisms (HH_traub.mod, IM_cortex.mod) in
NEURON on sPY_template's one-compartment cell, clamped by NEURON's SEClamp: an
ideal voltage source behind a series resistance rs, the circuit
src/core/simulate.ts's stepVC solves. Writes src/core/oracle/neuron_vc_rs.json;
src/core/vclamp.test.ts then requires the TypeScript port to reproduce it.

    python3 -m venv .venv-neuron && .venv-neuron/bin/pip install neuron
    git clone https://github.com/ModelDBRepository/123623 /tmp/md123623
    (cd /tmp/md123623 && ../path/to/.venv-neuron/bin/nrnivmodl HH_traub.mod IM_cortex.mod \
        IT_huguenard.mod cadecay_destexhe.mod)
    .venv-neuron/bin/python tools/neuron_oracle_vc.py /tmp/md123623

Each family: finitialize at the holding potential, 3000 ms clamped there to
settle, then the sweep's segments, played into SEClamp as a step waveform.
Fixed step dt = 0.01 ms, implicit Euler (NEURON's default), 36 degC. The
recorded current is SEClamp.i in nA, written here in pA; positive is current
into the cell, so a net outward membrane current reads positive, as in the port.
Recorded every 0.02 ms; every 10th sample (0.2 ms) is written, with each
segment's peak inward and outward current taken at full resolution first.

Families (the same as vclamp.test.ts):
    act       hold -80; 10 ms at -80, 50 ms test from -80 to +40 by 10, 20 ms at -80;
              rs = 0.001 MOhm, effectively ideal
    act_rs2   the same with rs = 2 MOhm: the clamp loses the cell to its own
              sodium current, which the port must reproduce too
    inact     hold -80; 10 ms at -80, 100 ms prepulse from -120 to -10 by 10,
              10 ms test at 0, 10 ms at -80; rs = 0.001
"""
import json, os, subprocess, sys

md = os.path.abspath(sys.argv[1])
os.chdir(md)
from neuron import h
if not hasattr(h, "hh2"):
    for p in [os.path.join(md, a, b) for a in ("x86_64", "arm64", "aarch64") for b in ("libnrnmech.so", "libnrnmech.dylib", ".libs/libnrnmech.so", ".libs/libnrnmech.dylib")]:
        if os.path.exists(p):
            h.nrn_load_dll(p)
            break
h.load_file("stdrun.hoc")

DT, SETTLE, SAMPLE = 0.01, 3000.0, 0.02
soma = h.Section(name="soma")
soma.nseg = 1; soma.diam = 96; soma.L = 96; soma.cm = 1; soma.Ra = 100
soma.insert("pas"); soma.e_pas = -70; soma.g_pas = 1e-4
soma.insert("hh2"); soma.ek = -100; soma.ena = 50
soma.vtraub_hh2 = -55; soma.gnabar_hh2 = 0.05; soma.gkbar_hh2 = 0.005
soma.insert("im"); h.taumax_im = 1000; soma.gkbar_im = 7e-5
h.celsius = 36
h.dt = DT; h.steps_per_ms = 1 / DT; h.secondorder = 0

vc = h.SEClamp(soma(0.5))
vc.dur1 = 1e9; vc.dur2 = 0; vc.dur3 = 0
ivec = h.Vector().record(vc._ref_i, SAMPLE)
vvec = h.Vector().record(soma(0.5)._ref_v, SAMPLE)

FAMILIES = {
    "act": dict(rs=0.001, hold=-80, segs=[(10, -80), (50, None), (20, -80)], vary=1, values=list(range(-80, 41, 10))),
    "act_rs2": dict(rs=2.0, hold=-80, segs=[(10, -80), (50, None), (20, -80)], vary=1, values=list(range(-80, 41, 10))),
    "inact": dict(rs=0.001, hold=-80, segs=[(10, -80), (100, None), (10, 0), (10, -80)], vary=1, values=list(range(-120, -9, 10))),
}


def run(fam, value):
    F = FAMILIES[fam]
    vc.rs = F["rs"]
    segs = [(d, value if v is None else v) for d, v in F["segs"]]
    # the command: hold through the settle, then each segment, then hold
    t, tv, vv = SETTLE, [0.0, SETTLE], [F["hold"], F["hold"]]
    for d, v in segs:
        tv += [t, t + d]; vv += [v, v]; t += d
    tv += [t, t + 1e6]; vv += [F["hold"], F["hold"]]
    tvec = h.Vector(tv); cvec = h.Vector(vv)
    cvec.play(vc._ref_amp1, tvec, 1)  # piecewise linear through the corner points: steps
    h.finitialize(F["hold"])
    h.continuerun(t)
    k0 = int(round(SETTLE / SAMPLE))
    i = [x * 1000 for x in ivec.as_numpy()[k0:]]
    v = list(vvec.as_numpy()[k0:])
    cvec.play_remove()
    return i, v, [d for d, _ in segs]


KEEP = 10  # every 10th sample (0.2 ms) is written; peaks are taken at full resolution first


def peaks(i, durs, seg):
    """Peak inward and outward current in a segment, skipping its first 0.2 ms (the capacitive step)."""
    t0 = sum(durs[:seg]) + 0.2
    t1 = sum(durs[:seg + 1])
    a, b = int(round(t0 / SAMPLE)), int(round(t1 / SAMPLE))
    lo = min(range(a, b + 1), key=lambda j: i[j]); hi = max(range(a, b + 1), key=lambda j: i[j])
    return {"peakIn": round(i[lo], 3), "tIn": round(lo * SAMPLE, 3), "peakOut": round(i[hi], 3), "tOut": round(hi * SAMPLE, 3)}


commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip() or "unknown"
out = {"source": "ModelDB 123623 (github.com/ModelDBRepository/123623)", "commit": commit, "neuron": h.nrnversion(5),
       "dt": DT, "settle": SETTLE, "sampleMs": SAMPLE * KEEP, "peakSampleMs": SAMPLE, "families": {}}
for fam, F in FAMILIES.items():
    sweeps = []
    for value in F["values"]:
        i, v, durs = run(fam, value)
        sw = {"value": value, "durs": durs, **{f"seg{s}": peaks(i, durs, s) for s in range(1, len(durs))},
              "i": [round(x, 2) for x in i[::KEEP]], "v": [round(x, 4) for x in v[::KEEP]]}
        sweeps.append(sw)
        print(fam, value, "i[0]", round(i[0], 3), "min", round(min(i)), "max", round(max(i)))
    out["families"][fam] = {"rs": F["rs"], "hold": F["hold"], "sweeps": sweeps}
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "core", "oracle", "neuron_vc_rs.json")
with open(dest, "w") as f: json.dump(out, f, separators=(",", ":"))
print("wrote", os.path.normpath(dest), os.path.getsize(dest), "bytes")
