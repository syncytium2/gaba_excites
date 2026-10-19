# Plan: a way in for someone with no background

Status: **proposed, 2026-10-18. Nothing is built.** Tony approves this before work starts.

The reader is someone who has never heard of an action potential, such as a non-scientist CTO. They should be able to
open the site, learn in under a minute what it is, and have somewhere to go for more.

## The pieces

| piece | what it holds | how you reach it | who writes the words |
|---|---|---|---|
| **"Start here" button** | nothing but the button | the app header, next to "Methods & models" | — |
| **Start-here pop-up** | about 100 words: what this is, why it matters, what to click first; three or four links | the button | Tony |
| **Explainer page** `/explainer` | Tony's draft, now `docs/first draft explainer.docx` | "Read more" in the pop-up | Tony |
| **Glossary page** `/glossary` | each term: one-sentence definition, a longer one, outside links | a hover on a marked term, or a click | Tony, or suggestions he approves |
| **Outside links** | the best existing treatments | the pop-up and the glossary | chosen by Tony from the search |

**The button** blinks until it has been opened once, then stays still. With reduced motion it never blinks. It uses a
calm color, not the siren's red, so it does not read as a warning. It works the same in Old school mode.

**The pop-up** opens over the app and closes with Escape, a click outside it, or a close button. It traps keyboard
focus while open and returns it to the button. At phone width it fills the screen.

**The glossary** has one source file, for example `glossary/terms.json`, and a script that renders it to
`public/glossary.html`, with a test that fails when the page is stale. This copies how `lit/sources.json` makes `/lit`.
The app reads the same file for its hovers, so a definition cannot say two things in two places. A test also fails if
the app marks a term the glossary does not have.

**A marked term** has a dotted underline. With a mouse, hovering shows the short definition and a click opens
`/glossary#term`. On a phone, a tap shows the definition with a "More in the glossary" link inside it. From the
keyboard, focus shows it and Enter follows the link. It is built on the existing tooltip, `src/ui/Tip.tsx`.

## Order of work

1. **The button and the pop-up**, with Tony's 100 words. It is the smallest piece, and it is the one the outside
   feedback asked for.
2. **The explainer page**, from Tony's draft, once he calls it final. A static page like `public/methods.html`.
3. **The glossary page and hovers.** Terms a newcomer meets first: current clamp, Vm, pA, step, sweep, spike, F–I
   curve, rheobase, threshold. Then the synapse panels: glutamate, GABA, conductance, reversal potential, shunting,
   depolarizing, hyperpolarizing. The electrode panel and the readouts come last.
4. **"Try it" links**, which open the app in a set state from a URL. Later, in `src/urlstate.ts`.

Each step ships on its own. None depends on a later one.

## What Tony supplies

- The pop-up's text, about 100 words.
- Word that the draft is final, or the next version of it.
- A yes or no on each glossary definition.
- Which outside links to use. The candidates, from a search on 2026-10-18:
  - **To look at first:** PhET's Neuron simulation (University of Colorado). Bezanilla's *The Nerve Impulse* and his
    NERVE simulators (nerve.bsd.uchicago.edu).
  - **To read seriously:** Bean 2007, Nat Rev Neurosci 8:451, doi:10.1038/nrn2148 (paywalled). *Neuroscience Online*
    (UTHealth, free).
  - **On GABA exciting a cell:** nothing accessible was found except Wikipedia's GABA article. That is a gap the site's
    own pages could fill.

## Checks before anything ships

- Every number on these pages is one the tests already pin, or one measured with `node scripts/fi.ts`.
- Every claim taken from a paper has an entry in `lit/sources.json`.
- `node scripts/screenshot.mjs` after each UI change: no console errors, no third-party requests, no overflow at phone
  width. The screenshots go to the darkroom.
- The outside links are links only. Nothing is loaded from another site, so the CSP is unchanged.
- A murderboard review of the explainer and glossary text, if Tony wants it, before deploy.
- Deploy only with `npm run deploy`, from main, after Tony says so.

## Still open

- **The EEG sentence** rests on the abstract of Buzsáki, Anastassiou & Koch 2012 until the full review is filed. It is
  on Tony's want-list.
- **The app's own wording** uses "depolarizing" and "hyperpolarizing" in about eight places. The draft now says those
  words are used, and the glossary will define them. Changing the labels themselves is not part of this plan.

## Coordination

- This work owns the header button, the pop-up, `public/explainer.html`, the glossary source, script, page and test,
  and later `src/urlstate.ts`.
- The channel-editor session (`mac gaba 1`) is adding a Report card at the end of the step-mode results. It stays out
  of the header. Its labels are plain strings for the glossary to mark later. Each of us rebases onto main before
  merging and says so first.
