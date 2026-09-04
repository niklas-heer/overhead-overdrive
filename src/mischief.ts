import * as THREE from "three";
import type { VehicleState } from "./physics";
import type { Track } from "./world";

export type MischiefEvent = {
  racerIndex: number;
  kind: "papers" | "rattle" | "leaves";
  title: string;
};

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  spin: number;
  size: number;
};

/** A narrow optional line rewards confident driving without leaving the safe road. */
export function momentLane(curve: THREE.Curve<THREE.Vector3>, track: Track) {
  const fraction =
    track.theme === "indoor" ? 0.26 : track.theme === "campus" ? 0.4 : 0.61;
  const center = curve.getPointAt(fraction);
  const tangent = curve.getTangentAt(fraction).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
  center.addScaledVector(right, -track.width * 0.21);
  return { center, tangent, right, halfWidth: 1.2, halfLength: 4.1 };
}

/** Applies one speed reward only while travelling forward along the painted lane. */
export function crossMomentLane(
  state: VehicleState,
  lane: ReturnType<typeof momentLane>,
): boolean {
  const dx = state.x - lane.center.x,
    dz = state.z - lane.center.z;
  if (
    Math.abs(dx * lane.right.x + dz * lane.right.z) > lane.halfWidth ||
    Math.abs(dx * lane.tangent.x + dz * lane.tangent.z) > lane.halfLength
  )
    return false;
  const speed = Math.hypot(state.vx, state.vz);
  const along = state.vx * lane.tangent.x + state.vz * lane.tangent.z;
  if (speed < 5 || along < speed * 0.65) return false;
  const impulse = Math.max(0, Math.min(2.8, 27 - speed));
  state.vx += (state.vx / speed) * impulse;
  state.vz += (state.vz / speed) * impulse;
  state.speed = Math.hypot(state.vx, state.vz);
  state.boost = Math.min(1, state.boost + 0.12);
  return true;
}

/** Call update after vehicle simulation, with the player first. Pause with active=false.
 * Events can drive a short player toast or sound. Owns and disposes all its geometry. */
export class SchoolMischief {
  readonly group = new THREE.Group();
  readonly lane: ReturnType<typeof momentLane>;
  private readonly particles: Particle[] = [];
  private readonly fragments: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly cleaner = new THREE.Group();
  private readonly brush = new THREE.Group();
  private readonly eyes: THREE.Mesh[] = [];
  private readonly stack = new THREE.Group();
  private cooldowns = new WeakMap<VehicleState, number>();
  private triggered = new WeakSet<VehicleState>();
  private readonly robotCenter: THREE.Vector3;
  private readonly robotRight: THREE.Vector3;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly kind: MischiefEvent["kind"];
  private time = 0;
  private cursor = 0;
  private robotOffset = 0;
  private burst = 0;
  private readonly count = 96;
  private readonly track: Track;
  private readonly boxGeo: THREE.BoxGeometry;

  constructor(
    scene: THREE.Scene,
    world: { curve: THREE.Curve<THREE.Vector3> },
    track: Track,
  ) {
    this.track = track;
    this.kind =
      track.theme === "indoor"
        ? "papers"
        : track.theme === "campus"
          ? "rattle"
          : "leaves";
    this.group.name = `school-mischief-${track.id}`;
    scene.add(this.group);
    this.lane = momentLane(world.curve, track);
    this.boxGeo = this.geometry(new THREE.BoxGeometry(1, 1, 1));
    const cream = this.material("#fff0c7");
    const ink = this.material("#294653");
    const accent = this.material(
      track.theme === "park" ? "#edaa38" : "#f0c548",
    );
    const pink = this.material("#ef6c70");
    const mint = this.material("#62c5ad");
    const lane = new THREE.Group();
    lane.name = "optional-speed-lane";
    lane.position.copy(this.lane.center);
    lane.rotation.y = Math.atan2(this.lane.tangent.x, this.lane.tangent.z);
    this.group.add(lane);
    this.box(lane, 0, 0.083, 0, 2.6, 0.035, 8.8, ink);
    for (const side of [-1, 1])
      this.box(lane, side * 1.27, 0.107, 0, 0.07, 0.02, 8.8, accent);
    // Low, unmistakably directional floor chevrons; nothing floats in the camera view.
    for (let z = -3; z <= 3; z += 1.5) {
      for (const side of [-1, 1]) {
        const arrow = this.box(
          lane,
          side * 0.39,
          0.112,
          z,
          0.15,
          0.015,
          1.1,
          accent,
        );
        arrow.rotation.y = -side * 0.78;
      }
      if (this.kind === "rattle")
        this.box(lane, 0, 0.121, z - 0.6, 2.2, 0.028, 0.12, cream);
    }
    this.stack.position
      .copy(this.lane.center)
      .addScaledVector(this.lane.right, -1.9);
    this.stack.rotation.y = lane.rotation.y;
    this.group.add(this.stack);
    if (this.kind === "papers") {
      // Forgotten exercise books and a small stack of loose worksheets.
      for (let i = 0; i < 5; i++) {
        const book = new THREE.Group();
        this.stack.add(book);
        book.position.set(Math.sin(i * 3) * 0.08, 0.12 + i * 0.18, 0);
        book.rotation.y = Math.sin(i * 2) * 0.18;
        this.box(book, 0, 0, 0, 0.85, 0.16, 0.63, i % 2 ? pink : mint);
        this.box(book, 0.025, 0, 0.015, 0.83, 0.11, 0.59, cream);
      }
      for (let i = 0; i < 5; i++) {
        const sheet = this.box(
          this.stack,
          0,
          1.02 + i * 0.012,
          0,
          0.63,
          0.01,
          0.78,
          cream,
        );
        sheet.rotation.y = i * 0.08;
      }
    } else if (this.kind === "leaves") {
      for (let i = 0; i < 14; i++) {
        const leaf = this.box(
          this.stack,
          Math.sin(i * 7) * 0.65,
          0.12 + (i % 3) * 0.055,
          Math.cos(i * 3) * 0.6,
          0.26,
          0.025,
          0.48,
          i % 3 ? accent : pink,
        );
        leaf.rotation.y = i * 1.8;
        leaf.rotation.z = Math.sin(i) * 0.4;
      }
    } else {
      // Small pennants make the textured maintenance lane feel intentionally playable.
      for (const side of [-1, 1]) {
        this.box(lane, side * 1.65, 0.6, -3.9, 0.06, 1, 0.06, ink);
        this.box(lane, side * 1.48, 0.94, -3.9, 0.4, 0.26, 0.025, accent);
      }
    }
    const fragmentGeo = this.geometry(new THREE.PlaneGeometry(1, 1));
    const fragmentMat = new THREE.MeshStandardMaterial({
      color: this.kind === "leaves" ? "#efa636" : "#fff2d1",
      side: THREE.DoubleSide,
      roughness: 0.86,
    });
    this.materials.add(fragmentMat);
    this.fragments = new THREE.InstancedMesh(
      fragmentGeo,
      fragmentMat,
      this.count,
    );
    this.fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragments.frustumCulled = false;
    this.group.add(this.fragments);
    for (let i = 0; i < this.count; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 99,
        spin: i * 2.399,
        size: 0,
      });
      this.fragments.setColorAt(
        i,
        new THREE.Color(
          this.kind === "leaves"
            ? ["#dda441", "#b96b37", "#f6ce62"][i % 3]
            : "#fff2d1",
        ),
      );
    }
    // The school caretaker robot is deliberately non-solid: it yields, never traps a racer.
    this.robotCenter = world.curve.getPointAt(
      track.theme === "indoor" ? 0.72 : 0.82,
    );
    const rt = world.curve.getTangentAt(track.theme === "indoor" ? 0.72 : 0.82);
    this.robotRight = new THREE.Vector3(rt.z, 0, -rt.x).normalize();
    this.cleaner.name = "anxious-caretaker";
    this.group.add(this.cleaner);
    const shell = new THREE.Mesh(
      this.geometry(new THREE.CylinderGeometry(0.52, 0.57, 0.3, 16)),
      mint,
    );
    shell.position.y = 0.26;
    this.cleaner.add(shell);
    this.box(this.cleaner, 0, 0.34, 0.49, 0.65, 0.19, 0.075, ink);
    for (const x of [-0.17, 0.17])
      this.eyes.push(
        this.box(this.cleaner, x, 0.36, 0.535, 0.11, 0.07, 0.025, cream),
      );
    this.box(this.cleaner, 0, 0.46, 0, 0.2, 0.09, 0.2, accent);
    this.brush.position.set(0, 0.12, 0.58);
    this.cleaner.add(this.brush);
    for (let i = 0; i < 6; i++) {
      const bristle = this.box(this.brush, 0, 0, 0, 0.74, 0.04, 0.035, cream);
      bristle.rotation.y = (i * Math.PI) / 6;
    }
    this.reset();
  }

  private geometry<T extends THREE.BufferGeometry>(value: T): T {
    this.geometries.add(value);
    return value;
  }
  private material(color: string) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
    this.materials.add(material);
    return material;
  }
  private box(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(this.boxGeo, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private scatter(state: VehicleState) {
    const amount = this.kind === "rattle" ? 12 : 34;
    for (let i = 0; i < amount; i++) {
      const p = this.particles[this.cursor++ % this.count];
      const angle = p.spin + this.time * 1.7;
      p.x = state.x + Math.sin(angle) * 0.85;
      p.z = state.z + Math.cos(angle) * 0.85;
      p.y = 0.18;
      p.vx = state.vx * 0.16 + Math.sin(angle) * 2;
      p.vz = state.vz * 0.16 + Math.cos(angle) * 2;
      p.vy = 2.5 + (i % 5) * 0.42;
      p.age = 0;
      p.size =
        this.kind === "rattle" ? 0.06 : this.kind === "papers" ? 0.38 : 0.22;
    }
    this.burst = 1;
  }

  update(
    dt: number,
    states: readonly VehicleState[],
    active: boolean,
  ): MischiefEvent[] {
    if (!active || !Number.isFinite(dt) || dt <= 0) return [];
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const events: MischiefEvent[] = [];
    states.forEach((state, racerIndex) => {
      const cooldown = Math.max(0, (this.cooldowns.get(state) ?? 0) - dt);
      this.cooldowns.set(state, cooldown);
      const dx = state.x - this.lane.center.x;
      const dz = state.z - this.lane.center.z;
      const outside =
        Math.abs(dx * this.lane.right.x + dz * this.lane.right.z) >
          this.lane.halfWidth + 0.8 ||
        Math.abs(dx * this.lane.tangent.x + dz * this.lane.tangent.z) >
          this.lane.halfLength + 1;
      if (outside) this.triggered.delete(state);
      if (
        cooldown === 0 &&
        !this.triggered.has(state) &&
        crossMomentLane(state, this.lane)
      ) {
        this.triggered.add(state);
        this.cooldowns.set(state, 4);
        if (this.kind === "rattle")
          state.wobble = Math.max(-0.13, Math.min(0.13, state.wobble + 0.07));
        this.scatter(state);
        events.push({
          racerIndex,
          kind: this.kind,
          title:
            this.kind === "papers"
              ? "HOMEWORK? AIRMAIL!"
              : this.kind === "rattle"
                ? "RATTLE EXPRESS!"
                : "LEAF IT TO ME!",
        });
      }
    });
    this.burst = Math.max(0, this.burst - dt * 1.8);
    this.stack.rotation.z = Math.sin(this.time * 20) * this.burst * 0.1;
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age < 2.4) {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.y = Math.max(0.12, p.y + p.vy * dt);
        p.vy -= dt * 3.4;
        p.vx *= Math.exp(-dt * 0.9);
        p.vz *= Math.exp(-dt * 0.9);
        const size = p.size * Math.min(1, (2.4 - p.age) * 2);
        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.rotation.set(
          -Math.PI / 2 + Math.sin(p.age * 7 + p.spin),
          p.spin + p.age * 2,
          p.age * 1.8,
        );
        this.dummy.scale.set(size, size * 1.35, size);
      } else this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.fragments.setMatrixAt(i, this.dummy.matrix);
    }
    this.fragments.instanceMatrix.needsUpdate = true;
    const approaching = states.some(
      (s) =>
        Math.hypot(s.x - this.robotCenter.x, s.z - this.robotCenter.z) < 12 &&
        Math.hypot(s.vx, s.vz) > 2,
    );
    const edge = this.track.width * 0.5 + 0.35;
    const desired = approaching
      ? this.robotOffset >= 0
        ? edge
        : -edge
      : Math.sin(this.time * 0.33) * (edge - 0.8);
    this.robotOffset += THREE.MathUtils.clamp(
      desired - this.robotOffset,
      -dt * (approaching ? 8 : 1.1),
      dt * (approaching ? 8 : 1.1),
    );
    this.cleaner.position
      .copy(this.robotCenter)
      .addScaledVector(this.robotRight, this.robotOffset);
    this.cleaner.rotation.y =
      Math.atan2(this.robotRight.x, this.robotRight.z) +
      (desired < this.robotOffset ? Math.PI : 0);
    this.cleaner.rotation.z = approaching
      ? Math.sin(this.time * 27) * 0.035
      : 0;
    this.brush.rotation.y += dt * (approaching ? 20 : 5);
    for (const eye of this.eyes) eye.scale.y = approaching ? 0.13 : 0.07;
    return events;
  }

  reset() {
    this.time = this.cursor = this.burst = 0;
    this.cooldowns = new WeakMap();
    this.triggered = new WeakSet();
    this.robotOffset = this.track.width * 0.5 + 0.35;
    this.cleaner.position
      .copy(this.robotCenter)
      .addScaledVector(this.robotRight, this.robotOffset);
    this.stack.rotation.z = 0;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.particles.forEach((p, i) => {
      p.age = 99;
      this.fragments.setMatrixAt(i, this.dummy.matrix);
    });
    this.fragments.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    this.fragments.dispose();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.cooldowns = new WeakMap();
    this.triggered = new WeakSet();
  }
}
