/**
 * Stepping through a family by hand, for teaching from the front of a room.
 * A presentation clicker sends Page Down / Page Up (some send the arrow keys),
 * so those step; nothing else does, and never while a control has the keys.
 */

/** +1, −1, or 0 for a key that does not step (or a key meant for a control). */
export function stepDirection(key: string, mods: { alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean }, target: EventTarget | null): -1 | 0 | 1 {
  if (mods.alt || mods.ctrl || mods.meta || mods.shift) return 0;
  if (ownsKeys(target)) return 0;
  if (key === "ArrowRight" || key === "PageDown") return 1;
  if (key === "ArrowLeft" || key === "PageUp") return -1;
  return 0;
}

/** A text field, a list or a knob uses the arrow keys itself. */
function ownsKeys(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.("role");
  // the knobs; the app's segmented buttons are role="radio" but leave the arrows alone, so the clicker still steps after one is pressed
  return role === "slider" || role === "spinbutton";
}

/** The next count of sweeps shown, kept within 1…n. */
export function stepTo(count: number, dir: -1 | 0 | 1, n: number): number {
  return Math.min(Math.max(1, count + dir), Math.max(1, n));
}

/** The amplitudes a family steps through, as a key: a run with the same key keeps its place. */
export function ampsKey(amps: number[]): string {
  return [...amps].sort((a, b) => a - b).join(",");
}
