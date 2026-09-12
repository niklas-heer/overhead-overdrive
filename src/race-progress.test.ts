import { describe, expect, it } from "vitest";
import {
  advanceRaceProgress,
  createRaceProgress,
  crossGate,
  lapStatus,
  type Gate,
} from "./race-progress";

const gates: Gate[] = [
  { x: 0, z: 0, dx: 0, dz: 1 },
  { x: 0, z: 10, dx: 1, dz: 0 },
  { x: 10, z: 10, dx: 0, dz: -1 },
  { x: 10, z: 0, dx: -1, dz: 0 },
];
const movement = (gate: Gate) =>
  [
    { x: gate.x - gate.dx, z: gate.z - gate.dz },
    { x: gate.x + gate.dx, z: gate.z + gate.dz },
  ] as const;

describe("real race progress", () => {
  it("does not grant checkpoints just for sitting inside their radius", () => {
    const progress = createRaceProgress();
    for (let i = 0; i < 1000; i++)
      advanceRaceProgress(
        progress,
        gates[1],
        gates[1],
        gates,
        4,
        i / 120,
        1 / 120,
      );
    expect(progress.gatesPassed).toBe(0);
    expect(progress.laps).toBe(0);
    const [, after] = movement(gates[1]);
    expect(
      crossGate(after, { x: after.x + 1, z: after.z }, gates[1], 4),
    ).toBeNull();
  });

  it("requires forward crossings within the track", () => {
    const [from, to] = movement(gates[0]);
    expect(crossGate(from, to, gates[0], 4)).toBe(0.5);
    expect(crossGate(to, from, gates[0], 4)).toBeNull();
    expect(
      crossGate({ ...from, x: 5 }, { ...to, x: 5 }, gates[0], 4),
    ).toBeNull();
  });

  it("crossing the finish repeatedly cannot substitute for the rest of the lap", () => {
    const progress = createRaceProgress();
    const [from, to] = movement(gates[0]);
    for (let i = 1; i <= 30; i++)
      advanceRaceProgress(progress, from, to, gates, 4, i, 1);
    expect(progress).toEqual(createRaceProgress());
    const [a, b] = movement(gates[2]);
    advanceRaceProgress(progress, a, b, gates, 4, 31, 1);
    expect(progress).toEqual(createRaceProgress());
  });

  it("requires every gate on all three laps and records each actual crossing time", () => {
    const progress = createRaceProgress();
    for (let step = 1; step <= 12; step++) {
      const [from, to] = movement(gates[step % 4]);
      const result = advanceRaceProgress(progress, from, to, gates, 4, step, 1);
      expect(progress.gatesPassed).toBe(step);
      expect(progress.laps).toBe(Math.floor(step / 4));
      expect(result).toBe(step % 4 === 0 ? step - 0.5 : null);
    }
    expect(progress.lapTimes).toEqual([3.5, 4, 4]);
    const [from, to] = movement(gates[1]);
    expect(advanceRaceProgress(progress, from, to, gates, 4, 13, 1)).toBeNull();
    expect(progress.gatesPassed).toBe(12);
  });

  it("keeps a lapped racer on their own lap and cannot turn them into a finisher", () => {
    const leader = createRaceProgress(),
      trailing = createRaceProgress();
    for (let step = 1; step <= 9; step++) {
      const [from, to] = movement(gates[step % 4]);
      advanceRaceProgress(leader, from, to, gates, 4, step, 1);
      if (step <= 1) advanceRaceProgress(trailing, from, to, gates, 4, step, 1);
    }
    expect(leader.checkpoint).toBe(trailing.checkpoint);
    expect(leader.laps).toBe(2);
    expect(trailing.laps).toBe(0);
    expect(lapStatus(trailing.laps, false)).toBe("LAP 1/3");
    expect(lapStatus(3, true)).toBe("FINISHED · 3/3 LAPS");
  });
});
