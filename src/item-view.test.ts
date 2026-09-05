import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createVehicle } from "./physics";
import { ItemSystem } from "./items";
import { ItemView } from "./item-view";

describe("repaint and rider changes", () => {
  it("rebinds the mounted laser to the replacement model, including head rotation", () => {
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera();
    const items = new ItemSystem([createVehicle(0, 0, 0)], [], [], []);
    const oldModel = new THREE.Group(),
      oldHead = new THREE.Group();
    oldHead.name = "projector-head";
    oldModel.add(oldHead);
    scene.add(oldModel);
    const view = new ItemView(scene, items, [oldModel]);
    items.equipment[0].item = "laser";
    view.update(0, camera, true);
    const pointer = view.group.children.find((o) => o instanceof THREE.Group)!;
    const replacement = new THREE.Group(),
      head = new THREE.Group();
    head.name = "projector-head";
    head.position.set(0, 2.4, -0.12);
    head.rotation.set(0.1, -0.3, 0.2);
    replacement.add(head);
    replacement.position.set(4, 0.055, 8);
    replacement.rotation.y = 0.75;
    scene.add(replacement);
    oldModel.removeFromParent();
    view.setVehicle(0, replacement);
    oldHead.position.set(100, 100, 100);
    view.update(1 / 60, camera, true);
    head.updateWorldMatrix(true, false);
    const expected = head.localToWorld(new THREE.Vector3(0.33, 0, 0.05));
    expect(
      pointer.getWorldPosition(new THREE.Vector3()).distanceTo(expected),
    ).toBeLessThan(1e-7);
    expect(
      pointer
        .getWorldQuaternion(new THREE.Quaternion())
        .angleTo(head.getWorldQuaternion(new THREE.Quaternion())),
    ).toBeLessThan(1e-7);
    expect(pointer.visible).toBe(true);
    view.dispose();
  });
});
