import { describe, expect, it } from "vitest";
import { ampsKey, stepDirection, stepTo } from "./step";

// a stand-in for the element a key went to (the tests run without a DOM)
const el = (tagName: string, role?: string, editable = false) =>
  ({ tagName, isContentEditable: editable, getAttribute: (n: string) => (n === "role" ? role ?? null : null) }) as unknown as EventTarget;

describe("stepping by hand", () => {
  it("steps on the keys a presentation clicker sends", () => {
    expect(stepDirection("PageDown", {}, null)).toBe(1);
    expect(stepDirection("ArrowRight", {}, el("BODY"))).toBe(1);
    expect(stepDirection("PageUp", {}, el("BUTTON"))).toBe(-1);
    expect(stepDirection("ArrowLeft", {}, null)).toBe(-1);
    expect(stepDirection("ArrowDown", {}, null)).toBe(0);
    expect(stepDirection(" ", {}, null)).toBe(0);
  });

  it("leaves the keys to a control that uses them, and to shortcuts", () => {
    expect(stepDirection("ArrowRight", {}, el("INPUT"))).toBe(0);
    expect(stepDirection("ArrowRight", {}, el("SELECT"))).toBe(0);
    expect(stepDirection("ArrowRight", {}, el("TEXTAREA"))).toBe(0);
    expect(stepDirection("ArrowRight", {}, el("DIV", "slider"))).toBe(0);
    expect(stepDirection("ArrowRight", {}, el("DIV", "spinbutton"))).toBe(0);
    // the segmented buttons (Zoom / Measure) do not use the arrows: a clicker still steps after one is pressed
    expect(stepDirection("ArrowRight", {}, el("BUTTON", "radio"))).toBe(1);
    expect(stepDirection("ArrowRight", {}, el("DIV", undefined, true))).toBe(0);
    expect(stepDirection("ArrowRight", { meta: true }, null)).toBe(0);
    expect(stepDirection("PageDown", { shift: true }, null)).toBe(0);
  });

  it("stays within the family", () => {
    expect(stepTo(1, -1, 8)).toBe(1);
    expect(stepTo(8, 1, 8)).toBe(8);
    expect(stepTo(3, 1, 8)).toBe(4);
    expect(stepTo(9, 0, 5)).toBe(5);
    expect(stepTo(1, 1, 0)).toBe(1);
  });

  it("keys a family by its amplitudes, in any order", () => {
    expect(ampsKey([100, -50, 0])).toBe(ampsKey([-50, 0, 100]));
    expect(ampsKey([100, 0])).not.toBe(ampsKey([100, 50]));
  });
});
