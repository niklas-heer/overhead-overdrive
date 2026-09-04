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

/** Short-lived caster sparks: one bounded draw call, independent of lap count. */
export class DriftSparks {
  private mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private particles = Array.from({ length: 192 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vz: 0,
    life: 0,
    hot: false,
  }));
  private cursor = 0;
  private emission = 0;
  private cyan = new THREE.Color("#75e8ee");
  private gold = new THREE.Color("#ffbf55");
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
      this.particles.length,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.clear();
  }
  clear() {
    for (const p of this.particles) p.life = 0;
    this.cursor = this.emission = 0;
    this.update(0, []);
  }
  update(dt: number, states: readonly VehicleState[]) {
    this.mesh.visible = states.length > 0;
    this.emission += dt;
    if (this.emission > 1 / 40) {
      this.emission %= 1 / 40;
      for (const s of states) {
        if (s.driftCharge <= 0.08 && s.driftTurbo <= 0) continue;
        for (const side of [-1, 1]) {
          const p = this.particles[this.cursor++ % this.particles.length];
          const jitter = Math.sin(this.cursor * 12.98);
          p.x = s.x + Math.cos(s.yaw) * side * 0.47 - Math.sin(s.yaw) * 0.45;
          p.y = 0.2;
          p.z = s.z - Math.sin(s.yaw) * side * 0.47 - Math.cos(s.yaw) * 0.45;
          p.vx = -Math.sin(s.yaw) * 2 + Math.cos(s.yaw) * side * (1 + jitter);
          p.vz = -Math.cos(s.yaw) * 2 - Math.sin(s.yaw) * side * (1 + jitter);
          p.life = 0.36;
          p.hot = s.driftCharge >= 0.45 || s.driftTurbo > 0;
        }
      }
    }
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life = Math.max(0, p.life - dt);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y = 0.12 + Math.sin(((0.36 - p.life) / 0.36) * Math.PI) * 0.2;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(p.life > 0 ? (0.055 * p.life) / 0.36 : 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.hot ? this.gold : this.cyan);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
