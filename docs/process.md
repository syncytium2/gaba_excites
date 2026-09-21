# Process log

How this repository was built, in order, including the decisions and the
reasons for them. It is written as we go, not reconstructed afterward.
Newest entries at the bottom. Times are local (America/Detroit).

## 2026-09-21 — the brief

The owner asked for a web simulator that demonstrates excitability:

- a standard model of cortical pyramidal action-potential firing, in the
  Hodgkin–Huxley formulation;
- controls for passive properties: Rin, Cm, Rs, Ihold;
- current clamp only, to begin with;
- an interface flexible enough to run a series of current steps, so that it
  shows threshold and the F–I curve;
- GABA and glutamate PSCs, each with frequency, amplitude and tau; GABA
  Erev is a variable, default −80 mV;
- light enough to run locally in the browser; a repo, a webapp, and in the
  end a site under tonydefazio.com;
- templates from the owner's `no_peak` and `colonel_kernel` repos.

Added while work was under way: name it **gaba_excites**; make it a **public
repo from the first push**; **document the process** (this file); **stock
channels only for now**, with plug-and-play channels and a channel editor in a
later version; **mark the born-on date and time** in the app.
