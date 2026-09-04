import * as THREE from "three";
import { ITEM_INFO, type ItemSystem, type ItemEvent } from "./items";

type Flash = { mesh: THREE.Mesh; life: number; total: number };
export class ItemView {
  readonly group = new THREE.Group();
  private pickupMeshes: THREE.Group[] = [];
  private targetMeshes: THREE.Group[] = [];
  private shields: THREE.Mesh[] = [];
  private pointers: THREE.Group[] = [];
  private flashes: Flash[] = [];
  private time = 0;
  constructor(
    scene: THREE.Scene,
    private readonly items: ItemSystem,
  ) {
    this.group.name = "race-equipment";
    scene.add(this.group);
    for (const p of items.pickups) {
      const g = new THREE.Group(),
        info = ITEM_INFO[p.kind];
      g.position.set(p.x, 0, p.z);
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.72, 0.72),
        new THREE.MeshStandardMaterial({
          color: info.color,
          emissive: info.color,
          emissiveIntensity: 0.65,
          metalness: 0.35,
          roughness: 0.2,
        }),
      );
      cube.name = "floating";
      cube.position.y = 1.22;
      g.add(cube);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(cube.geometry),
        new THREE.LineBasicMaterial({ color: "#fff9e9" }),
      );
      cube.add(edges);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.045, 5, 28),
        new THREE.MeshBasicMaterial({
          color: info.color,
          transparent: true,
          opacity: 0.6,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      g.add(ring);
      g.add(
        this.label(
          p.kind === "laser"
            ? "LASER ×3"
            : p.kind === "shield"
              ? "SHIELD"
              : "TURBO",
          info.color,
        ),
      );
      this.group.add(g);
      this.pickupMeshes.push(g);
    }
    for (const t of items.targets) {
      const g = new THREE.Group();
      g.position.set(t.x, 1.55, t.z);
      const material = new THREE.MeshBasicMaterial({
        color: "#ff647d",
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      });
      g.add(
        new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.08, 6, 32), material),
      );
      g.add(
        new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 5, 24), material),
      );
      g.add(new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), material));
      const label = this.label("POP QUIZ", "#ff90a2");
      label.position.y = 1.05;
      g.add(label);
      this.group.add(g);
      this.targetMeshes.push(g);
    }
    for (let i = 0; i < items.equipment.length; i++) {
      const pointer = new THREE.Group();
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.075, 0.55, 12),
        new THREE.MeshStandardMaterial({
          color: "#263a42",
          metalness: 0.65,
          roughness: 0.35,
        }),
      );
      barrel.rotation.x = Math.PI / 2;
      pointer.add(barrel);
      const diode = new THREE.Mesh(
        new THREE.SphereGeometry(0.068, 10, 8),
        new THREE.MeshBasicMaterial({ color: "#ff4165" }),
      );
      diode.position.z = 0.29;
      pointer.add(diode);
      this.group.add(pointer);
      this.pointers.push(pointer);

      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.15, 1),
        new THREE.MeshBasicMaterial({
          color: "#6affe4",
          transparent: true,
          opacity: 0.16,
          wireframe: true,
          depthWrite: false,
        }),
      );
      mesh.scale.y = 1.35;
      this.group.add(mesh);
      this.shields.push(mesh);
    }
  }
  private label(text: string, color: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#172c31";
    ctx.beginPath();
    ctx.roundRect(0, 4, 256, 56, 8);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "bold 27px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 34);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map, depthWrite: false }),
    );
    sprite.scale.set(1.9, 0.475, 1);
    sprite.position.y = 2.2;
    return sprite;
  }
  event(event: ItemEvent) {
    if (event.type === "laser" && event.from && event.to) {
      const a = new THREE.Vector3(event.from.x, 2.25, event.from.z),
        b = new THREE.Vector3(event.to.x, 1.5, event.to.z);
      const length = a.distanceTo(b);
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, length, 6),
        new THREE.MeshBasicMaterial({
          color: "#ff4069",
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.position.copy(a).lerp(b, 0.5);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.sub(a).normalize(),
      );
      this.group.add(mesh);
      this.flashes.push({ mesh, life: 0.19, total: 0.19 });
    }
    if (event.to && ["hit", "blocked", "target"].includes(event.type)) {
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.7, 1),
        new THREE.MeshBasicMaterial({
          color: event.type === "blocked" ? "#6affe4" : "#ffca6b",
          wireframe: true,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        }),
      );
      mesh.position.set(event.to.x, 1.5, event.to.z);
      this.group.add(mesh);
      this.flashes.push({ mesh, life: 0.45, total: 0.45 });
    }
    while (this.flashes.length > 32) this.removeFlash(this.flashes.shift()!);
  }
  update(dt: number, camera: THREE.Camera, visible: boolean) {
    this.group.visible = visible;
    this.time += dt;
    this.pickupMeshes.forEach((mesh, i) => {
      mesh.visible = this.items.pickups[i].cooldown === 0;
      const floating = mesh.getObjectByName("floating")!;
      floating.rotation.set(this.time * 0.5, this.time * 0.85, Math.PI / 4);
      floating.position.y = 1.22 + Math.sin(this.time * 2 + i) * 0.12;
    });
    this.targetMeshes.forEach((mesh, i) => {
      mesh.visible = this.items.targets[i].cooldown === 0;
      mesh.lookAt(camera.position);
    });
    this.pointers.forEach((pointer, i) => {
      const e = this.items.equipment[i],
        s = e.state;
      pointer.visible = e.active && e.item === "laser";
      pointer.position.set(
        s.x - Math.cos(s.yaw) * 0.22 + Math.sin(s.yaw) * 0.15,
        2.4,
        s.z + Math.sin(s.yaw) * 0.22 + Math.cos(s.yaw) * 0.15,
      );
      pointer.rotation.y = s.yaw;
    });
    this.shields.forEach((mesh, i) => {
      const e = this.items.equipment[i];
      mesh.visible = e.active && e.shield > 0;
      mesh.position.set(e.state.x, 1.3, e.state.z);
      mesh.rotation.y = this.time;
    });
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.removeFlash(f);
        this.flashes.splice(i, 1);
      } else {
        (f.mesh.material as THREE.MeshBasicMaterial).opacity = f.life / f.total;
        if (f.total > 0.2)
          f.mesh.scale.setScalar(1 + (1 - f.life / f.total) * 2);
      }
    }
  }
  private removeFlash(f: Flash) {
    f.mesh.removeFromParent();
    f.mesh.geometry.dispose();
    (f.mesh.material as THREE.Material).dispose();
  }
  dispose() {
    this.group.removeFromParent();
    this.group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.Sprite ||
        obj instanceof THREE.LineSegments
      ) {
        if ("geometry" in obj) obj.geometry.dispose();
        for (const mat of Array.isArray(obj.material)
          ? obj.material
          : [obj.material]) {
          for (const value of Object.values(mat))
            if (value instanceof THREE.Texture) value.dispose();
          mat.dispose();
        }
      }
    });
    this.flashes = [];
  }
}
