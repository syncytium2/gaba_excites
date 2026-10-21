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
// could name apart from its neighbor, and it does not try: the ramp encodes
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

/**
 * The step view's charts in Old school, on its dark enamel card (#2a2b27). Same
 * hues, stepped for the dark surface (the reference palette's dark column:
 * blue #3987e5, orange #d95926, aqua #199e70), validated as a set on #2a2b27,
 * all >= 3:1. The sweep ramp flips its anchor, as a sequential ramp does in
 * dark: small steps dim, near the surface, large steps bright. The same blue
 * steps as RAMP, reversed and starting at step 500; every other step passes
 * the ordinal check on #2a2b27, as the light ramp's do (docs/process.md).
 */
const RAMP_DARK = ["#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6", "#cde2fb"];

export interface ChartColors {
  name: "light" | "dark";
  /** axis labels and ticks text, grid lines, axis lines */
  ink2: string;
  grid: string;
  axis: string;
  muted: string;
  /** the chart surface, for the ring around markers */
  surface: string;
  blue: string;
  orange: string;
  aqua: string;
  ramp: readonly string[];
}

export const LIGHT_CHART: ChartColors = { name: "light", ink2: INK2, grid: GRID, axis: AXIS, muted: MUTED, surface: "#fcfcfb", blue: BLUE, orange: ORANGE, aqua: AQUA, ramp: RAMP };
// grid, axis and muted are Old school's own tokens (styles.css), so the plot sits in the card like the rest of it
export const DARK_CHART: ChartColors = { name: "dark", ink2: "#cfc8b6", grid: "#3b3c37", axis: "#5a5b53", muted: "#9d9786", surface: "#2a2b27", blue: "#3987e5", orange: "#d95926", aqua: "#199e70", ramp: RAMP_DARK };

/** Color for sweep k of n in a palette, ordered by amplitude rank. */
export function rampIn(c: ChartColors, rank: number, n: number): string {
  if (n <= 1) return c.ramp[5];
  return c.ramp[Math.round((rank / (n - 1)) * (c.ramp.length - 1))];
}
