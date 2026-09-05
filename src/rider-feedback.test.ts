import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createVehicle } from "./physics";
import { RiderReactionDirector, type ReactionRacer } from "./rider-feedback";

function racer(z = 0): ReactionRacer {
  const state = createVehicle(0, z, 0);
  state.speed = state.vz = 12;
  return { mesh: new THREE.Group(), state, stun: 0, finished: false };
}
function advance(
  d: RiderReactionDirector,
  racers: ReactionRacer[],
  seconds: number,
  active = true,
) {
  const events = [];
  for (let i = 0; i < seconds * 20; i++)
    events.push(...d.update(0.05, racers, active));
  return events;
}

describe("rider comic timing", () => {
  it("reacts once to a charged drift and enforces ten seconds between jokes", () => {
    const d = new RiderReactionDirector(),
      r = racer();
    expect(d.update(0.05, [r], true)).toEqual([]);
    r.state.driftCharge = 0.8;
    expect(d.update(0.05, [r], true)).toEqual([
      { racerIndex: 0, kind: "drift" },
    ]);
    r.stun = 1;
    expect(advance(d, [r], 12)).toEqual([]); // No queued stale joke when cooldown expires.
    r.stun = 0;
    d.update(0.05, [r], true);
    r.stun = 1;
    expect(d.update(0.05, [r], true)[0].kind).toBe("stun");
  });

  it("freezes cooldown while paused and ignores recovery state jumps", () => {
    const d = new RiderReactionDirector(),
      r = racer();
    d.update(0.05, [r], true);
    r.state.collision = 0.8;
    expect(d.update(0.05, [r], true)[0].kind).toBe("collision");
    expect(advance(d, [r], 20, false)).toEqual([]);
    r.state = createVehicle(0, 30, 0);
    r.state.driftTurbo = 1;
    expect(d.update(0.05, [r], true)).toEqual([]);
    r.stun = 1;
    expect(d.update(0.05, [r], true)).toEqual([]);
    d.clear();
    expect(d.update(0.05, [r], true)).toEqual([]);
  });

  it("only celebrates a forward pass once, never oncoming traffic", () => {
    const d = new RiderReactionDirector(),
      a = racer(),
      b = racer(3);
    d.update(0.05, [a, b], true);
    a.state.z = 5;
    expect(d.update(0.05, [a, b], true)).toEqual([
      { racerIndex: 0, kind: "overtake" },
    ]);
    expect(advance(d, [a, b], 12)).toEqual([]);
    d.clear();
    a.state.z = 0;
    b.state.yaw = Math.PI;
    d.update(0.05, [a, b], true);
    a.state.z = 5;
    expect(d.update(0.05, [a, b], true)).toEqual([]);
  });

  it("suppresses finished and hidden riders and does not repeat sustained boost", () => {
    const d = new RiderReactionDirector(),
      r = racer();
    d.update(0.05, [r], true);
    r.state.boost -= 0.015;
    expect(d.update(0.05, [r], true)[0].kind).toBe("boost");
    for (let i = 0; i < 250; i++) {
      r.state.boost -= 0.015;
      expect(d.update(0.05, [r], true)).toEqual([]);
    }
    r.finished = true;
    r.stun = 1;
    expect(d.update(0.05, [r], true)).toEqual([]);
    r.finished = false;
    r.mesh.visible = false;
    r.state.collision = 1;
    expect(d.update(0.05, [r], true)).toEqual([]);
  });
});
