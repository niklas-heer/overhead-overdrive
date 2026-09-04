/**
 * Headless gameplay smoke check. Run: node scripts/check-ai.ts
 * Each rival is simulated independently against the actual world colliders.
 * AI_PACK=1 additionally checks three rivals racing together with mutual contacts.
 * Includes the game's off-track friction; human driving and item use remain outside this check.
 */
import * as THREE from "three";
import { buildWorld, tracks } from "../src/world.ts";
import {
  createVehicle,
  stepVehicle,
  collideAABB,
  collideCircle,
  type VehicleState,
} from "../src/physics.ts";

import { createRivalBrain, driveRival, RIVAL_PROFILES } from "../src/rivals.ts";

// World construction only needs text/floor canvas drawing, not a GPU renderer.
const context = new Proxy({}, { get: () => () => {}, set: () => true });
Object.assign(globalThis, {
  document: {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  },
});
const seconds = 180;
const dt = 1 / 120;
function offTrackFriction(
  state: VehicleState,
  checkpoints: THREE.Vector3[],
  width: number,
) {
  if (
    Math.min(
      ...checkpoints.map((p) => Math.hypot(p.x - state.x, p.z - state.z)),
    ) >
    width * 0.65
  ) {
    const friction = Math.exp(-1.4 * dt);
    state.vx *= friction;
    state.vz *= friction;
  }
}
for (const track of tracks) {
  const world = buildWorld(new THREE.Scene(), track);
  const count = Math.max(20, Math.round(world.curve.getLength() / 5));
  const checkpoints = Array.from({ length: count }, (_, i) =>
    world.curve.getPointAt(i / count),
  );
  const startHeading = world.curve.getTangentAt(0);
  const results = [];
  for (let i = 1; i < 4; i++) {
    const t = 1 - i * 0.011,
      p = world.curve.getPointAt(t),
      tangent = world.curve.getTangentAt(t);
    const side = i % 2 === 0 ? -1 : 1;
    let state = createVehicle(
      p.x + tangent.z * side * 0.9,
      p.z - tangent.x * side * 0.9,
      Math.atan2(tangent.x, tangent.z),
    );
    const brain = createRivalBrain(i - 1);
    const profile = RIVAL_PROFILES[i - 1];
    let checkpoint = 1,
      laps = 0,
      stuck = 0,
      recoveries = 0,
      collisions = 0,
      finishTime = 0,
      finiteThroughout = true;
    for (let step = 0; step < seconds / dt; step++) {
      if (laps >= 3) break;
      const target = checkpoints[checkpoint % count];
      const input = driveRival(
        brain,
        state,
        target,
        checkpoints[(checkpoint + 1) % count],
        [],
        track.width,
        step * dt,
      );
      stepVehicle(state, input, dt, profile.tuning);
      for (const c of world.colliders) {
        const hit =
          c.type === "box"
            ? collideAABB(state, c.minX, c.maxX, c.minZ, c.maxZ)
            : collideCircle(state, c.x, c.z, c.radius);
        if (hit) collisions++;
      }
      offTrackFriction(state, checkpoints, track.width);
      finiteThroughout &&= Object.values(state).every(
        (value) => typeof value !== "number" || Number.isFinite(value),
      );
      stuck = Math.abs(state.speed) < 0.7 ? stuck + dt : 0;
      if (stuck > 3.5) {
        const index = (checkpoint - 1 + count) % count,
          point = checkpoints[index],
          heading = world.curve.getTangentAt(index / count);
        state = createVehicle(
          point.x,
          point.z,
          Math.atan2(heading.x, heading.z),
        );
        stuck = 0;
        recoveries++;
      }
      const crossedStart =
        (state.x - checkpoints[0].x) * startHeading.x +
          (state.z - checkpoints[0].z) * startHeading.z >=
        0;
      if (
        Math.hypot(state.x - target.x, state.z - target.z) <
          track.width * 0.63 &&
        (checkpoint % count !== 0 || crossedStart)
      ) {
        checkpoint++;
        if (checkpoint > count) {
          laps++;
          checkpoint = 1;
          if (laps === 3) finishTime = (step + 1) * dt;
        }
      }
    }
    results.push({
      racer: profile.name,
      laps,
      checkpoint,
      finishTime: +finishTime.toFixed(2),
      position: [state.x, state.z].map((v) => +v.toFixed(2)),
      recoveries,
      collisions,
    });
    if (
      laps < 3 ||
      finishTime >= seconds ||
      !finiteThroughout ||
      recoveries !== 0
    ) {
      console.error(
        `AI regression: ${track.id} racer ${i}: laps=${laps}, time=${finishTime}, finite=${finiteThroughout}, recoveries=${recoveries}`,
      );
      process.exitCode = 1;
    }
  }
  console.log(
    JSON.stringify({ track: track.id, simulatedSeconds: seconds, results }),
  );
  if (process.env.AI_PACK) {
    const pack = RIVAL_PROFILES.map((profile, i) => {
      const t = 1 - (i + 1) * 0.011,
        p = world.curve.getPointAt(t),
        h = world.curve.getTangentAt(t);
      const side = i % 2 ? -1 : 1;
      return {
        profile,
        brain: createRivalBrain(i),
        state: createVehicle(
          p.x + h.z * side * 0.9,
          p.z - h.x * side * 0.9,
          Math.atan2(h.x, h.z),
        ),
        checkpoint: 1,
        laps: 0,
        finishTime: 0,
        contacts: 0,
        wallContacts: 0,
        maxStopped: 0,
        stopped: 0,
      };
    });
    for (let step = 0; step < seconds / dt; step++) {
      const active = pack.filter((r) => r.laps < 3);
      if (!active.length) break;
      for (const r of active) {
        const target = checkpoints[r.checkpoint % count];
        const input = driveRival(
          r.brain,
          r.state,
          target,
          checkpoints[(r.checkpoint + 1) % count],
          active.map((other) => other.state),
          track.width,
          step * dt,
        );
        stepVehicle(r.state, input, dt, r.profile.tuning);
        for (const c of world.colliders) {
          const hit =
            c.type === "box"
              ? collideAABB(r.state, c.minX, c.maxX, c.minZ, c.maxZ)
              : collideCircle(r.state, c.x, c.z, c.radius);
          if (hit) r.wallContacts++;
        }
        r.stopped = r.state.speed < 0.7 ? r.stopped + dt : 0;
        r.maxStopped = Math.max(r.maxStopped, r.stopped);
        const crossed =
          (r.state.x - checkpoints[0].x) * startHeading.x +
            (r.state.z - checkpoints[0].z) * startHeading.z >=
          0;
        if (
          Math.hypot(r.state.x - target.x, r.state.z - target.z) <
            track.width * 0.63 &&
          (r.checkpoint % count !== 0 || crossed)
        ) {
          r.checkpoint++;
          if (r.checkpoint > count) {
            r.checkpoint = 1;
            r.laps++;
            if (r.laps === 3) r.finishTime = (step + 1) * dt;
          }
        }
      }
      for (let i = 0; i < pack.length; i++)
        for (let j = i + 1; j < pack.length; j++) {
          if (pack[i].laps >= 3 || pack[j].laps >= 3) continue;
          const a = pack[i].state,
            b = pack[j].state,
            dx = a.x - b.x,
            dz = a.z - b.z,
            distance = Math.hypot(dx, dz);
          if (distance < 1.4 && distance > 0.001) {
            pack[i].contacts++;
            pack[j].contacts++;
            const nx = dx / distance,
              nz = dz / distance,
              overlap = (1.4 - distance) * 0.5;
            a.x += nx * overlap;
            a.z += nz * overlap;
            b.x -= nx * overlap;
            b.z -= nz * overlap;
            const velocity = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
            if (velocity < 0) {
              a.vx -= velocity * nx * 0.6;
              a.vz -= velocity * nz * 0.6;
              b.vx += velocity * nx * 0.6;
              b.vz += velocity * nz * 0.6;
            }
          }
        }
      for (const r of active)
        offTrackFriction(r.state, checkpoints, track.width);
    }
    const results = pack.map((r) => ({
      racer: r.profile.name,
      laps: r.laps,
      finishTime: +r.finishTime.toFixed(2),
      contactSeconds: +(r.contacts * dt).toFixed(2),
      wallContacts: r.wallContacts,
      maxStoppedSeconds: +r.maxStopped.toFixed(2),
    }));
    console.log(JSON.stringify({ track: track.id, mode: "pack", results }));
    if (
      pack.some(
        (r) =>
          r.laps < 3 ||
          r.finishTime >= seconds ||
          r.maxStopped > 3.5 ||
          !Object.values(r.state).every(
            (value) => typeof value !== "number" || Number.isFinite(value),
          ),
      )
    ) {
      console.error(`AI pack regression: ${track.id}`);
      process.exitCode = 1;
    }
  }
  world.dispose();
}
