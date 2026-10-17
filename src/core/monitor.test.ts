import { describe, expect, it } from "vitest";
import { hissGain, pitchTrack, TONE_F_HI, TONE_F_LO, vmToPitch } from "./monitor.ts";
import { DEFAULT_NOISE } from "./noise.ts";

describe("audio monitor arithmetic", () => {
  it("pitch spans four octaves over −90…+40 mV, equal mV giving equal intervals, clamped outside", () => {
    expect(vmToPitch(-90)).toBeCloseTo(TONE_F_LO, 6);
    expect(vmToPitch(40)).toBeCloseTo(TONE_F_HI, 6);
    expect(vmToPitch(-25)).toBeCloseTo(800, 6); // halfway in voltage is two octaves up
    expect(vmToPitch(-200)).toBe(TONE_F_LO);
    expect(vmToPitch(100)).toBe(TONE_F_HI);
    expect(vmToPitch(-60) / vmToPitch(-70)).toBeCloseTo(vmToPitch(-30) / vmToPitch(-40), 9);
  });

  it("a 1 ms spike is not averaged away: a bin holding one takes its peak", () => {
    const dt = 0.05;
    const vm = Float32Array.from({ length: 200 }, (_, i) => (i >= 50 && i < 70 ? 30 : -70)); // 1 ms at +30 mV
    const track = pitchTrack(vm, 0, dt, 2);
    expect(track.length).toBe(5);
    expect(Math.max(...track.map((p) => p.f))).toBeCloseTo(vmToPitch(30), 6);
    expect(track[0].f).toBeCloseTo(vmToPitch(-70), 6);
    expect(track[1].t).toBeCloseTo(2, 9);
  });

  it("hiss follows the recording noise, silent without it, full at 1 mV RMS", () => {
    expect(hissGain(undefined)).toBe(0);
    expect(hissGain({ ...DEFAULT_NOISE, recSigma: 0 })).toBe(0);
    expect(hissGain({ ...DEFAULT_NOISE, recSigma: 0.2 })).toBeCloseTo(0.2, 9);
    expect(hissGain({ ...DEFAULT_NOISE, recSigma: 3 })).toBe(1);
  });
});
