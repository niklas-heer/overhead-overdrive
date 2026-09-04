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
  private readonly baseOpacity = new WeakMap<THREE.Material, number>();
  private readonly attachmentPoint = new THREE.Vector3(0.33, 0, 0.05);
  private readonly attachmentRotation = new THREE.Quaternion();
  private readonly groupRotation = new THREE.Quaternion();
  constructor(
    scene: THREE.Scene,
    private readonly items: ItemSystem,
    private readonly vehicles: readonly THREE.Object3D[] = [],
  ) {
    this.group.name = "race-equipment";
    scene.add(this.group);
    for (const p of items.pickups) {
      const g = new THREE.Group(),
        info = ITEM_INFO[p.kind];
      g.position.set(p.x, 0, p.z);
      const floating = new THREE.Group();
      floating.name = "floating";
      floating.position.y = 1.16;
      g.add(floating);
      const shell = new THREE.MeshStandardMaterial({
        color: info.color,
        emissive: info.color,
        emissiveIntensity: 0.2,
        roughness: 0.35,
        metalness: 0.3,
        transparent: true,
      });
      const cream = new THREE.MeshStandardMaterial({
        color: "#fff2d7",
        roughness: 0.55,
        transparent: true,
      });
      const dark = new THREE.MeshStandardMaterial({
        color: "#293b43",
        roughness: 0.4,
        metalness: 0.6,
        transparent: true,
      });
      const block = (
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
        material: THREE.Material,
      ) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        floating.add(mesh);
        return mesh;
      };
      if (p.kind === "laser") {
        // A pocket laser pen, with a clip, push button and bright diode.
        const pen = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 0.9, 12),
          dark,
        );
        pen.rotation.z = -0.6;
        floating.add(pen);
        const tip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.105, 0.105, 0.17, 12),
          shell,
        );
        tip.position.set(Math.sin(0.6) * 0.41, Math.cos(0.6) * 0.41, 0);
        tip.rotation.z = -0.6;
        floating.add(tip);
        const diode = new THREE.Mesh(
          new THREE.SphereGeometry(0.065, 10, 8),
          shell,
        );
        diode.position.set(Math.sin(0.6) * 0.52, Math.cos(0.6) * 0.52, 0);
        floating.add(diode);
        const clip = block(0.1, 0.2, 0.105, 0.065, 0.33, 0.035, cream);
        clip.rotation.z = -0.6;
        block(0.06, 0.06, 0.105, 0.09, 0.15, 0.04, shell);
      } else if (p.kind === "shield") {
        // A translucent acetate sheet folded into the familiar shield silhouette.
        const shape = new THREE.Shape();
        shape.moveTo(-0.43, 0.43);
        shape.lineTo(0.43, 0.43);
        shape.lineTo(0.37, -0.13);
        shape.quadraticCurveTo(0.23, -0.37, 0, -0.54);
        shape.quadraticCurveTo(-0.23, -0.37, -0.37, -0.13);
        shape.closePath();
        const sheet = new THREE.Mesh(
          new THREE.ExtrudeGeometry(shape, {
            depth: 0.065,
            bevelEnabled: true,
            bevelThickness: 0.025,
            bevelSize: 0.025,
            bevelSegments: 1,
            steps: 1,
          }),
          shell,
        );
        floating.add(sheet);
        const inlay = sheet.clone();
        inlay.scale.set(0.77, 0.77, 0.6);
        inlay.position.z = 0.055;
        inlay.material = new THREE.MeshStandardMaterial({
          color: "#dcfff4",
          transparent: true,
          opacity: 0.5,
          roughness: 0.3,
          metalness: 0.1,
          depthWrite: false,
        });
        floating.add(inlay);
        block(0, 0.43, 0.11, 0.34, 0.1, 0.09, dark);
        const check1 = block(-0.1, -0.09, 0.15, 0.1, 0.28, 0.04, cream);
        check1.rotation.z = 0.75;
        const check2 = block(0.08, -0.015, 0.15, 0.1, 0.46, 0.04, cream);
        check2.rotation.z = -0.55;
      } else {
        // A school physics capacitor: two terminals and a tiny lightning emblem.
        const cell = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.67, 16),
          shell,
        );
        floating.add(cell);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.305, 0.305, 0.1, 16),
          dark,
        );
        cap.position.y = 0.37;
        floating.add(cap);
        block(-0.12, 0.48, 0, 0.09, 0.16, 0.09, cream);
        block(0.12, 0.46, 0, 0.09, 0.12, 0.09, cream);
        const boltShape = new THREE.Shape();
        boltShape.moveTo(0.07, 0.24);
        boltShape.lineTo(-0.14, -0.015);
        boltShape.lineTo(-0.005, -0.015);
        boltShape.lineTo(-0.08, -0.25);
        boltShape.lineTo(0.16, 0.035);
        boltShape.lineTo(0.025, 0.035);
        boltShape.closePath();
        const bolt = new THREE.Mesh(new THREE.ShapeGeometry(boltShape), dark);
        bolt.position.z = 0.306;
        floating.add(bolt);
      }
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.48, 0.025, 5, 28),
        new THREE.MeshBasicMaterial({
          color: info.color,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      g.add(ring);
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
        new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.045, 6, 32), material),
      );
      g.add(
        new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 5, 24), material),
      );
      g.add(new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), material));
      const label = this.label("POP QUIZ", "#ff90a2");
      label.position.y = 0.73;
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
      // A visible clamp connects the pen to the projector head.
      const clamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.17, 0.07, 0.09),
        new THREE.MeshStandardMaterial({
          color: "#98a8a8",
          metalness: 0.65,
          roughness: 0.35,
        }),
      );
      clamp.position.set(-0.07, 0, -0.12);
      pointer.add(clamp);
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
    sprite.scale.set(1.06, 0.265, 1);
    sprite.position.y = 2.2;
    return sprite;
  }
  event(event: ItemEvent) {
    if (event.type === "laser" && event.from && event.to) {
      this.attachPointer(event.owner);
      const pointer = this.pointers[event.owner];
      const a = pointer
        ? pointer.localToWorld(new THREE.Vector3(0, 0, 0.32))
        : new THREE.Vector3(event.from.x, 2.25, event.from.z);
      const b = new THREE.Vector3(event.to.x, 1.5, event.to.z);
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
      const proximity = THREE.MathUtils.smoothstep(
        camera.position.distanceTo(mesh.position),
        3.5,
        7,
      );
      mesh.visible = this.items.pickups[i].cooldown === 0 && proximity > 0.02;
      this.fade(mesh, proximity);
      const floating = mesh.getObjectByName("floating")!;
      // Face the equipment towards approaching players, with a gentle display-case sway.
      floating.rotation.set(
        0,
        Math.atan2(
          camera.position.x - mesh.position.x,
          camera.position.z - mesh.position.z,
        ) +
          Math.sin(this.time * 1.1 + i) * 0.22,
        Math.sin(this.time * 1.3 + i) * 0.06,
      );
      floating.position.y = 1.16 + Math.sin(this.time * 2 + i) * 0.09;
    });
    this.targetMeshes.forEach((mesh, i) => {
      const proximity = THREE.MathUtils.smoothstep(
        camera.position.distanceTo(mesh.position),
        3,
        6.5,
      );
      mesh.visible = this.items.targets[i].cooldown === 0 && proximity > 0.02;
      this.fade(mesh, proximity);
      mesh.lookAt(camera.position);
    });
    this.pointers.forEach((pointer, i) => {
      const e = this.items.equipment[i];
      pointer.visible = e.active && e.item === "laser";
      this.attachPointer(i);
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
  private fade(object: THREE.Object3D, opacity: number) {
    object.traverse((child) => {
      if (!(
        child instanceof THREE.Mesh ||
        child instanceof THREE.Sprite ||
        child instanceof THREE.LineSegments
      ))
        return;
      for (const material of Array.isArray(child.material)
        ? child.material
        : [child.material]) {
        if (!this.baseOpacity.has(material))
          this.baseOpacity.set(material, material.opacity);
        material.transparent = true;
        material.opacity = this.baseOpacity.get(material)! * opacity;
        material.depthWrite =
          opacity > 0.98 && this.baseOpacity.get(material)! > 0.98;
      }
    });
  }
  private attachPointer(index: number) {
    const pointer = this.pointers[index],
      equipment = this.items.equipment[index];
    if (!pointer || !equipment) return;
    const vehicle = this.vehicles[index],
      head = vehicle?.getObjectByName("projector-head"),
      attachment = head ?? vehicle?.getObjectByName("mast");
    if (attachment) {
      attachment.updateWorldMatrix(true, false);
      if (head) pointer.position.copy(this.attachmentPoint);
      else pointer.position.set(0.33, 1.2, 0.4);
      attachment.localToWorld(pointer.position);
      this.group.worldToLocal(pointer.position);
      attachment.getWorldQuaternion(this.attachmentRotation);
      this.group.getWorldQuaternion(this.groupRotation).invert();
      pointer.quaternion
        .copy(this.groupRotation)
        .multiply(this.attachmentRotation);
    } else {
      const s = equipment.state;
      pointer.position.set(
        s.x + Math.cos(s.yaw) * 0.33 - Math.sin(s.yaw) * 0.07,
        2.42,
        s.z - Math.sin(s.yaw) * 0.33 - Math.cos(s.yaw) * 0.07,
      );
      pointer.rotation.set(0, s.yaw, 0);
    }
    pointer.updateWorldMatrix(true, true);
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
