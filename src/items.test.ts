import { describe, it, expect } from "vitest";
import { createVehicle } from "./physics";
import { ItemSystem } from "./items";
const make = () =>
  new ItemSystem(
    [createVehicle(0, 0, 0), createVehicle(0, 9, 0)],
    [{ x: 0, z: 0, kind: "laser" }],
    [],
    [],
  );
describe("school equipment", () => {
  it("collects three charges, respects cooldown and refills pickups", () => {
    const items = make();
    items.step(0.01);
    expect(items.equipment[0].charges).toBe(3);
    expect(items.pickups[0].cooldown).toBe(8);
    expect(items.use(0)).toBe(true);
    expect(items.use(0)).toBe(false);
    items.step(0.5);
    items.use(0);
    items.step(0.5);
    items.use(0);
    expect(items.equipment[0].item).toBeNull();
    items.step(7.1);
    expect(items.equipment[0].charges).toBe(3);
  });
  it("hits the nearest opponent and limits repeated stun", () => {
    const items = make();
    items.step(0.01);
    items.use(0);
    expect(items.equipment[1].stun).toBeGreaterThan(0);
    items.step(0.5);
    const before = items.equipment[1].stun;
    items.use(0);
    expect(items.equipment[1].stun).toBe(before);
  });
  it("walls block laser hits", () => {
    const items = make();
    items.obstacles.push({ type: "box", minX: -2, maxX: 2, minZ: 4, maxZ: 5 });
    items.step(0.01);
    items.use(0);
    expect(items.equipment[1].stun).toBe(0);
    expect(
      items.drainEvents().find((e) => e.type === "laser")?.to?.z,
    ).toBeCloseTo(4);
  });
  it("a transparency shield absorbs one shot", () => {
    const items = make();
    items.equipment[1].shield = 7;
    items.step(0.01);
    items.use(0);
    expect(items.equipment[1].shield).toBe(0);
    expect(items.equipment[1].stun).toBe(0);
    expect(items.drainEvents().some((e) => e.type === "blocked")).toBe(true);
  });
  it("turbo adds velocity and expires", () => {
    const items = make();
    const e = items.equipment[0];
    e.item = "turbo";
    e.charges = 1;
    items.use(0);
    items.step(0.5);
    expect(e.state.vz).toBeGreaterThan(0);
    items.step(2);
    expect(e.turbo).toBe(0);
  });
  it("shootable quiz targets recharge boost and respawn", () => {
    const items = make();
    items.equipment[1].active = false;
    items.targets.push({ x: 0, z: 6, cooldown: 0 });
    items.equipment[0].state.boost = 0.2;
    items.step(0.01);
    items.use(0);
    expect(items.targets[0].cooldown).toBe(10);
    expect(items.equipment[0].state.boost).toBeCloseTo(0.4);
    items.step(10);
    expect(items.targets[0].cooldown).toBe(0);
  });
  it("does not collect or fire for inactive racers", () => {
    const items = make();
    items.equipment[0].active = false;
    items.step(1);
    expect(items.equipment[0].item).toBeNull();
    expect(items.use(0)).toBe(false);
  });
});
