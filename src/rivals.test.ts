import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createVehicle, stepVehicle, FIXED_STEP } from "./physics";
import { createRivalBrain, driveRival, RIVAL_PROFILES } from "./rivals";

const target = new Vector3(0, 0, 10);
const straight = new Vector3(0, 0, 16);
const bend = new Vector3(6, 0, 10);
function moving(speed = 10) {
  const s = createVehicle(0, 0, 0);
  s.speed = speed;
  s.vz = speed;
  return s;
}

describe("rival driving personalities", () => {
  it("replays the same profile deterministically through ordinary physics", () => {
    const a = moving(0),
      b = moving(0);
    const brainA = createRivalBrain(2),
      brainB = createRivalBrain(2);
    for (let step = 0; step < 1200; step++) {
      const point = new Vector3(Math.sin(step * 0.002) * 8, 0, a.z + 10);
      const next = point.clone().add(new Vector3(2, 0, 6));
      const inputA = driveRival(
        brainA,
        a,
        point,
        next,
        [],
        8,
        step * FIXED_STEP,
      );
      const inputB = driveRival(
        brainB,
        b,
        point,
        next,
        [],
        8,
        step * FIXED_STEP,
      );
      expect(inputA).toEqual(inputB);
      stepVehicle(a, inputA, FIXED_STEP, RIVAL_PROFILES[2].tuning);
      stepVehicle(b, inputB, FIXED_STEP, RIVAL_PROFILES[2].tuning);
    }
    expect(a).toEqual(b);
    expect(a.z).toBeGreaterThan(60);
  });

  it.each([0, 1, 2])(
    "profile %i anticipates a corner before needing to steer into it",
    (index) => {
      const fastBrain = createRivalBrain(index),
        turnBrain = createRivalBrain(index);
      const fast = driveRival(
        fastBrain,
        moving(12),
        target,
        straight,
        [],
        8,
        2,
      );
      const turn = driveRival(turnBrain, moving(12), target, bend, [], 8, 2);
      expect(turnBrain.desiredSpeed).toBeLessThan(fastBrain.desiredSpeed - 3);
      expect(turn.throttle).toBeLessThan(fast.throttle);
      expect(turn.boost).toBe(false);
    },
  );

  it("steers in the physically correct direction toward a target on either side", () => {
    for (const side of [-1, 1]) {
      const point = new Vector3(side * 8, 0, 10);
      const input = driveRival(
        createRivalBrain(0),
        moving(),
        point,
        point.clone().add(new Vector3(0, 0, 6)),
        [],
        8,
        3,
      );
      expect(input.steer * side).toBeLessThan(0);
    }
  });

  it("slows behind traffic and chooses a bounded passing lane", () => {
    const s = moving(12),
      peer = createVehicle(0.3, 3, 0);
    peer.speed = peer.vz = 6;
    const brain = createRivalBrain(1),
      clearBrain = createRivalBrain(1);
    const clear = driveRival(clearBrain, s, target, straight, [], 8, 1);
    const original = { ...s };
    let traffic = clear;
    for (let step = 0; step < 120; step++)
      traffic = driveRival(
        brain,
        s,
        target,
        straight,
        [s, peer],
        8,
        1 + step / 120,
      );
    expect(brain.avoiding).toBe(true);
    expect(brain.laneOffset).toBeLessThan(-0.8);
    expect(Math.abs(brain.laneOffset)).toBeLessThanOrEqual(1.2);
    expect(traffic.throttle).toBeLessThan(clear.throttle);
    expect(traffic.boost).toBe(false);
    expect(s).toEqual(original);
  });

  it("has genuinely different pacing, equipment and cornering choices", () => {
    const brains = RIVAL_PROFILES.map((_, i) => createRivalBrain(i));
    brains.forEach((brain) =>
      driveRival(brain, moving(), target, straight, [], 8, 3),
    );
    expect(brains[1].desiredSpeed).toBeGreaterThan(brains[0].desiredSpeed);
    expect(new Set(RIVAL_PROFILES.map((p) => p.tuning.grip)).size).toBe(3);
    const cornerTarget = new Vector3(3, 0, 8),
      cornerNext = new Vector3(9, 0, 12);
    const choices = RIVAL_PROFILES.map((_, i) =>
      driveRival(
        createRivalBrain(i),
        moving(),
        cornerTarget,
        cornerNext,
        [],
        8,
        0,
      ),
    );
    expect(choices.map((input) => input.brake)).toEqual([false, false, true]);
  });

  it("only spends boost on a clear, aligned straight during its chosen window", () => {
    const brain = createRivalBrain(0);
    const clear = driveRival(brain, moving(), target, straight, [], 8, 0);
    expect(clear.boost).toBe(true);
    const hot = moving();
    hot.heat = 0.9;
    expect(
      driveRival(createRivalBrain(0), hot, target, straight, [], 8, 0).boost,
    ).toBe(false);
    expect(
      driveRival(createRivalBrain(0), moving(), target, straight, [], 8, 4)
        .boost,
    ).toBe(false);
  });
});
