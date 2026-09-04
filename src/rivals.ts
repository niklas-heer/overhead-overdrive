import type { Vector3 } from "three";
import type { Input, Tuning, VehicleState } from "./physics.ts";

export type RivalProfile = {
  name: string;
  color: string;
  style: string;
  description: string;
  tuning: Tuning;
  cruise: number;
  lane: number;
  precision: number;
  boostPeriod: number;
};

/** Different machines and decisions, all using the player's ordinary vehicle physics. */
export const RIVAL_PROFILES: readonly RivalProfile[] = [
  {
    name: "THE PREFECT",
    color: "#70d6ca",
    style: "Precision",
    description:
      "Clean lines. Early braking. Saves the lamp for a clear straight.",
    tuning: { motor: 0.9, grip: 1.34, stability: 1.3 },
    cruise: 14.4,
    lane: -0.3,
    precision: 0.025,
    boostPeriod: 13,
  },
  {
    name: "TURBO TUTOR",
    color: "#ef866b",
    style: "Overtaker",
    description:
      "A bigger motor, late braking and bold passes under lamp boost.",
    tuning: { motor: 1.08, grip: 1.23, stability: 1.18 },
    cruise: 16.1,
    lane: 0.45,
    precision: 0.05,
    boostPeriod: 7.5,
  },
  {
    name: "LOOSE CASTER",
    color: "#b6a0ed",
    style: "Drifter",
    description:
      "A wandering racing line and little caster slides through bends.",
    tuning: { motor: 0.98, grip: 1.1, stability: 0.98 },
    cruise: 15.2,
    lane: -0.55,
    precision: 0.14,
    boostPeriod: 10,
  },
];

export type RivalBrain = {
  profileIndex: number;
  laneOffset: number;
  desiredSpeed: number;
  avoiding: boolean;
  lastTime: number;
};
export function createRivalBrain(index: number): RivalBrain {
  const profileIndex =
    ((Math.trunc(index) % RIVAL_PROFILES.length) + RIVAL_PROFILES.length) %
    RIVAL_PROFILES.length;
  return {
    profileIndex,
    laneOffset: RIVAL_PROFILES[profileIndex].lane,
    desiredSpeed: 0,
    avoiding: false,
    lastTime: -1,
  };
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Sequential checkpoints, not a closest-point shortcut, preserve genuine lap progress. */
export function driveRival(
  brain: RivalBrain,
  state: VehicleState,
  target: Vector3,
  nextTarget: Vector3,
  peers: VehicleState[],
  width: number,
  time: number,
): Input {
  const profile = RIVAL_PROFILES[brain.profileIndex];
  const dt =
    brain.lastTime < 0 ? 1 / 120 : clamp(time - brain.lastTime, 0, 0.1);
  brain.lastTime = time;
  const dx = target.x - state.x,
    dz = target.z - state.z;
  const segmentX = nextTarget.x - target.x,
    segmentZ = nextTarget.z - target.z;
  const length = Math.hypot(segmentX, segmentZ) || 1;
  const tx = segmentX / length,
    tz = segmentZ / length;
  const fx = Math.sin(state.yaw),
    fz = Math.cos(state.yaw);
  const corner = Math.abs(
    wrap(Math.atan2(segmentX, segmentZ) - Math.atan2(dx, dz)),
  );
  let lane =
    profile.lane +
    Math.sin(time * 0.65 + brain.profileIndex * 2.4) * profile.precision;
  let trafficLimit = Infinity;
  brain.avoiding = false;
  // Keep a passing side until the opponent is behind; avoids indecisive left/right weaving.
  let nearest = Infinity;
  for (const peer of peers) {
    if (peer === state) continue;
    const px = peer.x - state.x,
      pz = peer.z - state.z;
    const ahead = px * fx + pz * fz;
    const across = px * fz - pz * fx;
    if (ahead > 0 && ahead < 10 && Math.abs(across) < 2 && ahead < nearest) {
      nearest = ahead;
      brain.avoiding = true;
      const side =
        across > 0.2 ? -1 : across < -0.2 ? 1 : profile.lane >= 0 ? 1 : -1;
      lane = side * Math.min(1.2, width * 0.17);
      // Ease off before contact, then resume when lateral clearance opens up.
      if (ahead < 4.5 && Math.abs(across) < 1.45)
        trafficLimit = Math.max(3, peer.speed - (4.5 - ahead) * 1.5);
    }
  }
  lane = clamp(lane, -width * 0.19, width * 0.19);
  brain.laneOffset += (lane - brain.laneOffset) * (1 - Math.exp(-3 * dt));
  const aimX = dx + tz * brain.laneOffset;
  const aimZ = dz - tx * brain.laneOffset;
  const error = wrap(Math.atan2(aimX, aimZ) - state.yaw);
  // Preview the next segment and brake before a bend, not after leaving the racing line.
  const caution =
    brain.profileIndex === 0 ? 1.35 : brain.profileIndex === 1 ? 1.05 : 1.2;
  const desiredSpeed = Math.max(
    5.8,
    profile.cruise / (1 + Math.abs(error) * 1.55 + corner * caution),
  );
  brain.desiredSpeed = Math.min(desiredSpeed, trafficLimit);
  const slot = (time + brain.profileIndex * 2.1) % profile.boostPeriod;
  const boost =
    Math.abs(error) < 0.13 &&
    corner < 0.14 &&
    state.boost > 0.24 &&
    state.heat < 0.7 &&
    !brain.avoiding &&
    slot < (brain.profileIndex === 1 ? 1.3 : 0.7) &&
    state.speed > 7 &&
    state.speed < brain.desiredSpeed + 1;
  // Brief, bounded slides are a personality choice rather than continuous handbraking.
  const brake =
    brain.profileIndex === 2 &&
    time % 5.3 < 0.14 &&
    state.speed > 8.5 &&
    Math.abs(error) > 0.28 &&
    Math.abs(error) < 0.7 &&
    corner > 0.14 &&
    !brain.avoiding;
  return {
    throttle: clamp((brain.desiredSpeed - state.speed) * 0.7, -0.6, 1),
    steer: clamp(-error * 1.65 + state.yawRate * 0.14, -1, 1),
    brake,
    boost,
  };
}
