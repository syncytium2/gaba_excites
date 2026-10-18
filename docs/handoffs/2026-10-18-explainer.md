# Handoff 2026-10-18: a simple explainer, built from Tony's text

**Written by the session that built the leak control, the oscilloscope, the fast-spiking cell, the siren and Old school
(2026-09-23 to 2026-10-18).** Runs in parallel with
[`2026-10-18-channel-editor.md`](2026-10-18-channel-editor.md). Read its Coordination section too.

## The task

Outside feedback says the site needs **a simple explainer, so that anyone can play with it**. That includes people who
are not Physiol 578 students and have no electrophysiology.

**The hard rule: the explainer starts from Tony's text.** He is writing it now. Do not draft prose of your own, write
section text "to get started", or invent the structure and fill it in. Your first move is to ask Tony where his text is
(a file, a paste, a document) and whether it is final or a draft. Until it arrives, do only the preparation below. When
it arrives, his words are the spine. Your job is to:

- put it on the page;
- make the "try it" links work;
- check every factual claim against the simulator and its tests;
- suggest edits, clearly marked, and never silently rewrite.

He decides what stays.

## Preparation you may do before the text arrives

- Read `README.md`, `public/methods.html`, `src/core/protocol.ts` (the presets and their notes) and `AGENTS.md`, and use
  the live site at https://gaba.tonydefazio.com. Know every control and what it does, so you can check his text.
- Work out how a "try it" link would open the app in a given state. That needs **settings encoded in the URL**, which is
  listed under "Later" in `docs/roadmap.md`. See Coordination before writing it.
- Look at how `public/methods.html` is built and served (a static page, the strict CSP, no outside requests) and how
  `public/llms.txt` summarizes the site. An explainer page is most likely `public/explainer.html`, done the same way.
- Do **not** commit a skeleton with placeholder prose.

## Where it goes, and how it is checked

- **Most likely a static page,** `public/explainer.html` (`/explainer`), linked from the app header next to "Methods &
  models". Ask Tony if he pictures something else, such as an in-app guided tour.
- **Every number** in it must be one the tests already pin, or one you measure with `node scripts/fi.ts` (the CLI runs
  the same model). Never quote a number from memory. The numbers already pinned include:
  - the GABA crossover (`src/core/gaba.test.ts`);
  - the fast-spiking cell (`src/core/fs.test.ts`);
  - the GnRH Fig. 7F counts (`src/core/gnrh.test.ts`);
  - the siren limits (`src/core/extremes.test.ts`).
- **Any claim from a paper** needs an entry in `lit/sources.json`, then `node scripts/lit.ts` (`src/lit.test.ts` fails
  otherwise). See AGENTS.md.
- **Before publishing,** offer Tony a murderboard review (`~/Developer/murderboard`, an adversarial review process for
  documents). An explainer full of claims is what it is for.
- Run `node scripts/screenshot.mjs <url> <outdir>` after any UI change, and look at the screenshots.
- **House style:** "data" is plural. Name things instead of pointing at "step 4". American English on all of Tony's
  sites.

## What the site is now (all live, deployed 2026-10-17, worker version a536318a)

- **Three cells:**
  - the Pospischil 2008 pyramidal cell, checked against NEURON;
  - the Pospischil fast-spiking interneuron, checked against NEURON;
  - the Adams 2018 GnRH neuron, checked against the paper's reported numbers, since it has no code oracle.
- **Two modes:**
  - **Step protocol:** families of current steps, giving F–I, rheobase, threshold, AP peak and half-width, measured Rin,
    and a phase plot.
  - **Oscilloscope:** the cell runs continuously and every control is live. It has pulses, Store and overlay, triggered
    sweeps, and an audio monitor (hiss and pop, or a tone that follows Vm).
- **Old school** is a switch in scope mode: a green phosphor screen, knurled knobs and analog meters.
- **The leak control is gL in nS.** Rin is measured, never set. Nothing but the slider moves gL (Tony's rule: channel
  edits must not adjust it).
- **The siren** blinks when the model is driven past what a real cell would do: spike failure, Vm beyond the reversal
  potentials, or current more than 10× rheobase.
- **Not yet confirmed:** Tony was testing the sound by ear on 2026-10-18. Ask whether it sounded right.

## Material Tony pointed to (useful for checking, not for writing)

- **Course baseline:** students arrive from Tony's 578 lectures ("Voltage-gated ion channels" and "Excitability: APs and
  propagation"), and earlier years had Lopatin's exam questions. Those questions test one mechanism at a time (what
  repolarizes the AP, what doubling gNa does, how a Na⁺ V½ shift moves threshold). Tony's view: "this web app enables
  far more discussion than is present" in those lectures. The course folders in his Dropbox contain student exams and
  grades. **Never open student files.**
- **Teaching material established in the last sessions, which his text may draw on:**
  - **Threshold belongs to Na⁺.** Kress, Dowling, Eisenman & Mennerick 2010, Hippocampus 20:558,
    doi:10.1002/hipo.20667, a free NIH manuscript: intracellular TEA, with a bias current to restore resting potential,
    left voltage threshold unchanged and changed rheobase, and gave very wide APs. Our three models reproduce it (see
    the channel-editor handoff).
  - **Excitability has more than one definition:** voltage threshold and rheobase are the two primary measures, in Kress
    et al.'s words, and they can disagree. The GABA presets already show a disagreement: GABA at −60 mV depolarizes the
    cell yet raises rheobase.
  - **The papers may disagree:** DeFazio & Moenter 2002 (Mol Endocrinol 16:2255, doi:10.1210/me.2002-0155) report that
    estradiol lowers GnRH threshold and latency through I_A. Adams 2018, our GnRH model, found no estradiol effect on
    either, and explains it with compensation between g_A and I_A inactivation V½. Time of day may reconcile them. The
    2002 PDF is not in hand yet: it is on Tony's literature want-list.
- **Literature tool:** `~/Developer/murderboard/fetch_paper.py`, with `MURDERBOARD_LIT` set to the `01-lit` folder of
  Tony's Dropbox (find the root in `~/.dropbox/info.json`; never write that path into this public repo). Run
  `--have <keywords>` first. Recently filed there: Kress 2010, Tyzio 2003 and 2008, Perkins 2006, Verheugen 1999 (on
  on-cell Vm measurement).

## Coordination with the channel-editor session

- **You own:**
  - `public/explainer.html`;
  - the header link to it;
  - URL-encoded settings (deep links), if Tony wants "try it" links. Put that code in its own module, for example
    `src/urlstate.ts`, with the smallest possible hook into `src/App.tsx`.
- **The channel-editor session owns** `src/core/channels.ts`, `src/core/cell.ts`, `src/core/models.ts` and a new channel
  panel. It also edits `src/App.tsx`. Keep your App.tsx changes small, and merge or rebase onto main before you finish.
  If deep links must encode channel edits, coordinate the format with that session, or leave edits out of version one.
- **Worktrees, always:** `git worktree add ../gaba_excites-worktrees/<slug> -b <slug>`. Never `git add -A`. The primary
  checkout stays on main.
- **Deploy only with `npm run deploy`, only from main, and only after asking Tony.** One deploy at a time. Check
  `DEPLOYED.md` first, and give Tony the rollback command with the previous worker version.

## Small fixes still open (see `docs/roadmap.md`)

- **The first-sample dip:** the first recorded sample dips when a step starts at 0 ms.
- **The sample rate:** `src/core/simulate.ts` says "40 kHz storage", but with dt 0.01 ms and sampleMs 0.025 the sweep
  is stored every 3 steps, 0.03 ms, which is 33 kHz. Measurements use each sweep's true sampleMs, so nothing is wrong
  except the comment and any doc that repeats it.
