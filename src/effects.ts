import * as THREE from "three";
import type { VehicleState } from "./physics";

/** A bounded ring buffer of caster scuffs; a single draw call regardless of race length. */
export class CasterTrails {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private cursor = 0;
  private lastX = Infinity;
  private lastZ = Infinity;
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.1, 0.5),
      new THREE.MeshBasicMaterial({
        color: "#253132",
        transparent: true,
        opacity: 0.27,
        depthWrite: false,
      }),
      480,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.clear();
    scene.add(this.mesh);
  }
  clear() {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < 480; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cursor = 0;
    this.lastX = this.lastZ = Infinity;
  }
  update(state: VehicleState) {
    if (
      !state.drifting ||
      Math.hypot(state.x - this.lastX, state.z - this.lastZ) < 0.25
    )
      return;
    this.lastX = state.x;
    this.lastZ = state.z;
    for (const side of [-1, 1]) {
      this.dummy.position.set(
        state.x + Math.cos(state.yaw) * side * 0.46,
        0.071,
        state.z - Math.sin(state.yaw) * side * 0.46,
      );
      this.dummy.rotation.set(-Math.PI / 2, 0, -Math.atan2(state.vx, state.vz));
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(this.cursor++ % 480, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
