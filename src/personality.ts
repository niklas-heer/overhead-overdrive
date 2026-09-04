import * as THREE from "three";
import type { VehicleState } from "./physics";

type Rig = {
  head?: THREE.Object3D;
  mast?: THREE.Object3D;
  body?: THREE.Object3D;
  casters: THREE.Object3D[];
  wheels: THREE.Object3D[];
  wheelAngle: number;
};
const rigs = new WeakMap<THREE.Object3D, Rig>();
/** Cosmetic animation never changes the steering or collision body. */
export function animateProjector(
  mesh: THREE.Group,
  state: VehicleState,
  dt: number,
  time: number,
  options: {
    idle: boolean;
    stun: number;
    turbo: boolean;
    celebrating: boolean;
  },
) {
  let rig = rigs.get(mesh);
  if (!rig) {
    rig = {
      head: mesh.getObjectByName("projector-head"),
      mast: mesh.getObjectByName("mast"),
      body: mesh.getObjectByName("body"),
      casters: [],
      wheels: [],
      wheelAngle: 0,
    };
    mesh.traverse((o) => {
      if (o.name === "caster") rig!.casters.push(o);
      if (o.name === "wheel") rig!.wheels.push(o);
    });
    rigs.set(mesh, rig);
  }
  const follow = 1 - Math.exp(-Math.min(dt, 0.06) * 9);
  const idle = options.idle ? Math.sin(time * 1.1) : 0;
  if (rig.body) {
    rig.body.rotation.x = state.pitch;
    rig.body.rotation.z = -state.roll;
  }
  if (rig.mast) rig.mast.rotation.z = state.wobble + idle * 0.015;
  if (rig.head) {
    const sleepy = options.stun > 0 ? 0.36 : 0;
    const cheering = options.celebrating ? Math.sin(time * 7) * 0.14 : 0;
    rig.head.rotation.y = THREE.MathUtils.lerp(
      rig.head.rotation.y,
      THREE.MathUtils.clamp(state.yawRate * 0.32, -0.4, 0.4) + idle * 0.2,
      follow,
    );
    rig.head.rotation.x = THREE.MathUtils.lerp(
      rig.head.rotation.x,
      sleepy + (options.turbo ? -0.16 : 0) + cheering + state.collision * 0.12,
      follow,
    );
    rig.head.rotation.z = THREE.MathUtils.lerp(
      rig.head.rotation.z,
      -state.wobble * 0.4 + (options.stun > 0 ? Math.sin(time * 14) * 0.09 : 0),
      follow,
    );
    const lamp = rig.head.userData.lamp as
      THREE.MeshStandardMaterial | undefined;
    if (lamp)
      lamp.emissiveIntensity =
        options.stun > 0 ? 0.45 : options.turbo ? 2.1 : 1.15;
  }
  rig.wheelAngle += (state.speed * dt) / 0.13;
  for (const wheel of rig.wheels) wheel.rotation.y = rig.wheelAngle;
  for (const caster of rig.casters) {
    const front = caster.position.z > 0;
    caster.rotation.y = THREE.MathUtils.lerp(
      caster.rotation.y,
      (front ? state.yawRate * 0.25 : -state.yawRate * 0.1) +
        Math.sin(time * 28 + caster.position.x * 8) *
          Math.min(0.06, state.speed * 0.003),
      follow,
    );
  }
}
