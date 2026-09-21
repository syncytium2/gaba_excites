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
}

/** Thin uPlot wrapper: recreate on structural change, setData otherwise, resize with the container. */
export function Plot({ options, data, className, deps }: Props) {
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
    chart.current?.setData(data);
  }, [data]);

  return <div ref={box} className={className} />;
}
