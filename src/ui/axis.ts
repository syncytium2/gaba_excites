import type uPlot from "uplot";
import type { ChartColors } from "./palette.ts";

/** One axis in the app's chart style, for either palette. */
export function axisOpts(pal: ChartColors, label: string, size = 50): uPlot.Axis {
  return {
    label,
    stroke: pal.ink2,
    size,
    labelSize: 18,
    font: "11px system-ui, -apple-system, sans-serif",
    labelFont: "12px system-ui, -apple-system, sans-serif",
    grid: { stroke: pal.grid, width: 1 },
    ticks: { stroke: pal.axis, width: 1, size: 4 },
  };
}
