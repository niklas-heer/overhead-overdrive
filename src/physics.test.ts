import { describe, expect, it } from "vitest";
import {
  collideAABB,
  collideCircle,
  createVehicle,
  FIXED_STEP,
  stepVehicle,
  type Input,
  type VehicleState,
} from "./physics";

const stock = { motor: 1, grip: 1, stability: 1 };
const idle: Input = { throttle: 0, steer: 0, brake: false, boost: false };
const accelerate: Input = { ...idle, throttle: 1 };
function run(s: VehicleState, seconds: number, input: Input = accelerate) {
  for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++)
    stepVehicle(s, input, FIXED_STEP, stock);
}

describe("projector dynamics", () => {
  it("is deterministic and independent of render frame grouping", () => {
    const a = createVehicle(0, 0, 0),
      b = createVehicle(0, 0, 0);
    const input = { ...accelerate, steer: 0.35 };
    run(a, 6, input);
    for (let i = 0; i < 360; i++) stepVehicle(b, input, 1 / 60, stock);
    expect(a).toEqual(b);
    for (const value of Object.values(a))
      if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  });

  it("accelerates forward to a drag-limited cruising speed and brakes", () => {
    const s = createVehicle(0, 0, 0);
    run(s, 20);
    expect(s.z).toBeGreaterThan(100);
    expect(s.speed).toBeGreaterThan(15);
    expect(s.speed).toBeLessThan(17);
    run(s, 2, { ...idle, brake: true });
    expect(s.speed).toBeLessThan(0.01);
  });

  it("opposite throttle brakes then selects reverse", () => {
    const s = createVehicle(0, 0, 0);
    run(s, 4);
    run(s, 0.3, { ...idle, throttle: -1 });
    expect(s.vz).toBeGreaterThan(0);
    expect(s.speed).toBeLessThan(9);
    run(s, 5, { ...idle, throttle: -1 });
    expect(s.vz).toBeLessThan(-5);
    expect(s.speed).toBeLessThan(7.5);
  });

  it("coasts down under rolling resistance and quadratic drag", () => {
    const s = createVehicle(0, 0, 0);
    run(s, 6);
    const before = s.speed;
    run(s, 1, idle);
    expect(s.speed).toBeLessThan(before - 3);
  });

  it("steers right and creates a slide during a handbrake turn", () => {
    const s = createVehicle(0, 0, 0);
    run(s, 4);
    run(s, 0.3, { ...accelerate, steer: 1 });
    expect(s.yaw).toBeLessThan(0);
    expect(s.x).toBeLessThan(0);
    run(s, 0.2, { ...idle, steer: 1, brake: true });
    expect(s.drifting).toBe(true);
    expect(Math.abs(s.roll)).toBeLessThanOrEqual(0.36);
    expect(Math.abs(s.pitch)).toBeLessThanOrEqual(0.27);
    expect(Math.abs(s.wobble)).toBeLessThanOrEqual(0.28);
  });

  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])(
    "steers to the driver's right/left when heading %s",
    (heading) => {
      // Chase-camera right is forward cross world-up: (-cos(yaw), sin(yaw)).
      const rightX = -Math.cos(heading),
        rightZ = Math.sin(heading);
      for (const steer of [-1, 1]) {
        const state = createVehicle(0, 0, heading);
        run(state, 1.5);
        const x = state.x,
          z = state.z;
        run(state, 0.4, { ...accelerate, steer });
        const sideways = (state.x - x) * rightX + (state.z - z) * rightZ;
        expect(sideways * steer).toBeGreaterThan(0.05);
      }
    },
  );

  it("boost adds speed, spends energy, warms the lamp, and recovers", () => {
    const normal = createVehicle(0, 0, 0),
      boosted = createVehicle(0, 0, 0);
    run(normal, 2);
    run(boosted, 2, { ...accelerate, boost: true });
    expect(boosted.speed).toBeGreaterThan(normal.speed + 3);
    expect(boosted.boost).toBeLessThan(0.5);
    expect(boosted.heat).toBeGreaterThan(0.5);
    run(boosted, 8, idle);
    expect(boosted.boost).toBe(1);
    expect(boosted.heat).toBe(0);
  });

  it("stays finite and bounded during prolonged aggressive input", () => {
    const s = createVehicle(0, 0, 0);
    for (let i = 0; i < 18000; i++) {
      stepVehicle(
        s,
        {
          throttle: i % 700 < 500 ? 1 : -1,
          steer: Math.sin(i * 0.004),
          brake: i % 150 < 20,
          boost: true,
        },
        FIXED_STEP,
        stock,
      );
      expect(Math.abs(s.roll)).toBeLessThanOrEqual(0.36);
      expect(Math.abs(s.wobble)).toBeLessThanOrEqual(0.28);
      expect(s.boost).toBeGreaterThanOrEqual(0);
      expect(s.heat).toBeLessThanOrEqual(1);
    }
    for (const value of Object.values(s))
      if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  });
});

describe("collision contacts", () => {
  it("pushes out of a wall and dissipates the normal impact", () => {
    const s = createVehicle(0.4, 1, 0);
    s.vx = -10;
    s.vz = 5;
    expect(collideAABB(s, -1, 0, -10, 10)).toBe(true);
    expect(s.x).toBeGreaterThanOrEqual(0.7);
    expect(s.vx).toBeGreaterThan(0);
    expect(s.vz).toBeGreaterThan(4);
    expect(s.speed).toBeLessThan(6);
    expect(s.collision).toBe(1);
    expect(collideAABB(s, -1, 0, -10, 10)).toBe(false);
  });

  it("handles rounded corners, circle centres, and centres inside a solid", () => {
    const corner = createVehicle(1.4, 1.4, 0);
    expect(collideAABB(corner, -1, 1, -1, 1)).toBe(true);
    expect(Math.hypot(corner.x - 1, corner.z - 1)).toBeGreaterThan(0.7);
    const centre = createVehicle(0, 0, 0);
    expect(collideCircle(centre, 0, 0, 1)).toBe(true);
    expect(Math.hypot(centre.x, centre.z)).toBeGreaterThanOrEqual(1.7);
    const inside = createVehicle(0, 0, 0);
    expect(collideAABB(inside, -1, 1, -1, 1)).toBe(true);
    expect(inside.x).toBeLessThanOrEqual(-1.7);
  });

  it("does not reflect a vehicle already moving away from a contact", () => {
    const s = createVehicle(1.5, 0, 0);
    s.vx = 3;
    collideCircle(s, 0, 0, 1);
    expect(s.vx).toBe(3);
  });
});
