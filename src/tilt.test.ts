import { describe, expect, it } from "vitest";
import { screenTilt, TiltInput } from "./tilt";

describe("tilt steering", () => {
  it("maps left and right for portrait and both landscape orientations", () => {
    expect(screenTilt(0, 20, 0)).toBeCloseTo(20);
    expect(screenTilt(0, -20, 0)).toBeCloseTo(-20);
    expect(screenTilt(20, 0, 90)).toBeCloseTo(20);
    expect(screenTilt(20, 0, 270)).toBeCloseTo(-20);
    expect(screenTilt(0, 20, 180)).toBeCloseTo(-20);
  });

  it("calibrates the initial grip, ignores tremor and smooths bounded steering", () => {
    const input = new TiltInput();
    input.sample(0, 15, 0, 0);
    expect(input.steer(0)).toBe(0);
    input.sample(0, 17, 0, 20);
    expect(input.steer(20)).toBe(0);
    input.sample(0, 45, 0, 40);
    expect(input.steer(40)).toBeGreaterThan(0);
    expect(input.steer(40)).toBeLessThan(1);
    for (let time = 60; time <= 1000; time += 20) input.sample(0, 45, 0, time);
    expect(input.steer(1000)).toBeCloseTo(1);
  });

  it("releases stale input and recalibrates after an interruption", () => {
    const input = new TiltInput();
    input.sample(0, 0, 0, 0);
    input.sample(0, -25, 0, 100);
    expect(input.steer(100)).toBeLessThan(0);
    expect(input.steer(601)).toBe(0);
    input.reset();
    input.sample(30, 0, 90, 1000);
    expect(input.steer(1000)).toBe(0);
  });

  it("ignores absent and invalid sensor readings", () => {
    const input = new TiltInput();
    expect(input.sample(null, 0, 0, 0)).toBe(false);
    expect(input.sample(0, NaN, 0, 0)).toBe(false);
    expect(input.sample(Infinity, 0, 0, 0)).toBe(false);
    expect(input.steer(0)).toBe(0);
  });

  it("crosses the angle boundary without reversing steering", () => {
    const input = new TiltInput();
    input.sample(170, 0, 90, 0);
    input.sample(-175, 0, 90, 100);
    expect(input.steer(100)).toBeGreaterThan(0);
  });
});
