import { useId } from "react";

/**
 * A readout tile: its name, value and unit on one line. The longer note shows
 * on hover, and on keyboard focus (the tile is focusable when it has one), and
 * is linked with aria-describedby so screen readers announce it. `action`
 * stays visible: a control or a result someone asked for, not an explanation.
 */
export function Tile({ label, value, unit, sub, action }: { label: string; value: string; unit: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  const id = useId();
  return (
    <div className={"tile" + (sub ? " has-tip" : "")} tabIndex={sub ? 0 : undefined} aria-describedby={sub ? id : undefined}>
      <span className="t-label">{label}</span>
      <span className="t-value">{value} <span className="t-unit">{unit}</span></span>
      {action && <span className="t-action">{action}</span>}
      {sub && <span role="tooltip" id={id} className="tip-body t-tip">{sub}</span>}
    </div>
  );
}
