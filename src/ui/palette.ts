/**
 * Chart colors. The same reference palette no_peak uses, so the sibling sites
 * read as one family. Validated with the dataviz skill's validate_palette.js
 * (light surface #fcfcfb); see docs/process.md.
 *
 * Roles:
 *   sweeps       sequential blue by step amplitude (steps 250 → 650)
 *   selected     categorical slot 2, orange — the one sweep you are looking at
 *   glutamate    categorical slot 2, orange   (never on the same chart as "selected")
 *   GABA         categorical slot 3, aqua — 2.7:1 on the surface, so it is always
 *                named in text beside the plot (the validator's relief rule)
 *   F–I mean     categorical slot 1, blue;  F–I initial: slot 2, orange
 *   pinned       secondary ink, dashed, direct-labeled — a reference, not a category
 */
export const INK = "#0b0b0b";
export const INK2 = "#52514e";
export const MUTED = "#898781";
export const GRID = "#e1e0d9";
export const AXIS = "#c3c2b7";

export const BLUE = "#2a78d6";
export const ORANGE = "#eb6834";
export const AQUA = "#1baf7a";

// Steps 250 → 650. A family of 13–40 sweeps cannot give every sweep a color you
// could name apart from its neighbour, and it does not try: the ramp encodes
// step amplitude as a continuous gradient (sequential), and a sweep's IDENTITY
// comes from hover, click-to-select and the table. Every other step (250, 350,
// 450, 550, 650) passes the validator's ordinal check; adjacent steps do not,
// by design. Step 700 was dropped: it sat too close to 650 to read as darker.
const RAMP = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281"];

/** Color for sweep k of n, ordered by amplitude rank. */
export function rampColor(rank: number, n: number): string {
  if (n <= 1) return RAMP[5];
  return RAMP[Math.round((rank / (n - 1)) * (RAMP.length - 1))];
}
