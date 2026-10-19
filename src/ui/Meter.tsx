import { useEffect, useRef, useState } from "react";

/**
 * An analog panel meter. The needle has ballistics: a damped spring (ζ 0.6,
 * natural frequency 1.2 Hz) chasing the value, so it overshoots a little and
 * smooths what it shows, the way a moving-coil meter averages. That is worth
 * noticing: an analog rate meter is a low-pass filter. With reduced motion the
 * needle goes straight to the value. Past either end it pins against the stop.
 */
export function Meter({ label, unit, value, min, max, major, minor = 5, sub }: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  /** values at which to draw labeled ticks */
  major: number[];
  /** minor ticks between majors */
  minor?: number;
  sub?: React.ReactNode;
}) {
  // the needle sweeps 100°, centered on vertical; a little past each end is the stop
  const A = 50;
  const toAngle = (v: number) => -A + (2 * A * (v - min)) / (max - min);
  const target = Number.isFinite(value) ? Math.max(-A - 4, Math.min(A + 4, toAngle(value))) : -A - 4;
  const [angle, setAngle] = useState(target);
  const st = useRef({ x: target, v: 0, target });
  st.current.target = target;

  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      st.current.x = st.current.target;
      setAngle(st.current.target);
      return;
    }
    const zeta = 0.6, wn = 2 * Math.PI * 1.2;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      const s = st.current;
      const a = wn * wn * (s.target - s.x) - 2 * zeta * wn * s.v;
      s.v += a * dt;
      s.x += s.v * dt;
      // the stops
      if (s.x > A + 4) { s.x = A + 4; s.v = 0; }
      if (s.x < -A - 4) { s.x = -A - 4; s.v = 0; }
      if (Math.abs(s.x - angle) > 0.05) setAngle(s.x);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const R = 64; // scale radius; pivot at (0, 0), face spans y from −80 to 12
  const pt = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  const ticks: { v: number; major: boolean }[] = [];
  for (let i = 0; i < major.length; i++) {
    ticks.push({ v: major[i], major: true });
    if (i + 1 < major.length) for (let m = 1; m < minor; m++) ticks.push({ v: major[i] + ((major[i + 1] - major[i]) * m) / minor, major: false });
  }
  const shown = Number.isFinite(value) ? `${value.toFixed(Math.abs(value) < 10 ? 1 : 0)} ${unit}` : `no reading`;
  return (
    <figure className="meter" role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={max}
      aria-valuenow={Number.isFinite(value) ? value : undefined} aria-valuetext={shown}>
      <svg viewBox="-82 -84 164 100" aria-hidden="true">
        <rect className="m-face" x="-80" y="-82" width="160" height="96" rx="4" />
        <path className="m-arc" d={`M ${pt(-A, R).join(" ")} A ${R} ${R} 0 0 1 ${pt(A, R).join(" ")}`} />
        {ticks.map((t, i) => {
          const d = toAngle(t.v);
          const [x1, y1] = pt(d, R);
          const [x2, y2] = pt(d, t.major ? R + 7 : R + 4);
          return <line key={i} className={t.major ? "m-major" : "m-minor"} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
        {major.map((v) => {
          const [x, y] = pt(toAngle(v), R - 9);
          return <text key={v} className="m-num" x={x} y={y + 3}>{v}</text>;
        })}
        <text className="m-unit" x="0" y="-26">{unit}</text>
        <g transform={`rotate(${angle})`}>
          <line className="m-needle" x1="0" y1="6" x2="0" y2={-R - 3} />
        </g>
        <circle className="m-pivot" r="4.5" />
      </svg>
      <figcaption className="m-sub"><b>{label}</b>{sub}</figcaption>
    </figure>
  );
}

/**
 * A horizontal (edgewise) panel meter: a straight scale and a needle that slides
 * along it, short enough to sit in a row of readouts. Same ballistics as Meter:
 * a damped spring chasing the value, pinned at the stops, and no motion with
 * reduced motion.
 */
export function HMeter({ label, unit, value, min, max, major, minor = 5 }: {
  label: string; unit: string; value: number; min: number; max: number; major: number[]; minor?: number;
}) {
  const W = 200, L = 14, Rr = 186; // scale from x=L to x=Rr
  const toX = (v: number) => L + ((Rr - L) * (v - min)) / (max - min);
  const target = Number.isFinite(value) ? Math.max(L - 5, Math.min(Rr + 5, toX(value))) : L - 5;
  const [x, setX] = useState(target);
  const st = useRef({ x: target, v: 0, target });
  st.current.target = target;
  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      st.current.x = st.current.target;
      setX(st.current.target);
      return;
    }
    const zeta = 0.6, wn = 2 * Math.PI * 1.2;
    let raf = 0, last = 0, shown = target;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      const s = st.current;
      const a = wn * wn * (s.target - s.x) - 2 * zeta * wn * s.v;
      s.v += a * dt;
      s.x += s.v * dt;
      if (s.x > Rr + 5) { s.x = Rr + 5; s.v = 0; }
      if (s.x < L - 5) { s.x = L - 5; s.v = 0; }
      if (Math.abs(s.x - shown) > 0.05) { shown = s.x; setX(s.x); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ticks: { v: number; major: boolean }[] = [];
  for (let i = 0; i < major.length; i++) {
    ticks.push({ v: major[i], major: true });
    if (i + 1 < major.length) for (let m = 1; m < minor; m++) ticks.push({ v: major[i] + ((major[i + 1] - major[i]) * m) / minor, major: false });
  }
  const shownText = Number.isFinite(value) ? `${value.toFixed(Math.abs(value) < 10 ? 1 : 0)} ${unit}` : "no reading";
  return (
    <figure className="hmeter" role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={max}
      aria-valuenow={Number.isFinite(value) ? value : undefined} aria-valuetext={shownText}>
      <svg viewBox={`0 0 ${W} 40`} aria-hidden="true">
        <rect className="m-face" x="1" y="1" width={W - 2} height="38" rx="3" />
        <line className="m-arc" x1={L} y1={26} x2={Rr} y2={26} />
        {ticks.map((t, i) => (
          <line key={i} className={t.major ? "m-major" : "m-minor"} x1={toX(t.v)} y1={26} x2={toX(t.v)} y2={t.major ? 19 : 22} />
        ))}
        {major.map((v) => <text key={v} className="m-num" x={toX(v)} y={15}>{v}</text>)}
        <text className="hm-label" x={L} y={36}>{label}</text>
        <text className="hm-unit" x={Rr} y={36}>{unit}</text>
        <line className="m-needle" x1={x} y1={5} x2={x} y2={35} />
      </svg>
    </figure>
  );
}
