/** Full races against actual world colliders; AI_PACK=1 also exercises rival contacts. */
import * as THREE from "three";
import { buildWorld, tracks } from "../src/world.ts";
import {
  createVehicle,
  stepVehicle,
  collideAABB,
  collideCircle,
  FIXED_STEP,
} from "../src/physics.ts";
import { createRivalBrain, driveRival, RIVAL_PROFILES } from "../src/rivals.ts";
import {
  advanceRaceProgress,
  createRaceProgress,
} from "../src/race-progress.ts";

// World construction only needs canvas drawing, not a renderer.
const context = new Proxy({}, { get: () => () => {}, set: () => true });
Object.assign(globalThis, {
  document: {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  },
});
const seconds = 180,
  dt = FIXED_STEP;
for (const track of tracks) {
  const world = buildWorld(new THREE.Scene(), track);
  const count = Math.max(20, Math.round(world.curve.getLength() / 5));
  const checkpoints = Array.from({ length: count }, (_, i) =>
    world.curve.getPointAt(i / count),
  );
  const gates = checkpoints.map((p, i) => {
    const h = world.curve.getTangentAt(i / count);
    return { x: p.x, z: p.z, dx: h.x, dz: h.z };
  });
  for (const indices of [
    [0],
    [1],
    [2],
    ...(process.env.AI_PACK ? [[0, 1, 2]] : []),
  ]) {
    const pack = indices.map((i) => {
      const t = 1 - (i + 1) * 0.011,
        p = world.curve.getPointAt(t),
        h = world.curve.getTangentAt(t),
        side = i % 2 ? -1 : 1;
      return {
        ...createRaceProgress(),
        profile: RIVAL_PROFILES[i],
        brain: createRivalBrain(i),
        state: createVehicle(
          p.x + h.z * side * 0.9,
          p.z - h.x * side * 0.9,
          Math.atan2(h.x, h.z),
        ),
        previous: { x: 0, z: 0 },
        finishTime: 0,
        distance: 0,
        stopped: 0,
        maxStopped: 0,
        contacts: 0,
      };
    });
    for (let tick = 1; tick <= seconds / dt; tick++) {
      const active = pack.filter((r) => r.laps < 3);
      if (!active.length) break;
      for (const r of active) {
        r.previous = { x: r.state.x, z: r.state.z };
        const input = driveRival(
          r.brain,
          r.state,
          checkpoints[r.checkpoint % count],
          checkpoints[(r.checkpoint + 1) % count],
          active.map((p) => p.state),
          track.width,
          (tick - 1) * dt,
        );
        stepVehicle(r.state, input, dt, r.profile.tuning);
        for (const c of world.colliders) {
          if (c.type === "box")
            collideAABB(r.state, c.minX, c.maxX, c.minZ, c.maxZ);
          else collideCircle(r.state, c.x, c.z, c.radius);
        }
      }
      for (let i = 0; i < active.length; i++)
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i].state,
            b = active[j].state,
            dx = a.x - b.x,
            dz = a.z - b.z,
            d = Math.hypot(dx, dz);
          if (d < 1.4 && d > 0.001) {
            active[i].contacts++;
            active[j].contacts++;
            const nx = dx / d,
              nz = dz / d,
              overlap = (1.4 - d) * 0.5;
            a.x += nx * overlap;
            a.z += nz * overlap;
            b.x -= nx * overlap;
            b.z -= nz * overlap;
            const v = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
            if (v < 0) {
              a.vx -= v * nx * 0.6;
              a.vz -= v * nz * 0.6;
              b.vx += v * nx * 0.6;
              b.vz += v * nz * 0.6;
            }
          }
        }
      for (const r of active) {
        r.distance += Math.hypot(
          r.state.x - r.previous.x,
          r.state.z - r.previous.z,
        );
        const crossed = advanceRaceProgress(
          r,
          r.previous,
          r.state,
          gates,
          track.width * 0.63,
          tick * dt,
          dt,
        );
        if (r.laps === 3 && crossed !== null) r.finishTime = crossed;
        if (
          Math.min(
            ...checkpoints.map((p) =>
              Math.hypot(p.x - r.state.x, p.z - r.state.z),
            ),
          ) >
          track.width * 0.65
        ) {
          const drag = Math.exp(-1.4 * dt);
          r.state.vx *= drag;
          r.state.vz *= drag;
        }
        r.stopped = Math.abs(r.state.speed) < 0.7 ? r.stopped + dt : 0;
        r.maxStopped = Math.max(r.maxStopped, r.stopped);
      }
    }
    const results = pack.map((r) => ({
      racer: r.profile.name,
      laps: r.laps,
      gatesPassed: r.gatesPassed,
      requiredGates: count * 3,
      lapTimes: r.lapTimes.map((n) => +n.toFixed(2)),
      finishTime: +r.finishTime.toFixed(2),
      distance: +r.distance.toFixed(1),
      maxStopped: +r.maxStopped.toFixed(2),
      contacts: r.contacts,
    }));
    console.log(
      JSON.stringify({
        track: track.id,
        mode: indices.length === 1 ? "solo" : "pack",
        results,
      }),
    );
    for (const r of pack) {
      if (
        r.laps !== 3 ||
        r.gatesPassed !== count * 3 ||
        r.lapTimes.length !== 3 ||
        r.lapTimes.some((t) => t < 5) ||
        r.distance < world.curve.getLength() * 2.7 ||
        r.maxStopped > 3.5 ||
        !Object.values(r.state).every(
          (v) => typeof v !== "number" || Number.isFinite(v),
        )
      ) {
        console.error(
          `AI regression: ${track.id} ${r.profile.name}, checkpoint ${r.checkpoint}`,
        );
        process.exitCode = 1;
      }
    }
  }
  world.dispose();
}
