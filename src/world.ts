import * as THREE from "three";

export interface Track {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  difficulty: string;
  length: number;
  accent: string;
  points: THREE.Vector3[];
  width: number;
  theme: "indoor" | "campus" | "park";
}
const points = (coordinates: number[][]) =>
  coordinates.map(([x, z]) => new THREE.Vector3(x, 0, z));
export const tracks: Track[] = [
  {
    id: "atrium",
    name: "Atrium Circuit",
    subtitle: "UNDER THE GLASS ROOF",
    description:
      "Graphite tiles, yellow stairs and sunlit galleries. A compact indoor lap around the heart of the school.",
    difficulty: "Beginner",
    length: 0,
    accent: "#e5b72e",
    width: 8,
    theme: "indoor",
    points: points([
      [0, -21],
      [22, -21],
      [32, -11],
      [32, 11],
      [22, 21],
      [-22, 21],
      [-32, 11],
      [-32, -11],
      [-22, -21],
    ]),
  },
  {
    id: "chemistry",
    name: "Canopy Run",
    subtitle: "THE LONG WAY TO CLASS",
    description:
      "Dive beneath the red-column walkway, thread between school wings and sweep past the curved bicycle shelters.",
    difficulty: "Technical",
    length: 0,
    accent: "#62c7bc",
    width: 8.5,
    theme: "campus",
    points: points([
      [0, -34],
      [28, -34],
      [43, -22],
      [44, 0],
      [27, 12],
      [22, 32],
      [2, 42],
      [-23, 32],
      [-38, 12],
      [-32, -8],
      [-16, -13],
      [-11, -27],
    ]),
  },
  {
    id: "courtyard",
    name: "Kocher Park",
    subtitle: "SCHOOL'S OUT",
    description:
      "Leave the forecourt for a winding park lap. Sweep around the pond, skim the Kocher riverbank and race home through the trees.",
    difficulty: "Fast",
    length: 0,
    accent: "#ef8053",
    width: 9,
    theme: "park",
    points: points([
      [0, -40],
      [28, -38],
      [49, -20],
      [54, 9],
      [39, 30],
      [14, 34],
      [-2, 49],
      [-30, 43],
      [-51, 24],
      [-55, -4],
      [-39, -24],
      [-22, -29],
    ]),
  },
];
for (const track of tracks)
  track.length = Math.round(
    new THREE.CatmullRomCurve3(track.points, true, "centripetal").getLength(),
  );
type Collider =
  | { type: "box"; minX: number; maxX: number; minZ: number; maxZ: number }
  | { type: "circle"; x: number; z: number; radius: number };

/** Photo-informed architecture and campus geography, adapted to generous racing proportions. */
export function buildWorld(scene: THREE.Scene, track: Track) {
  const root = new THREE.Group();
  root.name = `school-${track.id}`;
  scene.add(root);
  const colliders: Collider[] = [];
  const curve = new THREE.CatmullRomCurve3(track.points, true, "centripetal");
  curve.arcLengthDivisions = 1200;
  const samples = curve.getSpacedPoints(1200);
  const indoor = track.theme === "indoor",
    park = track.theme === "park";
  const material = (color: string, roughness = 0.8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const wall = material("#efeee5"),
    steel = material("#455158", 0.48, 0.48),
    yellow = material("#e7ba20", 0.55),
    teal = material("#285c60", 0.55),
    red = material("#b64839"),
    wood = material("#9c7d54"),
    concrete = material("#b9bcb3"),
    white = material("#f6edd3"),
    grass = material("#739566"),
    leaf = material("#487751"),
    leafLight = material("#749654"),
    bark = material("#76634b"),
    dark = material("#26383d"),
    orange = material(track.accent);
  const glass = material("#90b9bf", 0.2, 0.28);
  const water = material("#599ca3", 0.24, 0.24);
  const glow = new THREE.MeshStandardMaterial({
    color: "#fff1cb",
    emissive: "#fff1cb",
    emissiveIntensity: 0.6,
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1),
    cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 10),
    foliageGeo = new THREE.IcosahedronGeometry(1, 1),
    sphereGeo = new THREE.SphereGeometry(1, 12, 8);
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    parent: THREE.Object3D = root,
  ) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cylinder(
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    mat: THREE.Material,
  ) {
    const m = new THREE.Mesh(cylinderGeo, mat);
    m.position.set(x, y, z);
    m.scale.set(r, h, r);
    m.castShadow = true;
    root.add(m);
    return m;
  }
  function beam(
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    mat: THREE.Material = steel,
  ) {
    const m = box(0, 0, 0, width, a.distanceTo(b), width, mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    return m;
  }
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const clearCircle = (x: number, z: number, r: number) =>
    samples.every(
      (p) => Math.hypot(p.x - x, p.z - z) > track.width / 2 + 0.9 + r,
    );
  function clearBox(x: number, z: number, w: number, d: number) {
    return samples.every(
      (p) =>
        Math.hypot(
          Math.max(Math.abs(p.x - x) - w / 2, 0),
          Math.max(Math.abs(p.z - z) - d / 2, 0),
        ) >
        track.width / 2 + 0.9,
    );
  }
  function colliderBox(x: number, z: number, w: number, d: number) {
    if (!clearBox(x, z, w, d)) return false;
    colliders.push({
      type: "box",
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
    return true;
  }
  function label(
    text: string,
    w: number,
    h: number,
    bg = "#263e3d",
    fg = "#f4efdc",
    size = 70,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.round((1024 * h) / w);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, canvas.height);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${size}px Arial`;
    text
      .split("\n")
      .forEach((line, i, lines) =>
        ctx.fillText(
          line,
          512,
          canvas.height / 2 + (i - (lines.length - 1) / 2) * size * 1.3,
          970,
        ),
      );
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
    );
  }
  // A procedural terrazzo/paver texture stays crisp close to the caster-level camera.
  function pavingTexture(base: string, joint: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    let seed = 771;
    for (let i = 0; i < 2100; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = seed % 256;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      ctx.fillStyle = i % 2 ? "#ffffff25" : "#00000019";
      ctx.fillRect(x, seed % 256, 1.5, 1.5);
    }
    ctx.strokeStyle = joint;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(0.5, 0.5, 255, 255);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }
  const floorMap = pavingTexture(indoor ? "#c6c8c0" : "#b5b8ac", "#969e98");
  floorMap.repeat.set(indoor ? 40 : 65, indoor ? 30 : 65);
  box(
    0,
    -0.16,
    0,
    indoor ? 88 : 184,
    0.3,
    indoor ? 67 : 184,
    !indoor
      ? grass
      : new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.82 }),
  );
  if (park)
    box(
      0,
      -0.009,
      -47,
      110,
      0.018,
      24,
      new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.85 }),
    );
  if (!indoor && !park) {
    const paving = new THREE.MeshStandardMaterial({
      map: floorMap,
      roughness: 0.85,
    });
    box(0, -0.005, -29, 101, 0.01, 46, paving);
    box(1, -0.005, 17, 99, 0.01, 60, paving);
  }
  const roadMap = pavingTexture(
    indoor ? "#424c54" : park ? "#b6ae98" : "#78817f",
    indoor ? "#717b80" : "#8e988e",
  );
  const road = new THREE.MeshStandardMaterial({
    map: roadMap,
    roughness: indoor ? 0.45 : 0.92,
    metalness: indoor ? 0.08 : 0,
    side: THREE.DoubleSide,
  });
  function ribbon(
    inner: number,
    outer: number,
    height: number,
    mat: THREE.Material,
  ) {
    const verts: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= 600; i++) {
      const t = i / 600,
        p = curve.getPointAt(t),
        tangent = curve.getTangentAt(t),
        n = v(tangent.z, 0, -tangent.x);
      for (const side of [inner, outer]) {
        verts.push(p.x + n.x * side, height, p.z + n.z * side);
        uvs.push(side / 1.8, (t * curve.getLength()) / 1.8);
      }
      if (i < 600) {
        const j = i * 2;
        indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    root.add(m);
  }
  ribbon(-track.width / 2 - 0.22, track.width / 2 + 0.22, 0.004, concrete);
  ribbon(-track.width / 2, track.width / 2, 0.055, road);
  for (const side of [-1, 1])
    ribbon(
      (side * track.width) / 2 - 0.055,
      (side * track.width) / 2 + 0.055,
      0.065,
      indoor ? yellow : white,
    );
  // Paint arrows in the actual travel direction, with low kerb markers instead of a wall of cones.
  const arrowGeo = new THREE.BufferGeometry();
  arrowGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.28, 0, -0.6, 0.28, 0, -0.6, 0.28, 0, 0.05, 0.65, 0, 0.05, 0, 0, 0.85,
        -0.65, 0, 0.05, -0.28, 0, 0.05,
      ],
      3,
    ),
  );
  arrowGeo.setIndex([0, 1, 2, 0, 2, 6, 6, 2, 3, 6, 3, 4, 6, 4, 5]);
  arrowGeo.computeVertexNormals();
  const paint = new THREE.MeshStandardMaterial({
    color: "#f4e3a7",
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  const markerCount = Math.round(curve.getLength() / 6);
  for (let i = 0; i < markerCount; i++) {
    const t = i / markerCount,
      p = curve.getPointAt(t),
      tan = curve.getTangentAt(t),
      yaw = Math.atan2(tan.x, tan.z),
      n = v(tan.z, 0, -tan.x);
    if (i % 4 === 2) {
      const arrow = new THREE.Mesh(arrowGeo, paint);
      arrow.position.set(p.x, 0.075, p.z);
      arrow.rotation.y = yaw;
      root.add(arrow);
    }
    for (const side of [-1, 1]) {
      const q = p.clone().addScaledVector(n, side * (track.width / 2 + 0.36));
      const m = box(
        q.x,
        0.075,
        q.z,
        0.25,
        0.14,
        1.4,
        i % 3 === 0 ? orange : concrete,
      );
      m.rotation.y = yaw;
    }
  }
  function rail(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    height = 1.15,
    y = 0,
    mat: THREE.Material = steel,
  ) {
    beam(v(x1, y + height, z1), v(x2, y + height, z2), 0.07, mat);
    beam(v(x1, y + 0.33, z1), v(x2, y + 0.33, z2), 0.05, mat);
    const count = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.7);
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      box(
        x1 + (x2 - x1) * t,
        y + height / 2,
        z1 + (z2 - z1) * t,
        0.045,
        height,
        0.045,
        mat,
      );
    }
  }
  function tree(x: number, z: number, size = 1) {
    if (!clearCircle(x, z, 1.2 * size)) return;
    cylinder(x, 1.8 * size, z, 0.23 * size, 3.6 * size, bark);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(foliageGeo, i % 2 ? leaf : leafLight);
      m.position.set(
        x + Math.sin(i * 2.5) * 0.85 * size,
        (3.5 + i * 0.65) * size,
        z + Math.cos(i * 2.5) * 0.7 * size,
      );
      m.scale.set(2 * size, 2.1 * size, 1.75 * size);
      m.castShadow = true;
      root.add(m);
    }
    colliders.push({ type: "circle", x, z, radius: 0.3 * size });
  }
  function bench(x: number, z: number, yellowSeat = false) {
    if (!colliderBox(x, z, 3.4, 1.1)) return;
    box(x, 0.65, z, 3.4, 0.18, 1.1, yellowSeat ? yellow : wood);
    for (const side of [-1, 1])
      box(x + side * 1.45, 0.3, z, 0.18, 0.6, 0.9, steel);
  }
  function planter(x: number, z: number, w: number, d: number) {
    if (!colliderBox(x, z, w, d)) return;
    box(x, 0.45, z, w, 0.9, d, concrete);
    box(x, 0.94, z, w - 0.2, 0.08, d - 0.2, grass);
    for (let i = 0; i < Math.max(1, Math.floor(w / 2)); i++) {
      const m = new THREE.Mesh(foliageGeo, leaf);
      m.position.set(x - w / 2 + 1 + i * 2, 1.2, z);
      m.scale.set(0.8, 0.5, 0.65);
      root.add(m);
    }
  }
  function schoolWing(x: number, z: number, w: number, d: number, h = 10) {
    if (!colliderBox(x, z, w, d)) return;
    box(x, h / 2, z, w, h, d, wall);
    box(x, h + 0.12, z, w + 0.25, 0.24, d + 0.25, concrete);
    // Teal window grids, horizontal spandrels and visible blue drainage pipes.
    for (const side of [-1, 1])
      for (let floor = 0; floor < 3; floor++) {
        const y = 1.6 + floor * 3.2;
        for (let xx = x - w / 2 + 2.7; xx < x + w / 2 - 1.5; xx += 4.7) {
          box(xx, y, z + side * (d / 2 + 0.02), 4.15, 2.1, 0.12, teal);
          box(xx, y, z + side * (d / 2 + 0.1), 3.91, 1.87, 0.1, glass);
          box(xx, y, z + side * (d / 2 + 0.17), 0.075, 1.9, 0.08, teal);
          box(xx, y + 0.49, z + side * (d / 2 + 0.17), 4, 0.06, 0.08, teal);
        }
      }
    for (const side of [-1, 1])
      for (let zz = z - d / 2 + 2.6; zz < z + d / 2 - 1; zz += 4.6)
        for (let floor = 0; floor < 3; floor++) {
          const y = 1.6 + floor * 3.2;
          box(x + side * (w / 2 + 0.03), y, zz, 0.12, 2.1, 3.7, teal);
          box(x + side * (w / 2 + 0.11), y, zz, 0.1, 1.86, 3.44, glass);
        }
    for (let xx = x - w / 2 + 1; xx < x + w / 2; xx += 15)
      box(xx, h / 2, z + d / 2 + 0.2, 0.13, h, 0.13, teal);
  }
  if (indoor) {
    // The school hall is enclosed; the other two courses deliberately have no arena perimeter.
    for (const side of [-1, 1]) {
      box(0, 3.8, side * 31.5, 85, 7.6, 0.5, wall);
      colliderBox(0, side * 31.5, 85, 0.5);
      box(side * 42.5, 3.8, 0, 0.5, 7.6, 63, wall);
      colliderBox(side * 42.5, 0, 0.5, 63);
      for (let x = -35; x <= 35; x += 10) {
        box(x, 1.55, side * 31.17, 2.5, 3.1, 0.22, steel);
        box(x, 1.48, side * 31, 2.2, 2.9, 0.2, yellow);
        box(x + 0.65, 1.35, side * 30.84, 0.35, 0.07, 0.06, steel);
        box(x + 4.5, 2, side * 31.1, 4.2, 2.7, 0.16, teal);
        box(x + 4.5, 2, side * 30.98, 3.96, 2.46, 0.14, glass);
        const number = label(
          `${side < 0 ? "1" : "0"}.${Math.round((x + 35) / 10) + 11}`,
          1,
          0.32,
          "#293e60",
          "#f9de6a",
          110,
        );
        number.position.set(x, 3.38, side * 30.85);
        if (side > 0) number.rotation.y = Math.PI;
        root.add(number);
        // Brick joints and dark fin radiators reference the gallery photograph.
        for (let j = 0; j < 15; j++)
          box(x + 2.7 + j * 0.18, 0.75, side * 30.55, 0.11, 1.2, 0.3, steel);
      }
      for (let y = 0.3; y < 7.5; y += 0.33)
        box(0, y, side * 31.22, 84, 0.018, 0.018, concrete);
      for (let z = -25; z <= 25; z += 10) {
        box(side * 42.16, 2.4, z, 0.15, 3.2, 6.5, teal);
        box(side * 42.04, 2.4, z, 0.14, 2.95, 6.2, glass);
      }
      // Elevated circulation, kept to the edge so the chase camera sees the racing floor.
      box(side * 39, 4.25, 0, 6, 0.25, 63, wall);
      rail(side * 36, -31, side * 36, 31, 1.1, 4.4);
      for (let z = -28; z <= 28; z += 7)
        box(side * 36, 4, z, 0.22, 8, 0.22, steel);
      box(0, 4.25, side * 28.6, 72, 0.25, 5.2, wall);
      rail(-36, side * 26, 36, side * 26, 1.1, 4.4);
    }
    // A large, recognisable stair hall at the centre, with yellow stringers and matching furniture.
    box(0, 0.035, 0, 26, 0.06, 22, concrete);
    for (const x of [-6, 6]) {
      for (let i = 0; i < 22; i++)
        box(
          x,
          0.1 + i * 0.0975,
          -6 + i * 0.51,
          3.2,
          0.2 + i * 0.195,
          0.54,
          steel,
        );
      for (const side of [-1, 1]) {
        beam(
          v(x + side * 1.69, 0.2, -6.3),
          v(x + side * 1.69, 4.5, 5.3),
          0.24,
          yellow,
        );
        beam(
          v(x + side * 1.69, 1.25, -6.3),
          v(x + side * 1.69, 5.55, 5.3),
          0.075,
          steel,
        );
        for (let i = 0; i < 22; i++)
          box(
            x + side * 1.69,
            0.72 + i * 0.195,
            -6 + i * 0.51,
            0.055,
            1.12,
            0.055,
            steel,
          );
      }
      colliderBox(x, -0.5, 3.7, 12);
    }
    box(0, 4.38, 7.4, 18, 0.25, 4, wall);
    rail(-9, 9.4, 9, 9.4, 1.1, 4.5);
    colliderBox(0, 7.4, 18, 4);
    for (const x of [-10, 10]) {
      box(x, 4.5, 0, 0.25, 9, 0.25, steel);
      colliderBox(x, 0, 0.3, 0.3);
      bench(x, -9, true);
      bench(x, 12, true);
    }
    for (const z of [-9, -4, 1]) {
      box(0, 0.82, z, 3, 0.13, 1.3, steel);
      box(-1.35, 0.4, z, 0.14, 0.8, 1.3, steel);
      box(1.35, 0.4, z, 0.14, 0.8, 1.3, steel);
      colliderBox(0, z, 3, 1.3);
    }
    // Atrium skylight over the stairwell, with real panes, rafters and spherical pendants.
    const roofGlass = new THREE.MeshStandardMaterial({
      color: "#bce0e4",
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });
    for (const z of [-24, -12, 0, 12, 24])
      for (const side of [-1, 1])
        beam(v(side * 36, 8.2, z), v(0, 12.2, z), 0.15, steel);
    for (const x of [-36, -24, -12, 0, 12, 24, 36])
      box(x, 12.2 - Math.abs(x) / 9, 0, 0.12, 0.12, 52, steel);
    for (const side of [-1, 1]) {
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.hypot(24, 2.67), 48),
        roofGlass,
      );
      pane.position.set(side * 12, 10.87, 0);
      pane.rotation.x = -Math.PI / 2;
      pane.rotateY(side * Math.atan2(4, 36));
      root.add(pane);
    }
    for (const x of [-14, 14])
      for (const z of [-13, 0, 13]) {
        box(x, 8.5, z, 0.022, 2, 0.022, steel);
        const m = new THREE.Mesh(sphereGeo, glow);
        m.position.set(x, 7.45, z);
        m.scale.setScalar(0.32);
        root.add(m);
      }
    for (const side of [-1, 1]) {
      const x = side * 40;
      colliderBox(x, 0, 1.2, 8);
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 9; col++) {
          box(
            x,
            row * 0.83 + 0.47,
            (col - 4) * 0.87,
            1.1,
            0.79,
            0.81,
            [yellow, teal, concrete][(row + col * 2) % 3],
          );
          box(
            x - side * 0.57,
            row * 0.83 + 0.48,
            (col - 4) * 0.87 - 0.24,
            0.05,
            0.13,
            0.065,
            steel,
          );
        }
    }
    const crest = label(
      "SCHENK-VON-LIMPURG\nGYMNASIUM",
      14,
      1.9,
      "#efeee5",
      "#344c50",
      82,
    );
    crest.position.set(0, 6.5, -31.19);
    root.add(crest);
  } else if (!park) {
    schoolWing(0, -53, 83, 15);
    schoolWing(4, 1, 25, 15);
    schoolWing(-55, -8, 13, 45);
    schoolWing(45, 35, 17, 20);
    // The distinctive projecting classroom bays are raised over a sheltered ground floor.
    for (const x of [-26, -9, 8, 25]) {
      box(x, 8.9, -42.9, 8.3, 4.2, 5.1, wall);
      box(x, 9, -40.28, 7.7, 3.35, 0.18, teal);
      box(x, 9, -40.16, 7.38, 3.02, 0.13, glass);
      box(x, 9, -40.06, 0.12, 3.1, 0.1, teal);
      box(x, 9.7, -40.06, 7.45, 0.12, 0.1, teal);
    }
    // A red-column covered passage follows the east-hand bend, as in the courtyard reference.
    for (let i = 0; i < 9; i++) {
      const t = 0.19 + i * 0.014,
        p = curve.getPointAt(t),
        tan = curve.getTangentAt(t),
        n = v(tan.z, 0, -tan.x),
        yaw = Math.atan2(tan.x, tan.z);
      const roof = box(p.x, 6.5, p.z, track.width + 4, 0.25, 5.1, steel);
      roof.rotation.y = yaw;
      const soffit = box(p.x, 6.35, p.z, track.width + 3.8, 0.05, 5, wood);
      soffit.rotation.y = yaw;
      if (i % 2 === 0)
        for (const side of [-1, 1]) {
          const q = p
            .clone()
            .addScaledVector(n, side * (track.width / 2 + 1.6));
          if (clearCircle(q.x, q.z, 0.2)) {
            cylinder(q.x, 3.15, q.z, 0.14, 6.3, red);
            cylinder(q.x, 0.1, q.z, 0.3, 0.2, red);
            colliders.push({ type: "circle", x: q.x, z: q.z, radius: 0.22 });
          }
        }
    }
    // Curved timber-and-polycarbonate bicycle shelters beside the western passage.
    const shelterGlass = new THREE.MeshStandardMaterial({
      color: "#c1dce0",
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      roughness: 0.24,
      side: THREE.DoubleSide,
    });
    for (const z of [-11, -4, 3, 10]) {
      const x = -45;
      if (!clearBox(x, z, 5.5, 5.5)) continue;
      for (const xx of [x - 2.6, x + 2.6])
        for (const zz of [z - 2.5, z + 2.5])
          box(xx, 1.5, zz, 0.14, 3, 0.14, wood);
      const arch = new THREE.Mesh(
        new THREE.CylinderGeometry(2.65, 2.65, 5.3, 18, 1, true, 0, Math.PI),
        shelterGlass,
      );
      arch.rotation.z = Math.PI / 2;
      arch.rotation.y = Math.PI / 2;
      arch.position.set(x, 3, z);
      root.add(arch);
      for (const zz of [z - 2.5, z + 2.5])
        for (let i = 0; i < 16; i++) {
          const a = (Math.PI * i) / 16,
            b = (Math.PI * (i + 1)) / 16;
          beam(
            v(x + Math.cos(a) * 2.65, 3 + Math.sin(a) * 2.65, zz),
            v(x + Math.cos(b) * 2.65, 3 + Math.sin(b) * 2.65, zz),
            0.09,
            wood,
          );
        }
      for (let i = 0; i < 7; i++) {
        const xx = x - 2 + i * 0.66;
        rail(xx, z - 1.5, xx, z + 1.5, 0.55);
      }
      colliderBox(x, z, 5.5, 5.5);
    }
    // Green quadrangles and low retaining walls break up the separate building volumes.
    box(4, 0.015, 1, 30, 0.025, 20, grass);
    planter(-7, 17, 13, 2);
    planter(6, 26, 10, 3);
    planter(32, -14, 3, 10);
    planter(-23, -25, 3, 8);
    for (const [x, z] of [
      [-9, 15],
      [4, 25],
      [-26, 11],
      [31, -13],
      [-52, 43],
      [52, -44],
      [5, 60],
      [-36, -47],
    ])
      tree(x, z, 1.1);
    for (const [x, z] of [
      [-4, 20],
      [12, 22],
      [-24, 4],
    ])
      bench(x, z);
    // Round stair-tower window and cantilevered classroom, both characteristic photographed details.
    if (clearBox(16, -4, 7, 7)) {
      box(16, 5.7, -4, 7, 11.4, 7, wall);
      colliderBox(16, -4, 7, 7);
      const round = new THREE.Mesh(new THREE.CircleGeometry(1.45, 28), glass);
      round.position.set(16, 8.9, -0.48);
      root.add(round);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.09, 6, 32),
        teal,
      );
      rim.position.copy(round.position);
      root.add(rim);
    }
    const schoolName = label(
      "SCHENK-VON-LIMPURG-GYMNASIUM",
      28,
      1.5,
      "#efeee5",
      "#34514e",
      68,
    );
    schoolName.position.set(0, 4.4, -45.35);
    root.add(schoolName);
    const passageSign = label(
      "PAUSENHOF  /  MENSA →",
      8,
      1,
      "#345b59",
      "#fff1cb",
      84,
    );
    passageSign.position.set(4, 4.3, 8.62);
    root.add(passageSign);
  } else {
    // Kocher-side campus: the school sits to the north, with a park and pond between the loop's arms.
    schoolWing(-7, -65, 94, 15);
    schoolWing(52, -53, 13, 24);
    box(-7, -0.001, -49, 98, 0.025, 14, concrete);
    // A gently irregular pond, with an actual bank and a shallow inner water surface.
    const pondShape = new THREE.Shape();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2,
        r = 1 + 0.1 * Math.sin(a * 3) + 0.04 * Math.cos(a * 5),
        x = -14 + 17 * Math.cos(a) * r,
        z = 9 + 21 * Math.sin(a) * r;
      if (i === 0) pondShape.moveTo(x, -z);
      else pondShape.lineTo(x, -z);
    }
    const pondGeo = new THREE.ShapeGeometry(pondShape, 48);
    const pondMesh = new THREE.Mesh(pondGeo, water);
    pondMesh.rotation.x = -Math.PI / 2;
    pondMesh.position.y = 0.026;
    root.add(pondMesh);
    for (let i = 0; i < 42; i++) {
      const a = (i / 42) * Math.PI * 2,
        r = 1 + 0.1 * Math.sin(a * 3) + 0.04 * Math.cos(a * 5),
        x = -14 + 17 * Math.cos(a) * r,
        z = 9 + 21 * Math.sin(a) * r;
      const stone = new THREE.Mesh(foliageGeo, concrete);
      stone.position.set(x, 0.19, z);
      stone.scale.set(1.2, 0.45, 0.85);
      root.add(stone);
      if (clearCircle(x, z, 1))
        colliders.push({ type: "circle", x, z, radius: 1 });
    }
    // River runs across the south edge; continuous visible bank fence keeps racers clear of the water.
    const riverVerts: number[] = [],
      riverIndices: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const x = -93 + (i * 186) / 32,
        z = 69 + Math.sin(x / 31) * 4;
      riverVerts.push(x, 0.016, z, x, 0.016, z + 18);
      if (i < 32) {
        const j = i * 2;
        riverIndices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
      }
    }
    const riverGeo = new THREE.BufferGeometry();
    riverGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(riverVerts, 3),
    );
    riverGeo.setIndex(riverIndices);
    riverGeo.computeVertexNormals();
    const riverMesh = new THREE.Mesh(
      riverGeo,
      new THREE.MeshStandardMaterial({
        color: "#548b98",
        roughness: 0.3,
        metalness: 0.2,
        side: THREE.DoubleSide,
      }),
    );
    root.add(riverMesh);
    for (let x = -86; x < 86; x += 6) {
      const z = 66 + Math.sin(x / 31) * 4,
        nextZ = 66 + Math.sin((x + 6) / 31) * 4;
      rail(x, z, x + 6, nextZ, 1.2);
      if (clearCircle(x, z, 0.18)) {
        cylinder(x, 0.65, z, 0.12, 1.3, wood);
        colliders.push({ type: "circle", x, z, radius: 0.18 });
      }
    }
    for (let z = -49; z <= 61; z += 11)
      for (let x = -77; x <= 77; x += 13) {
        if (Math.pow((x + 14) / 21, 2) + Math.pow((z - 9) / 25, 2) < 1.2)
          continue;
        const offset = Math.sin(x * 1.7 + z) * 2.5;
        tree(
          x + offset,
          z + Math.cos(x + z) * 2,
          0.85 + Math.abs(Math.sin(x * 0.37 + z)) * 0.55,
        );
      }
    // Waterside reeds, benches and lampposts reward the slower, scenic line.
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2,
        x = -14 + 18 * Math.cos(a),
        z = 9 + 22 * Math.sin(a);
      if (!clearCircle(x, z, 0.4)) continue;
      for (let j = 0; j < 3; j++)
        box(
          x + j * 0.14,
          0.55 + j * 0.11,
          z,
          0.045,
          1.1 + j * 0.22,
          0.045,
          leaf,
        );
    }
    bench(-10, 35);
    bench(17, 16);
    bench(-42, 2);
    bench(17, -48);
    for (const t of [0.08, 0.29, 0.48, 0.7, 0.89]) {
      const p = curve.getPointAt(t),
        tan = curve.getTangentAt(t);
      p.add(v(tan.z, 0, -tan.x).multiplyScalar(track.width / 2 + 2.6));
      if (!clearCircle(p.x, p.z, 0.25)) continue;
      cylinder(p.x, 2.1, p.z, 0.09, 4.2, steel);
      const lamp = new THREE.Mesh(sphereGeo, glow);
      lamp.position.set(p.x, 4.2, p.z);
      lamp.scale.setScalar(0.36);
      root.add(lamp);
      colliders.push({ type: "circle", x: p.x, z: p.z, radius: 0.2 });
    }
    const sign = label(
      "SCHLOSSPARK  ·  KOCHER",
      14,
      1.5,
      "#345b49",
      "#eee8cc",
      85,
    );
    sign.position.set(0, 3.7, -57.37);
    root.add(sign);
    const waterSign = label("KOCHER →", 4, 0.8, "#3d6363", "#f4efdd", 115);
    waterSign.position.set(18, 1.5, 57);
    waterSign.rotation.y = Math.PI;
    root.add(waterSign);
  }
  const start = curve.getPointAt(0),
    tangent = curve.getTangentAt(0),
    startYaw = Math.atan2(tangent.x, tangent.z);
  const grid = new THREE.Group();
  grid.position.copy(start);
  grid.rotation.y = startYaw;
  root.add(grid);
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 16; col++)
      box(
        ((col - 7.5) * track.width) / 16,
        0.077,
        (row - 0.5) * 0.4,
        track.width / 16,
        0.025,
        0.4,
        (row + col) % 2 ? white : dark,
        grid,
      );
  for (const side of [-1, 1]) {
    box(side * (track.width / 2 + 1.15), 2.8, 0, 0.2, 5.6, 0.2, steel, grid);
    box(
      side * (track.width / 2 + 1.15),
      0.15,
      0,
      0.55,
      0.3,
      0.55,
      orange,
      grid,
    );
  }
  box(0, 5.45, 0, track.width + 2.5, 0.7, 0.3, steel, grid);
  const banner = label(
    "OVERHEAD / OVERDRIVE",
    track.width + 2,
    0.57,
    "#26383d",
    "#e7be4a",
    78,
  );
  banner.position.set(0, 5.45, -0.17);
  banner.rotation.y = Math.PI;
  grid.add(banner);
  const bannerBack = banner.clone();
  bannerBack.position.z = 0.17;
  bannerBack.rotation.y = 0;
  grid.add(bannerBack);
  for (let i = 0; i < 4; i++)
    box((i - 1.5) * 0.4, 4.9, 0, 0.2, 0.17, 0.3, glow, grid);
  for (const t of [0.15, 0.38, 0.6, 0.82]) {
    const p = curve.getPointAt(t),
      tan = curve.getTangentAt(t),
      n = v(tan.z, 0, -tan.x);
    p.addScaledVector(n, track.width / 2 + 1.8);
    if (!clearCircle(p.x, p.z, 0.4)) continue;
    // Board faces approaching drivers; arrow points in the road's direction on the floor too.
    const sign = label("›  ›  ›", 2.5, 0.9, "#273d40", track.accent, 230);
    sign.position.set(p.x, 1.45, p.z);
    sign.rotation.y = Math.atan2(-tan.x, -tan.z);
    root.add(sign);
    box(p.x, 0.6, p.z, 0.08, 1.2, 0.08, steel);
  }
  // Static instancing keeps hundreds of bars, windows and leaves inexpensive.
  root.updateMatrixWorld(true);
  const batches = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const key = `${o.geometry.uuid}/${o.material.uuid}`;
    const list = batches.get(key) ?? [];
    list.push(o);
    batches.set(key, list);
  });
  for (const meshes of batches.values()) {
    if (meshes.length < 3) continue;
    const batch = new THREE.InstancedMesh(
      meshes[0].geometry,
      meshes[0].material,
      meshes.length,
    );
    batch.castShadow = meshes.some((m) => m.castShadow);
    batch.receiveShadow = meshes.some((m) => m.receiveShadow);
    meshes.forEach((mesh, i) => {
      batch.setMatrixAt(i, mesh.matrixWorld);
      mesh.removeFromParent();
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere();
    root.add(batch);
  }
  return {
    colliders,
    curve,
    start,
    startYaw,
    dispose() {
      scene.remove(root);
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          geometries.add(o.geometry);
          if (o instanceof THREE.InstancedMesh) o.dispose();
          for (const mat of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            materials.add(mat);
            for (const value of Object.values(mat))
              if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

export function createProjector(color: string, raceNumber = 1): THREE.Group {
  const root = new THREE.Group();
  root.name = "overhead-projector";
  const body = new THREE.Group();
  body.name = "body";
  root.add(body);
  const cream = new THREE.MeshStandardMaterial({
    color: "#e8dfc8",
    roughness: 0.55,
    metalness: 0.03,
  });
  const black = new THREE.MeshStandardMaterial({
    color: "#283336",
    roughness: 0.64,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: "#a0afb0",
    metalness: 0.78,
    roughness: 0.29,
  });
  const accent = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.39,
    metalness: 0.13,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: "#fff6db",
    emissive: "#ffe3a6",
    emissiveIntensity: 1.15,
    roughness: 0.15,
    metalness: 0.06,
    toneMapped: false,
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    parent: THREE.Object3D = body,
  ) {
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  // Steel trolley, two shelves, four caster forks, rubber wheels.
  box(0, 0.39, 0, 1.08, 0.075, 1.26, metal);
  box(0, 0.73, 0, 1.08, 0.075, 1.26, metal);
  for (const x of [-0.43, 0.43])
    for (const z of [-0.51, 0.51]) {
      box(x, 0.47, z, 0.055, 0.59, 0.055, metal);
      box(x, 0.18, z, 0.075, 0.2, 0.075, metal);
      const caster = new THREE.Group();
      caster.name = "caster";
      caster.position.set(x, 0.13, z);
      root.add(caster);
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.11, 12),
        black,
      );
      wheel.name = "wheel";
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      caster.add(wheel);
      box(x, 0.095, z, 0.035, 0.035, 0.035, metal, root);
    }
  box(0, 0.48, 0.04, 0.72, 0.055, 0.71, accent); // transparencies folder on the lower shelf
  box(0.035, 0.52, 0.08, 0.66, 0.026, 0.65, cream);
  box(0, 1.02, 0, 1.04, 0.5, 1.12, cream);
  box(0, 0.83, 0, 1.07, 0.09, 1.15, black);
  box(0, 1.3, 0, 1.08, 0.09, 1.17, cream);
  box(0, 1.354, 0.05, 0.83, 0.035, 0.87, black);
  box(0, 1.376, 0.05, 0.74, 0.018, 0.77, glass);
  // Fresnel glass rings catch the light, without a texture dependency.
  for (let i = 1; i <= 7; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.035 * i, 0.003, 3, 40),
      metal,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 1.387, 0.05);
    body.add(ring);
  }
  box(0, 1.03, 0.567, 0.91, 0.24, 0.019, accent);
  for (const x of [-0.529, 0.529])
    for (let j = 0; j < 7; j++)
      box(x, 1.055, -0.36 + j * 0.112, 0.018, 0.115, 0.038, black);
  // Mast is mounted at the back, with an unmistakable overhead mirror head.
  const mast = new THREE.Group();
  mast.name = "mast";
  mast.position.set(0, 1.19, -0.47);
  body.add(mast);
  box(0, 0.62, 0, 0.075, 1.27, 0.075, metal, mast);
  box(0, 0.32, 0, 0.125, 0.14, 0.13, black, mast);
  box(0, 1.21, 0.21, 0.085, 0.075, 0.46, metal, mast);
  box(0, 1.2, 0.35, 0.53, 0.16, 0.47, cream, mast);
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.075, 20),
    black,
  );
  lens.position.set(0, 1.075, 0.37);
  mast.add(lens);
  const lensGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.126, 0.126, 0.079, 20),
    glass,
  );
  lensGlass.position.copy(lens.position);
  mast.add(lensGlass);
  const mirror = box(0, 1.34, 0.33, 0.48, 0.035, 0.44, metal, mast);
  mirror.rotation.x = -0.55;
  box(0.075, 1.02, 0.582, 0.31, 0.1, 0.015, cream);
  box(-0.37, 1.015, 0.594, 0.063, 0.063, 0.027, black);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 6),
    new THREE.MeshStandardMaterial({
      color: "#9af6b0",
      emissive: "#71db8b",
      emissiveIntensity: 1,
    }),
  );
  lamp.position.set(-0.26, 1.015, 0.596);
  body.add(lamp);
  // Trolley push handle, capped in team colour.
  for (const x of [-0.46, 0.46]) box(x, 0.98, -0.66, 0.055, 0.52, 0.055, metal);
  box(0, 1.23, -0.66, 0.98, 0.07, 0.07, accent);
  // Little front race number plate.
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f4ead0";
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = "#24353b";
    ctx.font = "900 48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(raceNumber).padStart(2, "0"), 64, 35);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.33, 0.16),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.65 }),
    );
    plate.position.set(0.11, 1.025, 0.591);
    body.add(plate);
  }
  for (const parent of [body, mast, root]) {
    const batches = new Map<string, THREE.Mesh[]>();
    for (const object of parent.children) {
      if (
        !(object instanceof THREE.Mesh) ||
        Array.isArray(object.material) ||
        object.name === "wheel"
      )
        continue;
      const key = `${object.geometry.uuid}/${object.material.uuid}`;
      const batch = batches.get(key) ?? [];
      batch.push(object);
      batches.set(key, batch);
    }
    for (const meshes of batches.values()) {
      if (meshes.length < 3) continue;
      const batch = new THREE.InstancedMesh(
        meshes[0].geometry,
        meshes[0].material,
        meshes.length,
      );
      batch.castShadow = true;
      batch.receiveShadow = true;
      meshes.forEach((mesh, i) => {
        mesh.updateMatrix();
        batch.setMatrixAt(i, mesh.matrix);
        mesh.removeFromParent();
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingSphere();
      parent.add(batch);
    }
  }
  return root;
}
