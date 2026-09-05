import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  attachRider,
  animateRider,
  RIDERS,
  type RiderAnimationOptions,
} from "./rider";
import { createVehicle } from "./physics";
const normal: RiderAnimationOptions = {
  idle: false,
  stun: 0,
  turbo: false,
  celebrating: false,
};
function trolley() {
  const projector = new THREE.Group(),
    body = new THREE.Group();
  body.name = "body";
  projector.add(body);
  return { projector, body };
}
const position = (object: THREE.Object3D) =>
  object.getWorldPosition(new THREE.Vector3());
const boneEnd = (bone: THREE.Object3D, side: number) =>
  bone.localToWorld(new THREE.Vector3(0, side * 1.5, 0));
function expectNear(a: THREE.Vector3, b: THREE.Vector3) {
  expect(a.distanceTo(b)).toBeLessThan(1e-6);
}
function snapshot(group: THREE.Group) {
  const transforms: number[][] = [];
  group.traverse((o) =>
    transforms.push([...o.position, ...o.quaternion, ...o.scale]),
  );
  return transforms;
}

describe("riders", () => {
  it("renders the solved skeleton through synchronized instanced bones", () => {
    const { projector } = trolley(),
      rig = attachRider(projector),
      state = createVehicle(0, 0, 0);
    state.speed = 24;
    state.yawRate = 1.5;
    state.roll = 0.3;
    animateRider(projector, state, 1 / 30, 3, { ...normal, turbo: true });
    const batches = rig.group.children.filter(
      (o): o is THREE.InstancedMesh =>
        o instanceof THREE.InstancedMesh &&
        o.name === "rider-articulated-lines",
    );
    expect(batches).toHaveLength(2);
    const boneBatch = batches.find(
      (b) => b.geometry.type === "CapsuleGeometry",
    )!;
    const names = [
      "arm-left-upper",
      "arm-left-lower",
      "arm-right-upper",
      "arm-right-lower",
      "leg-left-upper",
      "leg-left-lower",
      "leg-right-upper",
      "leg-right-lower",
    ];
    expect(boneBatch.count).toBe(names.length);
    names.forEach((name, i) => {
      const source = rig.group.getObjectByName(`rider-${name}`)!;
      const rendered = new THREE.Matrix4();
      boneBatch.getMatrixAt(i, rendered);
      expect(source.visible).toBe(false);
      source.matrix.elements.forEach((value, j) =>
        expect(rendered.elements[j]).toBeCloseTo(value, 6),
      );
    });
    const before = Array.from(boneBatch.instanceMatrix.array);
    animateRider(projector, state, 0, 99, { ...normal, celebrating: true });
    expect(Array.from(boneBatch.instanceMatrix.array)).toEqual(before);
    rig.dispose();
  });

  it.each([0, 1, 2, 3])(
    "keeps hands, shoes and solved joints attached through driving poses: profile %s",
    (style) => {
      const { projector, body } = trolley(),
        rig = attachRider(projector, style),
        state = createVehicle(7, -4, 0.8);
      projector.position.set(7, 0, -4);
      projector.rotation.y = 0.8;
      for (let tick = 0; tick < 180; tick++) {
        state.speed = 22 * Math.sin(tick * 0.09);
        state.yawRate = Math.sin(tick * 0.16) * 2.1;
        state.roll = Math.sin(tick * 0.12) * 0.36;
        state.pitch = Math.cos(tick * 0.18) * 0.27;
        state.collision = tick % 43 === 0 ? 1 : 0;
        body.rotation.set(state.pitch, 0, -state.roll);
        const options = {
          ...normal,
          idle: tick < 12,
          stun: tick > 75 && tick < 85 ? 1 : 0,
          turbo: tick > 110,
        };
        const before = { ...state };
        animateRider(
          projector,
          Object.freeze({ ...state }),
          1 / 60,
          tick / 60,
          options,
        );
        expect(state).toEqual(before);
        projector.updateMatrixWorld(true);
        for (let i = 0; i < 2; i++) {
          const side = i === 0 ? -1 : 1,
            sideName = i === 0 ? "left" : "right";
          expectNear(
            position(rig.hands[i]),
            body.localToWorld(new THREE.Vector3(side * 0.34, 1.23, -0.66)),
          );
          expectNear(
            position(rig.feet[i]),
            body.localToWorld(new THREE.Vector3(side * 0.205, 0.485, -1.035)),
          );
          for (const kind of ["arm", "leg"]) {
            const upper = rig.group.getObjectByName(
                `rider-${kind}-${sideName}-upper`,
              )!,
              lower = rig.group.getObjectByName(
                `rider-${kind}-${sideName}-lower`,
              )!;
            expectNear(boneEnd(upper, 1), boneEnd(lower, -1));
            expectNear(
              boneEnd(lower, 1),
              kind === "arm"
                ? position(rig.hands[i])
                : body.localToWorld(
                    new THREE.Vector3(side * 0.205, 0.535, -1.07),
                  ),
            );
          }
        }
        for (const values of snapshot(rig.group))
          expect(values.every(Number.isFinite)).toBe(true);
      }
      expect(rig.profile).toBe(RIDERS[style]);
      rig.dispose();
    },
  );
  it("releases only the right hand during a finish celebration and regrips immediately", () => {
    const { projector } = trolley(),
      rig = attachRider(projector),
      state = createVehicle(0, 0, 0);
    for (let i = 0; i < 90; i++)
      animateRider(projector, state, 1 / 60, i / 60, {
        ...normal,
        celebrating: true,
      });
    expectNear(rig.hands[0].position, new THREE.Vector3(-0.34, 1.23, -0.66));
    expect(rig.hands[1].position.y).toBeGreaterThan(1.8);
    animateRider(projector, state, 1 / 60, 2, normal);
    expectNear(rig.hands[1].position, new THREE.Vector3(0.34, 1.23, -0.66));
    rig.dispose();
  });
  it("does not animate while paused even when the caller's clock advances", () => {
    const { projector } = trolley(),
      rig = attachRider(projector),
      state = createVehicle(0, 0, 0);
    state.speed = 18;
    animateRider(projector, state, 1 / 60, 1, { ...normal, turbo: true });
    const before = snapshot(rig.group);
    for (const dt of [0, -1, NaN])
      animateRider(projector, state, dt, 100, { ...normal, celebrating: true });
    expect(snapshot(rig.group)).toEqual(before);
    rig.dispose();
  });
  it("owns resources per rider, replaces cleanly and disposes idempotently", () => {
    const a = trolley(),
      b = trolley(),
      first = attachRider(a.projector),
      second = attachRider(b.projector);
    const resources = (group: THREE.Group) => {
      const resources = new Set<THREE.BufferGeometry | THREE.Material>();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          resources.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            resources.add(m);
        }
      });
      return resources;
    };
    const aResources = resources(first.group),
      bResources = resources(second.group);
    for (const r of aResources) expect(bResources.has(r)).toBe(false);
    let disposalEvents = 0;
    for (const r of aResources)
      r.addEventListener("dispose", () => disposalEvents++);
    const replacement = attachRider(a.projector, 3);
    expect(first.group.parent).toBeNull();
    expect(a.body.children.filter((o) => o.name === "rider")).toHaveLength(1);
    expect(disposalEvents).toBe(aResources.size);
    first.dispose();
    expect(disposalEvents).toBe(aResources.size);
    replacement.dispose();
    second.dispose();
    expect(a.body.children).toHaveLength(0);
    expect(b.body.children).toHaveLength(0);
    expect(() =>
      animateRider(a.projector, createVehicle(0, 0, 0), 1 / 60, 1, normal),
    ).not.toThrow();
  });
});
