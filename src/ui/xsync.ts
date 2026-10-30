import type uPlot from "uplot";

/**
 * Plots stacked over one time axis share their x range: a zoom (or the double-click reset) on any of them
 * moves them all. Each plot keeps its own y. The current x range is also written to the plot's root as
 * data-x="min,max", so a check can see that the plots agree without reaching into uPlot.
 */
export function xSyncGroup(): uPlot.Hooks.Arrays {
  const plots = new Set<uPlot>();
  let busy = false;
  const mark = (u: uPlot) => {
    const { min, max } = u.scales.x;
    if (min != null && max != null) u.root.dataset.x = `${+min.toFixed(6)},${+max.toFixed(6)}`;
  };
  return {
    ready: [
      (u) => {
        // a plot rebuilt on its own (a measurement window moved) takes up the zoom the others are at
        const other = [...plots].find((p) => p !== u);
        plots.add(u);
        const { min, max } = other?.scales.x ?? {};
        if (min != null && max != null) u.setScale("x", { min, max });
        mark(u);
      },
    ],
    destroy: [(u) => void plots.delete(u)],
    setScale: [
      (u, key) => {
        if (key !== "x") return;
        mark(u);
        if (busy) return;
        const { min, max } = u.scales.x;
        if (min == null || max == null) return;
        busy = true;
        try {
          for (const p of plots) if (p !== u && (p.scales.x.min !== min || p.scales.x.max !== max)) p.setScale("x", { min, max });
        } finally {
          busy = false;
        }
      },
    ],
  };
}

/** Hook arrays merged, so a plot can carry the group's hooks beside its own. */
export function mergeHooks(...hs: (uPlot.Hooks.Arrays | undefined)[]): uPlot.Hooks.Arrays {
  const out: Record<string, unknown[]> = {};
  for (const h of hs) for (const [k, v] of Object.entries(h ?? {})) out[k] = [...(out[k] ?? []), ...((v as unknown[]) ?? [])];
  return out as uPlot.Hooks.Arrays;
}
