/**
 * Igor-style marquee zoom: drag a marquee, click inside it, choose what to do.
 * The arithmetic, kept apart from the plot so it can be tested.
 *
 *   Expand   the marquee becomes the whole view
 *   Shrink   the whole view is squeezed into the marquee (the inverse of Expand)
 *   Horiz / Vert   the same along one axis only
 */
export type Range = [number, number];
export type ZoomOp = "expand" | "hexpand" | "vexpand" | "shrink" | "hshrink" | "vshrink";

export const ZOOM_MENU: readonly (readonly [ZoomOp, string])[] = [
  ["expand", "Expand"],
  ["hexpand", "Horiz Expand"],
  ["vexpand", "Vert Expand"],
  ["shrink", "Shrink"],
  ["hshrink", "Horiz Shrink"],
  ["vshrink", "Vert Shrink"],
];

const ordered = (r: Range): Range => (r[0] <= r[1] ? r : [r[1], r[0]]);

export function expand(_view: Range, sel: Range): Range {
  return ordered(sel);
}

/** The view after shrinking it into `sel`: what is now `view` will span `sel`. */
export function shrink(view: Range, sel: Range): Range {
  const [v0, v1] = ordered(view);
  const [s0, s1] = ordered(sel);
  const k = (v1 - v0) / (s1 - s0);
  return [v0 - (s0 - v0) * k, v1 + (v1 - s1) * k];
}

/** New x and y ranges for an operation; an axis the operation leaves alone is undefined. */
export function applyZoom(op: ZoomOp, view: { x: Range; y: Range }, sel: { x: Range; y: Range }): { x?: Range; y?: Range } {
  const f = op.endsWith("shrink") ? shrink : expand;
  const h = op === "expand" || op === "shrink" || op[0] === "h";
  const v = op === "expand" || op === "shrink" || op[0] === "v";
  return { x: h ? f(view.x, sel.x) : undefined, y: v ? f(view.y, sel.y) : undefined };
}
