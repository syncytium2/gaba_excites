/**
 * The current units switch converts for display only; these pin the conversion
 * and the rounding the dials and readouts use.
 */
import { describe, expect, it } from "vitest";
import { currentUnit, niceStep, sig3 } from "./current.tsx";

describe("current units", () => {
  it("pA/pF is pA ÷ Cm, and back", () => {
    const u = currentUnit(true, 100);
    expect(u.label).toBe("pA/pF");
    expect(u.show(225)).toBe(2.25); // the squid axon's rheobase: 2.25 µA/cm²
    expect(u.toPA(2.25)).toBe(225);
    expect(u.text(225)).toBe("2.25 pA/pF");
    expect(u.fmt(-300)).toBe("−3");
  });
  it("pA mode leaves the number alone", () => {
    const u = currentUnit(false, 289.53);
    expect(u.show(561)).toBe(561);
    expect(u.toPA(561)).toBe(561);
    expect(u.text(561)).toBe("561 pA");
    expect(u.fmt(-6, 1)).toBe("−6.0");
  });
  it("density compares cells of different size", () => {
    // the pyramidal cell's 561 pA rheobase on its 289.53 pF soma, against the squid patch's 225 pA on 100 pF
    expect(currentUnit(true, 289.53).fmt(561)).toBe("1.94");
    expect(currentUnit(true, 100).fmt(225)).toBe("2.25");
  });
  it("rounds to three significant figures and round dial steps", () => {
    expect(sig3(0.034537)).toBe("0.0345");
    expect(sig3(12.4999)).toBe("12.5");
    expect(sig3(0)).toBe("0");
    expect(niceStep(10 / 289.53)).toBe(0.02);
    expect(niceStep(0.1)).toBe(0.1);
    expect(niceStep(5 / 141.03)).toBe(0.02);
  });
});
