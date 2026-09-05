import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createVehicle } from "./physics";
import { attachRider } from "./rider";
import { animateProjector } from "./personality";
function rig() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = "body";
  root.add(body);
  const mast = new THREE.Group();
  mast.name = "mast";
  body.add(mast);
  const head = new THREE.Group();
  head.name = "projector-head";
  mast.add(head);
  const caster = new THREE.Group();
  caster.name = "caster";
  caster.position.set(0.43, 0.13, 0.51);
  root.add(caster);
  const wheel = new THREE.Mesh();
  wheel.name = "wheel";
  caster.add(wheel);
  return { root, body, head, caster, wheel };
}
const options = { idle: false, stun: 0, turbo: false, celebrating: false };
describe("expressive projector rig", () => {
  it("animates the body and head without moving the physics or lifting the casters", () => {
    const r = rig(),
      s = createVehicle(2, 4, 0.6);
    Object.assign(s, {
      speed: 14,
      yawRate: -0.8,
      pitch: 0.1,
      roll: -0.2,
      wobble: 0.1,
    });
    const before = { ...s };
    for (let i = 0; i < 120; i++)
      animateProjector(r.root, s, 1 / 120, i / 120, options);
    expect(s).toEqual(before);
    expect(r.head.rotation.y).toBeLessThan(-0.2);
    expect(r.body.rotation.z).toBe(0.2);
    expect(r.caster.position.y).toBe(0.13);
  });
  it("wheel travel stays consistent across rendering rates", () => {
    const slow = rig(),
      fast = rig(),
      s = createVehicle(0, 0, 0);
    s.speed = 12;
    for (let i = 0; i < 30; i++)
      animateProjector(slow.root, s, 1 / 30, i / 30, options);
    for (let i = 0; i < 120; i++)
      animateProjector(fast.root, s, 1 / 120, i / 120, options);
    expect(slow.wheel.rotation.y).toBeCloseTo(fast.wheel.rotation.y, 8);
  });
  it("freezes animation while paused and recovers smoothly from a stun", () => {
    const r = rig(),
      s = createVehicle(0, 0, 0);
    animateProjector(r.root, s, 0.06, 1, { ...options, stun: 1 });
    const rotation = r.head.rotation.clone();
    animateProjector(r.root, s, 0, 2, options);
    expect(r.head.rotation.toArray()).toEqual(rotation.toArray());
    for (let i = 0; i < 120; i++)
      animateProjector(r.root, s, 1 / 120, 2 + i / 120, options);
    expect(Math.abs(r.head.rotation.x)).toBeLessThan(0.001);
  });
});

it("keeps the rider deck above ground at combined maximum pitch and roll", () => {
  const r = rig(),
    s = createVehicle(0, 0, 0);
  const rider = attachRider(r.root);
  for (const pitch of [-0.27, 0.27])
    for (const roll of [-0.36, 0.36]) {
      s.pitch = pitch;
      s.roll = roll;
      animateProjector(r.root, s, 1 / 60, 1, options);
      r.root.updateMatrixWorld(true);
      for (const x of [-0.46, 0.46])
        for (const z of [-1.34, -0.58]) {
          const point = r.body.localToWorld(new THREE.Vector3(x, 0.3425, z));
          expect(point.y).toBeGreaterThan(0);
        }
      expect(s.pitch).toBe(pitch);
      expect(s.roll).toBe(roll);
    }
  rider.dispose();
});
