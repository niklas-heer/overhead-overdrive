/** Bake authoritative collision/course data without importing the renderer on the server. */
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { buildWorld, tracks } from "../src/world.ts";
const context = new Proxy({}, { get: () => () => {}, set: () => true });
Object.assign(globalThis, {
  document: {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  },
});
const point = (p: THREE.Vector3) => ({ x: p.x, z: p.z });
const result = Object.fromEntries(
  tracks.map((track) => {
    const world = buildWorld(new THREE.Scene(), track),
      curve = world.curve;
    const count = Math.max(20, Math.round(curve.getLength() / 5));
    const data = {
      width: track.width,
      length: curve.getLength(),
      points: track.points.map(point),
      checkpoints: Array.from({ length: count }, (_, i) =>
        point(curve.getPointAt(i / count)),
      ),
      tangents: Array.from({ length: count }, (_, i) =>
        point(curve.getTangentAt(i / count)),
      ),
      grid: Array.from({ length: 4 }, (_, i) => {
        const t = i === 0 ? 0 : 1 - i * 0.011,
          p = curve.getPointAt(t),
          h = curve.getTangentAt(t),
          side = i % 2 === 0 ? -1 : 1;
        return {
          x: p.x + h.z * side * 0.9,
          z: p.z - h.x * side * 0.9,
          yaw: Math.atan2(h.x, h.z),
        };
      }),
      colliders: world.colliders,
      pickups: Array.from({ length: 9 }, (_, i) => {
        const t = 0.028 + i * 0.104,
          p = curve.getPointAt(t),
          h = curve.getTangentAt(t),
          offset = i === 0 ? -0.9 : i % 2 === 0 ? 0.7 : -0.7;
        return {
          x: p.x + h.z * offset,
          z: p.z - h.x * offset,
          kind: ["laser", "shield", "turbo"][i % 3],
        };
      }),
    };
    world.dispose();
    return [track.id, data];
  }),
);
writeFileSync(
  new URL("../src/online-course-data.json", import.meta.url),
  JSON.stringify(result),
);
console.log("Baked authoritative courses:", Object.keys(result).join(", "));
