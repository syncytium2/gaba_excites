# ADR 2026-11-04-f5f6: A step preset whose knobs have moved shows as Custom and keeps its note, marked

Status: Accepted, 2026-11-04

## Context

Some step presets set the cell's knobs as well as the protocol: the squid axon's "Warmed to 18.5 °C" sets the
temperature, and the human beta cell's "Picoamps steer its firing" sets K_ATP, GABA_A, SK and hERG. Their notes quote
spike counts measured at those values. Until 2026-11-03, moving one of those knobs, or choosing an oscilloscope
pattern that sets them, left the preset's name on the menu with numbers that no longer applied. The screenshot check
caught it on the human cell, and the overnight build of 2026-11-03 made the menu say Custom once a preset's knobs
move (`presetHolds`, `src/App.tsx`).

That raised a conflict. The squid preset's note ends "Turn the temperature control to watch it change", and doing so
would hide the note. It also turned up a separate gap: since 2026-10-19 (`7cabed8`, "One instrument in both modes")
the current-clamp step presets' notes had not been shown anywhere; the side panel that held them was removed and
nothing replaced it. Voltage clamp kept its notes as a tooltip on its preset menu.

Asked "Presets that set knobs … now switch to Custom once a student moves one of those knobs, so a note never quotes
numbers that no longer apply. But the squid note says 'Turn the temperature control to watch it change', and doing
that hides the note. How should this work?", the owner chose "Custom, keep note": the menu shows Custom, but the last
preset's note stays visible, marked as measured at other values.

## Decision

- The step preset menu carries its preset's note as a tooltip, as voltage clamp's does.
- When a knob the preset set has moved, the menu says Custom. Its tooltip names each moved knob with the preset's
  value and the current one ("Temperature 18.5 → 20 °C"), says the preset was measured at its own values, and gives
  its note for comparison.
- Changing the protocol itself (steps, durations, synaptic inputs, E_GABA) still drops the preset outright, as before:
  its note describes a protocol that is no longer running.

## Consequences

- Students see the step presets' notes again, which they had not since 2026-10-19.
- A note never stands as a claim about the current settings; once its knobs move it reads as a reference.

## Enforced by

- `scripts/screenshot.mjs`: on the human cell, after an oscilloscope pattern moves K_ATP, the step menu says Custom,
  and its tooltip says which knob moved and still carries "Picoamps steer its firing" and its note.

Unenforced: that the squid temperature case reads the same way (the check covers the human cell only).
