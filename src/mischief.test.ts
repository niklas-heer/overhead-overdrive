import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { createVehicle } from "./physics";
import { tracks } from "./world";
import { crossMomentLane, momentLane, SchoolMischief } from "./mischief";

function setup(index = 0) {
  const track = tracks[index];
  const curve = new THREE.CatmullRomCurve3(track.points, true, "centripetal");
  const lane = momentLane(curve, track);
  const state = createVehicle(
    lane.center.x,
    lane.center.z,
    Math.atan2(lane.tangent.x, lane.tangent.z),
  );
  state.vx = lane.tangent.x * 12;
  state.vz = lane.tangent.z * 12;
  return { track, curve, lane, state };
}

describe("playful track moments", () => {
  it("places every optional reward line safely inside its race road", () => {
    tracks.forEach((_, index) => {
      const { track, curve, lane } = setup(index);
      const samples = curve.getSpacedPoints(2000);
      // Check the entire painted rectangle, including its ends on a curved road.
      for (const sideways of [-1.3, 0, 1.3]) {
        for (const along of [-4.4, -2.2, 0, 2.2, 4.4]) {
          const point = lane.center
            .clone()
            .addScaledVector(lane.right, sideways)
            .addScaledVector(lane.tangent, along);
          const nearest = Math.min(...samples.map((p) => p.distanceTo(point)));
          expect(nearest).toBeLessThan(track.width * 0.5 - 0.6);
        }
      }
    });
  });

  it("rewards forward momentum but not reverse or stationary driving", () => {
    const { lane, state } = setup();
    expect(crossMomentLane(state, lane)).toBe(true);
    expect(Math.hypot(state.vx, state.vz)).toBeCloseTo(14.8);
    state.vx = -lane.tangent.x * 12;
    state.vz = -lane.tangent.z * 12;
    expect(crossMomentLane(state, lane)).toBe(false);
    state.vx = state.vz = 0;
    expect(crossMomentLane(state, lane)).toBe(false);
    state.vx = lane.tangent.x * 29;
    state.vz = lane.tangent.z * 29;
    crossMomentLane(state, lane);
    expect(Math.hypot(state.vx, state.vz)).toBeCloseTo(29);
  });

  it("does not farm rewards while staying on a lane, freezes when paused, and resets cleanly", () => {
    const { state, track, curve } = setup();
    const scene = new THREE.Scene();
    const mischief = new SchoolMischief(scene, { curve }, track);
    expect(mischief.update(1 / 60, [state], false)).toEqual([]);
    expect(Math.hypot(state.vx, state.vz)).toBeCloseTo(12);
    expect(mischief.update(1 / 60, [state], true)[0].kind).toBe("papers");
    for (let i = 0; i < 400; i++)
      expect(mischief.update(1 / 60, [state], true)).toEqual([]);
    expect(Math.hypot(state.vx, state.vz)).toBeCloseTo(14.8);
    mischief.reset();
    expect(mischief.update(1 / 60, [state], true)).toHaveLength(1);
    mischief.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("gives each track a distinct moment and caps its fragment pool during repeated races", () => {
    tracks.forEach((track, index) => {
      const { state, curve } = setup(index);
      const scene = new THREE.Scene();
      const mischief = new SchoolMischief(scene, { curve }, track);
      const childCount = mischief.group.children.length;
      expect(mischief.update(0.016, [state], true)[0].kind).toBe(
        ["papers", "rattle", "leaves"][index],
      );
      for (let i = 0; i < 30; i++) {
        mischief.reset();
        mischief.update(0.016, [state], true);
      }
      expect(mischief.group.children).toHaveLength(childCount);
      const instances = mischief.group.children.filter(
        (c) => c instanceof THREE.InstancedMesh,
      );
      expect(instances).toHaveLength(1);
      expect((instances[0] as THREE.InstancedMesh).count).toBe(96);
      mischief.dispose();
    });
  });
});
