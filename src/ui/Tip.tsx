import { useId } from "react";

/**
 * A hover (and focus, and tap) explanation. The trigger is focusable, so it
 * works from the keyboard and on touch screens, and the text is linked with
 * aria-describedby, so screen readers announce it. CSS shows it; no JS state.
 */
export function Tip({ children, text }: { children: React.ReactNode; text: React.ReactNode }) {
  const id = useId();
  return (
    <span className="tip" tabIndex={0} aria-describedby={id}>
      {children}
      <span className="tip-mark" aria-hidden="true">?</span>
      <span role="tooltip" id={id} className="tip-body">{text}</span>
    </span>
  );
}
