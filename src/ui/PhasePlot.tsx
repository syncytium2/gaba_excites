/**
 * Phase plot: dV/dt against V for one sweep. The kink where the trajectory
 * leaves the subthreshold cluster is spike threshold; the dashed line marks
 * the 20 V/s criterion the analysis uses to measure it.
 */
import { THRESH_DVDT } from "../core/analysis.ts";

interface Props {
  vm: Float32Array;
  dt: number;
  color: string;
}

const W = 360;
const H = 260;
const M = { l: 48, r: 10, t: 10, b: 36 };

export function PhasePlot({ vm, dt, color }: Props) {
  const n = vm.length;
  let vMin = Infinity, vMax = -Infinity, dMin = Infinity, dMax = -Infinity;
  const d = new Float32Array(n);
  for (let i = 1; i < n - 1; i++) {
    d[i] = (vm[i + 1] - vm[i - 1]) / (2 * dt);
    if (vm[i] < vMin) vMin = vm[i];
    if (vm[i] > vMax) vMax = vm[i];
    if (d[i] < dMin) dMin = d[i];
    if (d[i] > dMax) dMax = d[i];
  }
  vMin = Math.min(vMin, -80);
  vMax = Math.max(vMax, 0);
  dMin = Math.min(dMin, -10);
  dMax = Math.max(dMax, 40);
  const x = (v: number) => M.l + ((v - vMin) / (vMax - vMin)) * (W - M.l - M.r);
  const y = (g: number) => H - M.b - ((g - dMin) / (dMax - dMin)) * (H - M.t - M.b);

  let path = "";
  let lx = NaN, ly = NaN;
  for (let i = 1; i < n - 1; i++) {
    const px = x(vm[i]), py = y(d[i]);
    // drop points that would land on the previous pixel: the subthreshold
    // cluster is thousands of samples deep and draws as one
    if (Math.abs(px - lx) < 0.4 && Math.abs(py - ly) < 0.4) continue;
    path += (path ? "L" : "M") + px.toFixed(1) + "," + py.toFixed(1);
    lx = px;
    ly = py;
  }

  const vTicks = ticks(vMin, vMax, 5);
  const dTicks = ticks(dMin, dMax, 5);
  return (
    <svg className="phase" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Phase plot of dV/dt against membrane potential for the selected sweep">
      {dTicks.map((t) => (
        <g key={"d" + t}>
          <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? "axis" : "grid"} />
          <text x={M.l - 6} y={y(t) + 4} textAnchor="end" className="tick">{t}</text>
        </g>
      ))}
      {vTicks.map((t) => (
        <g key={"v" + t}>
          <line x1={x(t)} x2={x(t)} y1={M.t} y2={H - M.b} className="grid" />
          <text x={x(t)} y={H - M.b + 16} textAnchor="middle" className="tick">{t}</text>
        </g>
      ))}
      <line x1={M.l} x2={W - M.r} y1={y(THRESH_DVDT)} y2={y(THRESH_DVDT)} className="crit" />
      <text x={W - M.r - 4} y={y(THRESH_DVDT) - 4} textAnchor="end" className="tick">{THRESH_DVDT} V/s</text>
      <path d={path} fill="none" stroke={color} strokeWidth={1.25} />
      <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" className="axlabel">Vm (mV)</text>
      <text transform={`translate(12 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" className="axlabel">dV/dt (V/s)</text>
    </svg>
  );
}

function ticks(lo: number, hi: number, n: number): number[] {
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(Math.round(t));
  return out;
}
