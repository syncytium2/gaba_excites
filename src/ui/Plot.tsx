import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

interface Props {
  /** builds the options for a given width; called again on resize */
  options: (width: number) => uPlot.Options;
  data: uPlot.AlignedData;
  className?: string;
  /** recreate the chart when this changes (series count, colors…) */
  deps: unknown[];
  /** new data keep the current zoom instead of autoscaling (a zoomed view's data refined in place) */
  keepScales?: boolean;
}

/** Thin uPlot wrapper: recreate on structural change, setData otherwise, resize with the container. */
export function Plot({ options, data, className, deps, keepScales }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);

  useEffect(() => {
    const el = box.current!;
    const u = new uPlot(options(el.clientWidth || 600), data, el);
    chart.current = u;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0 && Math.abs(w - u.width) > 1) u.setSize({ width: w, height: u.height });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const u = chart.current;
    if (!u) return;
    if (!keepScales) {
      u.setData(data);
      return;
    }
    // new data under the same zoom: setData without rescaling keeps the old visible index range, so the x range is
    // set again to have uPlot find which samples it now covers
    const { min, max } = u.scales.x;
    u.setData(data, false);
    if (min != null && max != null) u.setScale("x", { min, max });
  }, [data]);

  return <div ref={box} className={className} />;
}
