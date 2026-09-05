import * as THREE from "three";
import type { VehicleState } from "./physics";

const stickColors = (color: string) => ({
  skin: color,
  hair: color,
  top: color,
  accent: color,
  bottom: color,
  shoes: color,
});
export const RIDERS = [
  {
    name: "The Doodler",
    tag: "DRAWN TO SPEED",
    description:
      "An orange doodle with a big grin, bold lines and a habit of coloring outside the racing line.",
    colors: stickColors("#f28a4b"),
  },
  {
    name: "Lab Partner",
    tag: "A BRIGHT LITTLE EXPERIMENT",
    description:
      "A mint-green stick figure testing the scientific limits of a very wobbly trolley.",
    colors: stickColors("#54cbb8"),
  },
  {
    name: "Lunch Break",
    tag: "ONE MORE LAP",
    description:
      "A sunny yellow scribble who heard the bell and took the scenic route.",
    colors: stickColors("#f1c947"),
  },
  {
    name: "Night Shift",
    tag: "AFTER THE LAST BELL",
    description:
      "A lilac doodle with quiet confidence and a mischievous little victory wave.",
    colors: stickColors("#a18add"),
  },
] as const;
export type RiderProfile = (typeof RIDERS)[number];
export type RiderAnimationOptions = {
  idle: boolean;
  stun: number;
  turbo: boolean;
  celebrating: boolean;
};
export type RiderRig = {
  group: THREE.Group;
  profile: RiderProfile;
  hands: readonly [THREE.Mesh, THREE.Mesh];
  feet: readonly [THREE.Group, THREE.Group];
  dispose(): void;
};
type Limb = {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  joint: THREE.Mesh;
  upperLength: number;
  lowerLength: number;
  pole: THREE.Vector3;
};
type InternalRig = RiderRig & {
  torso: THREE.Group;
  head: THREE.Group;
  scarf: THREE.Group[];
  arms: Limb[];
  legs: Limb[];
  shoulders: THREE.Vector3[];
  hips: THREE.Vector3[];
  shoeAnchors: THREE.Vector3[];
  lean: number;
  crouch: number;
  nod: number;
  look: number;
  cheer: number;
  disposed: boolean;
  dynamicBatches: { batch: THREE.InstancedMesh; sources: THREE.Mesh[] }[];
};
const rigs = new WeakMap<THREE.Group, InternalRig>();
const UP = new THREE.Vector3(0, 1, 0);
const normalInput = (n: number, fallback = 0) =>
  Number.isFinite(n) ? n : fallback;
const clamp = THREE.MathUtils.clamp;

/** Adds a cheerful, single-color 3D stick figure to the trolley's rear deck. */
export function attachRider(projector: THREE.Group, style = 0): RiderRig {
  rigs.get(projector)?.dispose();
  const index =
    ((Math.trunc(normalInput(style)) % RIDERS.length) + RIDERS.length) %
    RIDERS.length;
  const profile = RIDERS[index],
    parent = projector.getObjectByName("body") ?? projector;
  const group = new THREE.Group();
  group.name = "rider";
  parent.add(group);
  const sphere = new THREE.SphereGeometry(1, 12, 9),
    cube = new THREE.BoxGeometry(1, 1, 1),
    capsule = new THREE.CapsuleGeometry(1, 1, 4, 8);
  const color = new THREE.MeshStandardMaterial({
    color: profile.colors.top,
    roughness: 0.8,
  });
  const ink = new THREE.MeshStandardMaterial({
    color: "#26383d",
    roughness: 0.88,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: "#8e9b98",
    roughness: 0.45,
    metalness: 0.45,
  });
  const geometries = new Set<THREE.BufferGeometry>([sphere, cube, capsule]);
  const materials = new Set<THREE.Material>([color, ink, steel]);
  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    owner: THREE.Object3D = group,
  ) {
    const m = new THREE.Mesh(geometry, material);
    m.name = "rider-detail";
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    owner.add(m);
    return m;
  }
  const ball = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    material: THREE.Material = color,
    owner: THREE.Object3D = group,
  ) => mesh(sphere, material, x, y, z, sx, sy, sz, owner);
  const box = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    material: THREE.Material,
    owner: THREE.Object3D = group,
  ) => mesh(cube, material, x, y, z, sx, sy, sz, owner);
  // The familiar deck stays physically connected to the trolley's lower shelf.
  box(0, 0.385, -0.96, 0.92, 0.085, 0.76, steel);
  box(0, 0.434, -1.02, 0.8, 0.014, 0.56, ink);
  for (const side of [-1, 1]) {
    box(side * 0.32, 0.355, -0.71, 0.065, 0.11, 0.65, steel);
    box(side * 0.38, 0.452, -1.02, 0.035, 0.012, 0.47, color);
  }
  const torso = new THREE.Group();
  torso.name = "rider-torso";
  group.add(torso);
  mesh(capsule, color, 0, 0.22, 0, 0.079, 0.48 / 3, 0.079, torso);
  ball(0, -0.025, 0, 0.085, 0.065, 0.075, color, torso);
  const head = new THREE.Group();
  head.name = "rider-head";
  head.position.set(0, 0.635, 0);
  torso.add(head);
  // A pure round head and three black marks: no skin, hair, clothes or floating face textures.
  ball(0, 0, 0, 0.204, 0.204, 0.204, color, head);
  for (const side of [-1, 1])
    ball(side * 0.067, 0.041, 0.189, 0.019, 0.023, 0.011, ink, head);
  const smileGeometry = new THREE.TorusGeometry(0.051, 0.008, 5, 16, Math.PI);
  geometries.add(smileGeometry);
  const smile = mesh(smileGeometry, ink, 0, -0.042, 0.2, 1, 1, 1, head);
  smile.rotation.z = Math.PI;
  const hands: THREE.Mesh[] = [],
    feet: THREE.Group[] = [],
    arms: Limb[] = [],
    legs: Limb[] = [],
    shoulders: THREE.Vector3[] = [],
    hips: THREE.Vector3[] = [],
    shoeAnchors: THREE.Vector3[] = [];
  function limb(
    radius: number,
    upperLength: number,
    lowerLength: number,
    pole: THREE.Vector3,
  ): Limb {
    return {
      upper: mesh(capsule, color, 0, 0, 0, radius, 1, radius),
      lower: mesh(capsule, color, 0, 0, 0, radius * 0.92, 1, radius * 0.92),
      joint: ball(0, 0, 0, radius, radius, radius),
      upperLength,
      lowerLength,
      pole,
    };
  }
  for (const side of [-1, 1]) {
    shoulders.push(new THREE.Vector3(side * 0.06, 0.355, 0));
    hips.push(new THREE.Vector3(side * 0.06, -0.045, 0));
    arms.push(
      limb(0.046, 0.33, 0.32, new THREE.Vector3(side * 0.9, -0.25, -0.4)),
    );
    legs.push(limb(0.051, 0.31, 0.31, new THREE.Vector3(side * 0.13, 0, 1)));
    const sideName = side < 0 ? "left" : "right";
    for (const [kind, chain] of [
      ["arm", arms.at(-1)!],
      ["leg", legs.at(-1)!],
    ] as const) {
      chain.upper.name = `rider-${kind}-${sideName}-upper`;
      chain.lower.name = `rider-${kind}-${sideName}-lower`;
      chain.joint.name = `rider-${kind}-${sideName}-joint`;
    }
    const hand = ball(side * 0.34, 1.23, -0.66, 0.053, 0.053, 0.057);
    hand.name = `rider-hand-${sideName}`;
    hands.push(hand);
    const foot = new THREE.Group();
    foot.name = `rider-foot-${sideName}`;
    foot.position.set(side * 0.205, 0.485, -1.035);
    group.add(foot);
    ball(0, 0, 0.01, 0.065, 0.055, 0.11, color, foot);
    feet.push(foot);
    shoeAnchors.push(new THREE.Vector3(side * 0.205, 0.535, -1.07));
  }
  let rig: InternalRig;
  rig = {
    group,
    profile,
    torso,
    head,
    scarf: [],
    arms,
    legs,
    shoulders,
    hips,
    shoeAnchors,
    hands: hands as [THREE.Mesh, THREE.Mesh],
    feet: feet as [THREE.Group, THREE.Group],
    lean: 0,
    crouch: 0,
    nod: 0,
    look: 0,
    cheer: 0,
    disposed: false,
    dynamicBatches: [],
    dispose() {
      if (rig.disposed) return;
      rig.disposed = true;
      group.removeFromParent();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (o instanceof THREE.InstancedMesh) o.dispose();
          geometries.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            materials.add(m);
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      if (rigs.get(projector) === rig) rigs.delete(projector);
    },
  };
  rigs.set(projector, rig);
  // Keep named endpoint meshes as the rig, while drawing the eight bones and six joints in two batches.
  const dynamicSources = [...arms, ...legs]
    .flatMap((l) => [l.upper, l.lower, l.joint])
    .concat(hands);
  for (const geometry of [capsule, sphere]) {
    const sources = dynamicSources.filter((m) => m.geometry === geometry),
      batch = new THREE.InstancedMesh(geometry, color, sources.length);
    batch.name = "rider-articulated-lines";
    batch.castShadow = true;
    batch.receiveShadow = true;
    batch.frustumCulled = false;
    sources.forEach((m) => {
      m.visible = false;
    });
    group.add(batch);
    rig.dynamicBatches.push({ batch, sources });
  }
  // Small static detail batches are scoped to articulated parts, so head expressions remain independent.
  for (const owner of [head, torso, ...feet, group]) {
    const batches = new Map<string, THREE.Mesh[]>();
    for (const child of owner.children) {
      if (
        !(child instanceof THREE.Mesh) ||
        child instanceof THREE.InstancedMesh ||
        Array.isArray(child.material) ||
        dynamicSources.includes(child)
      )
        continue;
      const key = child.geometry.uuid + child.material.uuid,
        list = batches.get(key) ?? [];
      list.push(child);
      batches.set(key, list);
    }
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const batch = new THREE.InstancedMesh(
        meshes[0].geometry,
        meshes[0].material,
        meshes.length,
      );
      batch.name = "rider-details";
      batch.castShadow = true;
      batch.receiveShadow = true;
      meshes.forEach((m, i) => {
        m.updateMatrix();
        batch.setMatrixAt(i, m.matrix);
        m.removeFromParent();
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingSphere();
      owner.add(batch);
    }
  }
  pose(rig, 0, { idle: false, stun: 0, turbo: false, celebrating: false });
  return rig;
}

const boneDirection = new THREE.Vector3(),
  poleNormal = new THREE.Vector3(),
  jointPoint = new THREE.Vector3(),
  startPoint = new THREE.Vector3(),
  endPoint = new THREE.Vector3();
function segment(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) {
  boneDirection.subVectors(end, start);
  const length = boneDirection.length();
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.scale.y = length / 3;
  if (length > 1e-7)
    mesh.quaternion.setFromUnitVectors(UP, boneDirection.divideScalar(length));
}
/** Law-of-cosines two-bone solve in trolley-local coordinates; endpoints never drift with torso lean. */
function solve(limb: Limb, start: THREE.Vector3, end: THREE.Vector3) {
  boneDirection.subVectors(end, start);
  const actualDistance = boneDirection.length();
  if (actualDistance < 1e-7) boneDirection.copy(UP);
  else boneDirection.divideScalar(actualDistance);
  const distance = clamp(
    actualDistance,
    1e-5,
    limb.upperLength + limb.lowerLength - 1e-5,
  );
  const along =
    (limb.upperLength ** 2 - limb.lowerLength ** 2 + distance ** 2) /
    (2 * distance);
  const height = Math.sqrt(Math.max(0, limb.upperLength ** 2 - along ** 2));
  poleNormal
    .copy(limb.pole)
    .addScaledVector(boneDirection, -limb.pole.dot(boneDirection));
  if (poleNormal.lengthSq() < 1e-7) poleNormal.set(1, 0, 0);
  poleNormal.normalize();
  jointPoint
    .copy(start)
    .addScaledVector(boneDirection, along)
    .addScaledVector(poleNormal, height);
  limb.joint.position.copy(jointPoint);
  segment(limb.upper, start, jointPoint);
  segment(limb.lower, jointPoint, end);
}
function pose(rig: InternalRig, time: number, options: RiderAnimationOptions) {
  const breathe = options.idle
    ? Math.sin(time * 1.8) * 0.013
    : Math.sin(time * 2.3) * 0.005;
  rig.torso.position.set(
    -rig.lean * 0.15,
    1.12 - rig.crouch * 0.13 + breathe,
    -1.055 + rig.crouch * 0.12,
  );
  rig.torso.rotation.set(-rig.crouch * 0.15, 0, rig.lean * 0.34);
  rig.torso.updateMatrix();
  rig.head.rotation.set(rig.nod, rig.look, -rig.lean * 0.19);
  for (let i = 0; i < 2; i++) {
    startPoint.copy(rig.shoulders[i]).applyMatrix4(rig.torso.matrix);
    endPoint.set(i === 0 ? -0.34 : 0.34, 1.23, -0.66);
    if (i === 1 && rig.cheer > 0) {
      const wave = Math.sin(time * 7) * 0.07;
      endPoint.lerp(
        new THREE.Vector3(0.53 + wave, 1.99 + wave, -0.99),
        rig.cheer,
      );
    }
    rig.hands[i].position.copy(endPoint);
    rig.hands[i].rotation.set(0, 0, i === 1 ? -rig.cheer * 0.4 : 0);
    solve(rig.arms[i], startPoint, endPoint);
    startPoint.copy(rig.hips[i]).applyMatrix4(rig.torso.matrix);
    solve(rig.legs[i], startPoint, rig.shoeAnchors[i]);
    const speedFlutter = rig.crouch * 0.18;
    rig.scarf[i]?.rotation.set(
      -0.3 -
        speedFlutter +
        Math.sin(time * (options.turbo ? 21 : 12) + i) * (0.04 + speedFlutter),
      Math.sin(time * 9 + i) * (0.04 + speedFlutter),
      rig.lean * 0.35,
    );
  }
  for (const { batch, sources } of rig.dynamicBatches) {
    sources.forEach((source, index) => {
      source.updateMatrix();
      batch.setMatrixAt(index, source.matrix);
    });
    batch.instanceMatrix.needsUpdate = true;
  }
}

/** Purely visual animation. A zero/invalid dt leaves every joint untouched (including paused races). */
export function animateRider(
  projector: THREE.Group,
  state: Readonly<VehicleState>,
  dt: number,
  time: number,
  options: RiderAnimationOptions,
) {
  const rig = rigs.get(projector);
  if (!rig || rig.disposed || !Number.isFinite(dt) || dt <= 0) return;
  const follow = 1 - Math.exp(-Math.min(dt, 0.06) * 10),
    speed = Math.abs(normalInput(state.speed));
  const lean = clamp(
    normalInput(state.yawRate) * 0.23 + normalInput(state.roll) * 0.65,
    -0.6,
    0.6,
  );
  const brace =
    options.stun > 0 ? 1 : clamp(normalInput(state.collision) * 0.8, 0, 1);
  rig.lean = THREE.MathUtils.lerp(rig.lean, lean, follow);
  rig.crouch = THREE.MathUtils.lerp(
    rig.crouch,
    clamp(speed / 35 + (options.turbo ? 0.28 : 0) + brace * 0.25, 0, 1),
    follow,
  );
  rig.nod = THREE.MathUtils.lerp(
    rig.nod,
    brace * 0.17 +
      (options.turbo ? 0.08 : 0) +
      (options.celebrating ? Math.sin(normalInput(time) * 6) * 0.07 : 0),
    follow,
  );
  rig.look = THREE.MathUtils.lerp(
    rig.look,
    clamp(normalInput(state.yawRate) * 0.38, -0.46, 0.46) +
      (options.idle ? Math.sin(normalInput(time) * 0.7) * 0.17 : 0),
    follow,
  );
  // Only a finished-race celebration releases the right hand; normal driving stays firmly attached.
  rig.cheer = options.celebrating
    ? THREE.MathUtils.lerp(rig.cheer, 1, follow)
    : 0;
  pose(rig, normalInput(time), options);
}
