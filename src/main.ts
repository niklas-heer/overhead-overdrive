import * as THREE from "three";
import { buildWorld, createProjector, tracks, type Track } from "./world";
import {
  createVehicle,
  stepVehicle,
  collideAABB,
  collideCircle,
  type VehicleState,
  type Input,
} from "./physics";
import "./style.css";
import { CasterTrails } from "./effects";
import { GameAudio } from "./audio";
import { ItemSystem, ITEM_INFO, type ItemKind } from "./items";
import { ItemView } from "./item-view";
import { RIVAL_PROFILES, createRivalBrain, driveRival } from "./rivals";

type Mode = "menu" | "countdown" | "race" | "tour" | "paused" | "finish";
type Racer = {
  state: VehicleState;
  mesh: THREE.Group;
  name: string;
  color: string;
  checkpoint: number;
  laps: number;
  finished: boolean;
  finishTime: number;
  stuck: number;
  brain: ReturnType<typeof createRivalBrain>;
  itemTimer: number;
  recoveryGrace: number;
};
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="viewport" aria-label="3D overhead projector racing game"></div>
  <div class="vignette"></div>
  <header id="header"><a class="wordmark" href="#" aria-label="Overhead Overdrive home"><span class="brand-icon">▰<i></i></span> OVERHEAD<span>OVERDRIVE</span><sup>®</sup></a><nav><button class="nav-link active" data-tab="race">THE RACE</button><button class="nav-link" data-tab="garage">THE GARAGE</button><button class="nav-link" data-tab="school">THE SCHOOL <span>↗</span></button></nav><button id="sound" class="sound" title="Toggle sound" aria-label="Enable sound">SOUND <span>OFF</span> ◌</button></header>
  <main id="menu">
    <section class="hero"><div class="eyebrow"><span class="live-dot"></span> SCHOOL’S OUT. PROJECTORS AREN’T.</div><h1>ZERO AERO.<br>ALL <em>OVERDRIVE.</em></h1><p class="intro">The classroom legend. Now a track menace.<br>Take your overhead projector for the ride of its life.</p><div class="hero-meta"><span>01 — GAILDORF, GERMANY</span><span>EST. AFTER SCHOOL</span></div></section>
    <aside class="machine-label"><span class="label-line"></span><span class="tiny">YOUR HIGH-PERFORMANCE DINOSAUR</span><strong>THE ORIGINAL <span>01</span></strong><span class="machine-spec">850 W OF QUESTIONABLE DECISIONS</span></aside>
    <section class="race-picker"><div class="section-label"><span>01 / PICK YOUR PLAYGROUND</span><span class="track-count">3 PLACES. ONE QUESTIONABLE VEHICLE.</span></div><div id="tracks" class="track-grid"></div><p id="track-brief" class="track-brief"></p><div class="launch-row"><div class="keys-caption"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span><span>DRIVE</span><span class="key wide">SPACE</span><span>DRIFT</span><span class="key wide">SHIFT</span><span>BOOST</span><span class="key">E</span><span>ITEM</span></div><button id="start" class="primary">LET’S ROLL <span>↗</span></button></div></section>
  </main>
  <section id="garage" class="panel hidden"><span class="eyebrow">THE GARAGE / BUILT DIFFERENT</span><h2>Office equipment.<br><em>Unprofessional speed.</em></h2><p>Choose your setup. Every part changes how the trolley handles.</p><div id="setups" class="setups"></div><div class="paint-row"><span>RACING LIVERY</span><div id="paints"></div></div><button id="garage-done" class="primary">BACK TO THE GRID <span>↗</span></button></section>
  <section id="school" class="panel school-panel hidden"><span class="eyebrow">THE SCHOOL / REAL PLACE. UNREAL RACING.</span><h2>Back to<br><em>Gaildorf.</em></h2><p>A 3D interpretation of the Schenk-von-Limpurg-Gymnasium, built from its public architecture photos: the glass-roof atrium, white brick walls, yellow doors and steel gallery railings.</p><div class="school-note"><strong>A familiar school. A new racing line.</strong><p>The visual details follow photos. Room connections, dimensions and race courses are imagined for the game, not a surveyed reconstruction.</p></div><div class="source-links"><a href="https://www.svlg-gaildorf.de/de/unsere-schule/profil" target="_blank" rel="noopener">EXPLORE THE SCHOOL WEBSITE ↗</a><a href="/school-reference.md" target="_blank" rel="noopener">PHOTO REFERENCES & MODEL NOTES ↗</a></div><button id="tour" class="primary">TAKE A FREE DRIVE <span>↗</span></button><button id="export-model" class="secondary">DOWNLOAD THIS 3D SCHOOL · GLB ↓</button><p id="export-status" role="status"></p></section>
  <footer id="footer"><span>A LOVE LETTER TO SCHOOL DAYS & ARCADE RACERS.</span><span>NO HOMEWORK. JUST HORSEPOWER. <b>↗</b></span></footer>
  <section id="hud" class="hidden"><div class="hud-top"><div><span class="tiny" id="race-title">ATRIUM CIRCUIT</span><div class="position"><strong id="position">1</strong><span>/ 4</span></div></div><div class="timing"><span class="tiny" id="lap">LAP 1 / 3</span><strong id="timer">00:00.00</strong><span id="best" class="tiny"></span></div><button id="pause" class="hud-button" aria-label="Pause game">Ⅱ</button></div><div id="standings" class="standings"></div><button id="race-sound" class="race-sound" aria-label="Toggle race sound">SOUND OFF</button><button id="item-slot" class="item-slot" aria-label="Use equipped item"><span id="item-icon">＋</span><div><span class="tiny">SCHOOL SUPPLIES</span><strong id="item-name">FIND A PICKUP</strong><span id="item-hint">Drive through a glowing supply box</span></div><kbd id="item-key">E</kbd></button><div id="status-badges"></div><div id="hit-flash"></div><div id="countdown"></div><div id="race-message"></div><div class="hud-bottom"><div class="map-block"><canvas id="minimap" width="220" height="160"></canvas><span id="next-turn" class="tiny">FOLLOW THE PAINTED ARROWS</span></div><div class="race-controls"><span>WASD / ARROWS · DRIVE</span><span>SPACE · DRIFT &nbsp; SHIFT · BOOST &nbsp; E · USE ITEM</span><span>R · RECOVER &nbsp; C · CAMERA &nbsp; ESC · PAUSE</span></div><div class="speedometer"><span id="drift-label">READY TO ROLL</span><div><strong id="speed">0</strong><span>KM/H</span></div><div class="boost-track"><div id="boost-bar"></div></div><span class="tiny">LAMP OVERDRIVE <span id="boost-value">100%</span></span></div></div><div id="touch-controls"><button data-key="ArrowLeft" aria-label="Steer left">◀</button><button data-key="ArrowRight" aria-label="Steer right">▶</button><button data-key="ArrowDown" aria-label="Brake and reverse">↓</button><button data-key="Space">DRIFT</button><button data-key="ShiftLeft">BOOST</button><button data-key="KeyE" aria-label="Use item">ITEM</button><button data-key="ArrowUp">GO</button></div></section>
  <div id="overlay" class="overlay hidden"><div class="dialog"><span class="eyebrow" id="overlay-tag">RECESS</span><h2 id="overlay-title">Take a breather.</h2><p id="overlay-copy">Your projector is keeping the lamp warm.</p><div id="results"></div><button id="resume" class="primary">KEEP ROLLING <span>↗</span></button><button id="restart" class="secondary">RESTART RACE</button><button id="quit" class="text-button">BACK TO SCHOOL SELECTION</button></div></div>
  <div id="error" class="hidden"></div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const hidden = (id: string, value: boolean) =>
  $(id).classList.toggle("hidden", value);
const setups = [
  {
    name: "The Original",
    tag: "BALANCED",
    description:
      "The trusty classroom classic. Predictable grip, a little wobble, plenty of character.",
    motor: 1,
    grip: 1,
    stability: 1,
    stats: [65, 75, 70],
  },
  {
    name: "Hall Monitor",
    tag: "PRECISION",
    description:
      "Rubber casters and a braced mast. Holds a line when the corridor gets tight.",
    motor: 0.88,
    grip: 1.25,
    stability: 1.3,
    stats: [50, 96, 92],
  },
  {
    name: "Loose Cannon",
    tag: "DRIFT",
    description:
      "Hotter lamp, loose casters. Fast, sideways, and definitely out of warranty.",
    motor: 1.22,
    grip: 0.78,
    stability: 0.8,
    stats: [94, 45, 44],
  },
];
let setupIndex = 0,
  color = "#ff663f",
  selected = tracks[0],
  mode: Mode = "menu",
  previousMode: Mode = "race",
  cameraMode = 0;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
} catch {
  $("error").className = "";
  $("error").innerHTML =
    "<h2>This projector needs WebGL.</h2><p>Please open the game in a browser with hardware acceleration enabled.</p>";
  throw new Error("WebGL is unavailable");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
$("viewport").appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#bec8c4");
scene.fog = new THREE.Fog("#bec8c4", 65, 150);
const camera = new THREE.PerspectiveCamera(
  49,
  innerWidth / innerHeight,
  0.1,
  240,
);
scene.add(new THREE.HemisphereLight("#fff5df", "#5b6e6c", 2.7));
const sun = new THREE.DirectionalLight("#fff0cf", 3.4);
sun.position.set(-18, 35, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -65,
  right: 65,
  top: 65,
  bottom: -65,
  far: 110,
});
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.06;
scene.add(sun);
const trails = new CasterTrails(scene);
let world: ReturnType<typeof buildWorld>;
let items: ItemSystem;
let itemView: ItemView;
let hitFlash = 0;
let lastEventText = "";
let racers: Racer[] = [],
  checkpoints: THREE.Vector3[] = [],
  raceTime = 0,
  countdownTime = 3.6,
  accumulator = 0,
  recoverPenalty = 0;
const keys = new Set<string>();
const bestKey = () => `overdrive-v2-best-${selected.id}-${setupIndex}`;
const getBest = () => {
  try {
    return Number(localStorage.getItem(bestKey()) || 0);
  } catch {
    return 0;
  }
};
const saveBest = (value: number) => {
  try {
    localStorage.setItem(bestKey(), String(value));
  } catch {
    /* Storage may be disabled. */
  }
};
const format = (sec: number) =>
  `${Math.floor(sec / 60)
    .toString()
    .padStart(2, "0")}:${(sec % 60).toFixed(2).padStart(5, "0")}`;

function removeRacers() {
  for (const racer of racers) {
    scene.remove(racer.mesh);
    racer.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        mats.forEach((mat) => {
          for (const value of Object.values(mat))
            if (value instanceof THREE.Texture) value.dispose();
          mat.dispose();
        });
        if (obj instanceof THREE.InstancedMesh) obj.dispose();
      }
    });
  }
  racers = [];
}
function loadTrack(track: Track) {
  selected = track;
  trails.clear();
  itemView?.dispose();
  if (world) world.dispose();
  removeRacers();
  world = buildWorld(scene, track);
  const length = world.curve.getLength();
  checkpoints = Array.from(
    { length: Math.max(20, Math.round(length / 5)) },
    (_, i) => world.curve.getPointAt(i / Math.max(20, Math.round(length / 5))),
  );
  const colors = [color, ...RIVAL_PROFILES.map((p) => p.color)];
  const names = ["YOU", ...RIVAL_PROFILES.map((p) => p.name)];
  for (let i = 0; i < 4; i++) {
    const t = i === 0 ? 0 : 1 - i * 0.011;
    const p = world.curve.getPointAt(t);
    const tangent = world.curve.getTangentAt(t);
    const side = i % 2 === 0 ? -1 : 1;
    const x = p.x + tangent.z * side * 0.9,
      z = p.z - tangent.x * side * 0.9;
    const mesh = createProjector(colors[i], i + 1);
    scene.add(mesh);
    racers.push({
      state: createVehicle(x, z, Math.atan2(tangent.x, tangent.z)),
      mesh,
      name: names[i],
      color: colors[i],
      checkpoint: 1,
      laps: 0,
      finished: false,
      finishTime: Infinity,
      stuck: 0,
      brain: createRivalBrain(Math.max(0, i - 1)),
      itemTimer: 2 + i * 0.7,
      recoveryGrace: 0,
    });
  }
  const supplyPositions = Array.from({ length: 9 }, (_, i) => {
    const t = 0.028 + i * 0.104,
      p = world.curve.getPointAt(t),
      tan = world.curve.getTangentAt(t);
    const offset = i === 0 ? -0.9 : i % 2 === 0 ? 0.7 : -0.7;
    return {
      x: p.x + tan.z * offset,
      z: p.z - tan.x * offset,
      kind: (["laser", "shield", "turbo"] as ItemKind[])[i % 3],
    };
  });
  const targetPositions = [0.085, 0.37, 0.68].map((t) => {
    const p = world.curve.getPointAt(t);
    return { x: p.x, z: p.z };
  });
  items = new ItemSystem(
    racers.map((r) => r.state),
    supplyPositions,
    targetPositions,
    world.colliders,
  );
  itemView = new ItemView(scene, items);
  const outside = selected.id !== "atrium";
  scene.background = new THREE.Color(outside ? "#b5cdda" : "#b7c8c8");
  scene.fog = new THREE.Fog(
    outside ? "#b5cdda" : "#b7c8c8",
    outside ? 110 : 65,
    outside ? 220 : 150,
  );
  hitFlash = 0;
  syncModels(0);
  renderTrackCards();
  updatePaint();
}
function renderTrackCards() {
  $("track-brief").textContent = selected.description;
  $("tracks").innerHTML = tracks
    .map(
      (track, i) =>
        `<button class="track-card ${track.id === selected.id ? "selected" : ""}" data-track="${track.id}"><span class="track-art art-${i}"><svg viewBox="0 0 120 70"><path d="${trackPath(track)}"/></svg><span class="track-number">0${i + 1}</span>${track.id === selected.id ? '<span class="selected-check">✓</span>' : ""}</span><span class="track-content"><span class="tiny">${track.subtitle}</span><strong>${track.name}</strong><span class="track-details">${track.difficulty} <i></i> ${Math.round(track.length)} M <i></i> 3 LAPS</span></span></button>`,
    )
    .join("");
  document.querySelectorAll<HTMLButtonElement>("[data-track]").forEach(
    (button) =>
      (button.onclick = () => {
        loadTrack(tracks.find((t) => t.id === button.dataset.track)!);
        audio.click();
      }),
  );
}
function trackPath(track: Track) {
  const xs = track.points.map((p) => p.x),
    zs = track.points.map((p) => p.z);
  const minX = Math.min(...xs),
    minZ = Math.min(...zs),
    scale = Math.min(
      90 / (Math.max(...xs) - minX),
      45 / (Math.max(...zs) - minZ),
    );
  return (
    track.points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${15 + (p.x - minX) * scale},${12 + (p.z - minZ) * scale}`,
      )
      .join(" ") + " Z"
  );
}
function renderSetups() {
  $("setups").innerHTML = setups
    .map(
      (s, i) =>
        `<button class="setup ${i === setupIndex ? "chosen" : ""}" data-setup="${i}"><span class="tiny">0${i + 1} / ${s.tag}</span><strong>${s.name}</strong><p>${s.description}</p>${s.stats.map((v, j) => `<div class="stat"><span>${["POWER", "GRIP", "BALANCE"][j]}</span><i><b style="width:${v}%"></b></i></div>`).join("")}</button>`,
    )
    .join("");
  document.querySelectorAll<HTMLButtonElement>("[data-setup]").forEach(
    (b) =>
      (b.onclick = () => {
        setupIndex = Number(b.dataset.setup);
        renderSetups();
        document.querySelector(".machine-label strong")!.innerHTML =
          `${setups[setupIndex].name.toUpperCase()} <span>0${setupIndex + 1}</span>`;
        audio.click();
      }),
  );
}
function updatePaint() {
  $("paints").innerHTML = [
    "#ff663f",
    "#5b9c94",
    "#edc658",
    "#7994c6",
    "#ece4ce",
  ]
    .map(
      (c) =>
        `<button aria-label="Paint ${c}" data-color="${c}" class="paint ${c === color ? "chosen" : ""}" style="--paint:${c}"></button>`,
    )
    .join("");
  document.querySelectorAll<HTMLButtonElement>("[data-color]").forEach(
    (b) =>
      (b.onclick = () => {
        color = b.dataset.color!;
        const old = racers[0].mesh;
        scene.remove(old);
        old.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            if (o instanceof THREE.InstancedMesh) o.dispose();
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(
              (m) => {
                for (const value of Object.values(m))
                  if (value instanceof THREE.Texture) value.dispose();
                m.dispose();
              },
            );
          }
        });
        racers[0].mesh = createProjector(color);
        racers[0].color = color;
        scene.add(racers[0].mesh);
        updatePaint();
      }),
  );
}
function showTab(tab: string) {
  mode = "menu";
  hidden("menu", tab !== "race");
  hidden("garage", tab !== "garage");
  hidden("school", tab !== "school");
  hidden("header", false);
  hidden("footer", false);
  hidden("hud", true);
  hidden("overlay", true);
  document
    .querySelectorAll("[data-tab]")
    .forEach((el) =>
      el.classList.toggle("active", (el as HTMLElement).dataset.tab === tab),
    );
  keys.clear();
}
function startRace(tour = false) {
  loadTrack(selected);
  raceTime = 0;
  hitFlash = 0;
  lastEventText = "";
  $("race-message").textContent = "";
  recoverPenalty = 0;
  countdownTime = 3.6;
  mode = tour ? "tour" : "countdown";
  for (const id of ["menu", "garage", "school", "header", "footer", "overlay"])
    hidden(id, true);
  hidden("hud", false);
  $("race-title").textContent = tour
    ? "FREE DRIVE / " + selected.name
    : selected.name;
  document.querySelector(".position")!.classList.toggle("hidden", tour);
  $("best").textContent = getBest()
    ? `PERSONAL BEST ${format(getBest())}`
    : "SET YOUR FIRST RECORD";
  $("countdown").textContent = tour ? "" : "3";
  keys.clear();
  camera.position
    .copy(racers[0].mesh.position)
    .add(new THREE.Vector3(-5, 5, -7));
  audio.start();
  audio.click();
}
function pause() {
  if (mode === "paused") {
    mode = previousMode;
    hidden("overlay", true);
    return;
  }
  if (!["race", "countdown", "tour"].includes(mode)) return;
  previousMode = mode;
  mode = "paused";
  keys.clear();
  hidden("overlay", false);
  $("overlay-tag").textContent = "RECESS";
  $("overlay-title").textContent = "Take a breather.";
  $("overlay-copy").textContent = "Your projector is keeping the lamp warm.";
  $("results").innerHTML = "";
  hidden("resume", false);
  $("restart").textContent =
    "RESTART " + (previousMode === "tour" ? "FREE DRIVE" : "RACE");
}
function recover(racer: Racer, penalize = true) {
  const index =
    (racer.checkpoint - 1 + checkpoints.length) % checkpoints.length;
  const p = checkpoints[index],
    tangent = world.curve.getTangentAt(index / checkpoints.length);
  racer.state = createVehicle(p.x, p.z, Math.atan2(tangent.x, tangent.z));
  racer.recoveryGrace = 1.2;
  if (items) {
    const e = items.equipment[racers.indexOf(racer)];
    e.state = racer.state;
    e.stun = 0;
    e.turbo = 0;
    e.immunity = 2;
  }
  if (racer === racers[0] && penalize && mode === "race") {
    raceTime += 2;
    recoverPenalty = 2.5;
    $("race-message").textContent = "BACK ON YOUR CASTERS · +2 SEC";
  }
}
function finish() {
  mode = "finish";
  audio.bell();
  const previous = getBest();
  const isBest = !previous || raceTime < previous;
  if (isBest) saveBest(raceTime);
  hidden("overlay", false);
  $("overlay-tag").textContent = isBest
    ? "NEW PERSONAL BEST"
    : "CLASS DISMISSED";
  $("overlay-title").textContent = "That’s a wrap.";
  $("overlay-copy").textContent =
    `${selected.name} · ${setups[setupIndex].name} · 3 laps · ${items.equipment[0].hits} laser hits`;
  $("results").innerHTML =
    `<div class="result-time">${format(raceTime)}</div><p>FINISHED ${ordinal(getPosition())} / 4${isBest ? " · YOUR FASTEST RUN YET" : ""}</p>`;
  hidden("resume", true);
  $("restart").textContent = "ONE MORE RACE";
}
function ordinal(n: number) {
  return ["1ST", "2ND", "3RD", "4TH"][n - 1] || String(n);
}
function progress(r: Racer) {
  const previous =
    checkpoints[(r.checkpoint - 1 + checkpoints.length) % checkpoints.length];
  const target = checkpoints[r.checkpoint % checkpoints.length];
  const leg = previous.distanceTo(target);
  return (
    r.laps * checkpoints.length +
    r.checkpoint -
    Math.min(1, Math.hypot(r.state.x - target.x, r.state.z - target.z) / leg)
  );
}
function getPosition() {
  return (
    [...racers]
      .sort((a, b) =>
        a.finished && b.finished
          ? a.finishTime - b.finishTime
          : a.finished
            ? -1
            : b.finished
              ? 1
              : progress(b) - progress(a),
      )
      .indexOf(racers[0]) + 1
  );
}
function updateProgress(r: Racer) {
  const target = checkpoints[r.checkpoint % checkpoints.length];
  const startTangent = world.curve.getTangentAt(0);
  const crossedLine =
    r.checkpoint % checkpoints.length !== 0 ||
    (r.state.x - target.x) * startTangent.x +
      (r.state.z - target.z) * startTangent.z >=
      0;
  if (
    crossedLine &&
    Math.hypot(r.state.x - target.x, r.state.z - target.z) <
      selected.width * 0.63
  ) {
    r.checkpoint++;
    if (r.checkpoint > checkpoints.length) {
      r.laps++;
      r.checkpoint = 1;
      if (r === racers[0]) {
        audio.bell();
        if (r.laps >= 3) {
          r.finished = true;
          r.finishTime = raceTime;
          finish();
        } else {
          $("race-message").textContent =
            r.laps === 2
              ? "FINAL LAP · MAKE IT COUNT"
              : "LAP 2 · CLASS IS IN SESSION";
          recoverPenalty = 2.4;
        }
      } else if (r.laps >= 3) {
        r.finished = true;
        r.finishTime = raceTime;
      }
    }
  }
}
function collide(r: Racer) {
  for (const c of world.colliders) {
    if (c.type === "box") collideAABB(r.state, c.minX, c.maxX, c.minZ, c.maxZ);
    else collideCircle(r.state, c.x, c.z, c.radius);
  }
}
function step(dt: number) {
  if (mode === "countdown") {
    const before = Math.ceil(countdownTime);
    countdownTime -= dt;
    const count = Math.ceil(countdownTime);
    if (count !== before) audio.click();
    $("countdown").textContent = count > 0 ? String(Math.min(3, count)) : "GO!";
    if (countdownTime < -0.65) {
      mode = "race";
      $("countdown").textContent = "";
    }
    return;
  }
  if (mode !== "race" && mode !== "tour") return;
  raceTime += dt;
  racers.forEach((r) => (r.recoveryGrace = Math.max(0, r.recoveryGrace - dt)));
  const input: Input = {
    throttle:
      keys.has("KeyW") || keys.has("ArrowUp")
        ? 1
        : keys.has("KeyS") || keys.has("ArrowDown")
          ? -1
          : 0,
    steer:
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
    brake: keys.has("Space"),
    boost: keys.has("ShiftLeft") || keys.has("ShiftRight"),
  };
  const player = racers[0];
  if (items.equipment[0].stun > 0) {
    input.throttle *= 0.25;
    input.steer *= 0.6;
    input.boost = false;
  }
  stepVehicle(player.state, input, dt, setups[setupIndex]);
  collide(player);
  if (mode === "race") {
    for (let i = 1; i < racers.length; i++) {
      const r = racers[i];
      if (r.finished) continue;
      const target = checkpoints[r.checkpoint % checkpoints.length];
      const ai = driveRival(
        r.brain,
        r.state,
        target,
        checkpoints[(r.checkpoint + 1) % checkpoints.length],
        racers
          .filter((other) => other !== r && !other.finished)
          .map((other) => other.state),
        selected.width,
        raceTime,
      );
      if (items.equipment[i].stun > 0) {
        ai.throttle *= 0.25;
        ai.steer *= 0.6;
        ai.boost = false;
      }
      stepVehicle(r.state, ai, dt, RIVAL_PROFILES[i - 1].tuning);
      r.itemTimer -= dt;
      const equipment = items.equipment[i];
      if (r.itemTimer <= 0 && equipment.item) {
        const forwardX = Math.sin(r.state.yaw),
          forwardZ = Math.cos(r.state.yaw);
        const aimed = racers.some((other) => {
          if (other === r || other.finished) return false;
          const dx = other.state.x - r.state.x,
            dz = other.state.z - r.state.z,
            d = Math.hypot(dx, dz);
          return (
            d > 1.4 && d < 29 && (dx * forwardX + dz * forwardZ) / d > 0.993
          );
        });
        if (
          (equipment.item === "laser" && aimed) ||
          (equipment.item === "shield" &&
            racers.some(
              (other) =>
                other !== r &&
                Math.hypot(
                  other.state.x - r.state.x,
                  other.state.z - r.state.z,
                ) < 15,
            )) ||
          (equipment.item === "turbo" &&
            Math.abs(ai.steer) < 0.15 &&
            r.state.speed > 6)
        ) {
          items.use(i);
          r.itemTimer = 2.5 + i * 0.7;
        }
      }
      collide(r);
      r.stuck = Math.abs(r.state.speed) < 0.7 ? r.stuck + dt : 0;
      if (r.stuck > 3.5) {
        recover(r, false);
        r.stuck = 0;
      }
      updateProgress(r);
    }
    for (let i = 0; i < racers.length; i++)
      for (let j = i + 1; j < racers.length; j++) {
        if (
          racers[i].finished ||
          racers[j].finished ||
          racers[i].recoveryGrace > 0 ||
          racers[j].recoveryGrace > 0
        )
          continue;
        const a = racers[i].state,
          b = racers[j].state;
        const dx = a.x - b.x,
          dz = a.z - b.z,
          dist = Math.hypot(dx, dz);
        if (dist < 1.4 && dist > 0.001) {
          const nx = dx / dist,
            nz = dz / dist,
            overlap = (1.4 - dist) * 0.5;
          a.x += nx * overlap;
          a.z += nz * overlap;
          b.x -= nx * overlap;
          b.z -= nz * overlap;
          const vel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (vel < 0) {
            a.vx -= vel * nx * 0.6;
            a.vz -= vel * nz * 0.6;
            b.vx += vel * nx * 0.6;
            b.vz += vel * nz * 0.6;
          }
        }
      }
    updateProgress(player);
  }
  items.equipment.forEach((equipment, i) => {
    equipment.active = !racers[i].finished && (mode !== "tour" || i === 0);
  });
  items.step(dt);
  if (keys.has("KeyE") || keys.has("KeyQ")) items.use(0);
  for (const event of items.drainEvents()) {
    itemView.event(event);
    const isPlayer = event.owner === 0;
    if (event.type === "pickup" && isPlayer) {
      audio.pickup();
      announce(`${ITEM_INFO[event.kind!].name} · E TO USE`, 2.1);
    }
    if (event.type === "laser" && isPlayer) audio.laser();
    if (event.type === "shield" && isPlayer) {
      audio.shield();
      announce("TRANSPARENCY SHIELD · 7 SECONDS", 1.5);
    }
    if (event.type === "turbo" && isPlayer) {
      audio.boost();
      announce("CAPACITOR KICK!", 1.3);
    }
    if (event.type === "hit") {
      if (event.victim === 0) {
        hitFlash = 0.55;
        audio.hit();
        announce(`${racers[event.owner].name.toUpperCase()} TAGGED YOU`, 1.5);
      } else if (isPlayer) {
        audio.hit();
        announce(`TAGGED ${racers[event.victim!].name.toUpperCase()}`, 1.5);
      }
    }
    if (event.type === "blocked" && (isPlayer || event.victim === 0)) {
      audio.shield();
      announce("LASER BLOCKED!", 1.3);
    }
    if (event.type === "target" && isPlayer) {
      audio.pickup();
      announce("POP QUIZ CLEARED · +20% LAMP", 1.6);
    }
  }
  // Grass and paved aprons stay explorable, but cutting far off the racing path costs speed.
  for (const r of racers) {
    if (r.finished || (mode === "tour" && r !== player)) continue;
    const offTrack =
      Math.min(
        ...checkpoints.map((p) => Math.hypot(p.x - r.state.x, p.z - r.state.z)),
      ) >
      selected.width * 0.65;
    if (offTrack) {
      const friction = Math.exp(-1.4 * dt);
      r.state.vx *= friction;
      r.state.vz *= friction;
    }
  }
  hitFlash = Math.max(0, hitFlash - dt);
  if (Math.abs(player.state.x) > 90 || Math.abs(player.state.z) > 90)
    recover(player);
  recoverPenalty = Math.max(0, recoverPenalty - dt);
  if (recoverPenalty === 0) $("race-message").textContent = "";
  audio.update(player.state, input, dt);
  trails.update(player.state);
}
function announce(text: string, seconds: number) {
  lastEventText = text;
  recoverPenalty = seconds;
  $("race-message").textContent = text;
}
function syncModels(time: number) {
  for (let i = 0; i < racers.length; i++) {
    const r = racers[i],
      s = r.state;
    r.mesh.visible =
      mode === "menu" ? i === 0 : mode === "tour" ? i === 0 : true;
    r.mesh.position.set(s.x, 0.055, s.z);
    r.mesh.rotation.set(
      s.pitch,
      s.yaw + (items?.equipment[i].stun > 0 ? Math.sin(time * 28) * 0.06 : 0),
      -s.roll,
      "YXZ",
    );
    const mast = r.mesh.getObjectByName("mast");
    if (mast)
      mast.rotation.z =
        s.wobble + (mode === "menu" ? Math.sin(time * 1.3) * 0.008 : 0);
    r.mesh.traverse((o) => {
      if (o.name.startsWith("wheel")) o.rotation.x += s.speed * 0.0008;
    });
  }
}
const desiredCam = new THREE.Vector3(),
  lookAt = new THREE.Vector3(),
  smoothLook = new THREE.Vector3();
function updateCamera(dt: number, time: number) {
  const s = racers[0].state;
  const pos = new THREE.Vector3(s.x, 0, s.z);
  if (mode === "menu") {
    const angle = s.yaw + 0.8 + Math.sin(time * 0.12) * 0.13;
    desiredCam.set(
      s.x + Math.sin(angle) * 8.3,
      4.9,
      s.z + Math.cos(angle) * 8.3,
    );
    lookAt.copy(pos).add(new THREE.Vector3(0, 1.2, 0));
    camera.setViewOffset(
      innerWidth,
      innerHeight,
      -innerWidth * 0.19,
      innerHeight * 0.025,
      innerWidth,
      innerHeight,
    );
  } else {
    camera.clearViewOffset();
    if (cameraMode === 1) {
      desiredCam.set(s.x, 22, s.z - 7);
      lookAt.copy(pos);
    } else {
      desiredCam.set(
        s.x - Math.sin(s.yaw) * (7.2 + Math.abs(s.speed) * 0.09),
        4.4 + Math.abs(s.speed) * 0.028,
        s.z - Math.cos(s.yaw) * (7.2 + Math.abs(s.speed) * 0.09),
      );
      lookAt.set(s.x + Math.sin(s.yaw) * 3, 1.05, s.z + Math.cos(s.yaw) * 3);
    }
  }
  const factor = 1 - Math.exp(-dt * (mode === "menu" ? 3 : 5));
  camera.position.lerp(desiredCam, factor);
  smoothLook.lerp(lookAt, 1 - Math.exp(-dt * 8));
  camera.lookAt(smoothLook);
  const targetFov =
    mode === "menu"
      ? 49
      : 49 +
        Math.min(8, Math.max(0, s.speed - 10) * 0.5) +
        (items.equipment[0].turbo > 0 ? 3 : 0);
  camera.fov = THREE.MathUtils.lerp(
    camera.fov,
    targetFov,
    1 - Math.exp(-dt * 3),
  );
  camera.updateProjectionMatrix();
}
const map = $<HTMLCanvasElement>("minimap"),
  ctx = map.getContext("2d")!;
function drawMap() {
  const points = world.curve.getSpacedPoints(100);
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x)),
    minZ = Math.min(...points.map((p) => p.z)),
    maxZ = Math.max(...points.map((p) => p.z));
  const scale = Math.min(175 / (maxX - minX), 115 / (maxZ - minZ));
  const ox = (220 - (maxX - minX) * scale) / 2,
    oz = (160 - (maxZ - minZ) * scale) / 2;
  ctx.clearRect(0, 0, 220, 160);
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const x = ox + (points[i].x - minX) * scale,
      y = oz + (points[i].z - minZ) * scale;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = "#ffffff26";
  ctx.lineWidth = selected.width * scale;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.strokeStyle = "#e9e7dca0";
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let i = racers.length - 1; i >= 0; i--) {
    if (mode === "tour" && i > 0) continue;
    const r = racers[i];
    ctx.beginPath();
    ctx.arc(
      ox + (r.state.x - minX) * scale,
      oz + (r.state.z - minZ) * scale,
      i === 0 ? 5 : 3.5,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = r.color;
    ctx.fill();
    if (i === 0) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
let uiFrame = 0;
function updateHUD() {
  if (++uiFrame % 3) return;
  const s = racers[0].state;
  const e = items.equipment[0],
    info = e.item ? ITEM_INFO[e.item] : null;
  $("item-name").textContent = info
    ? `${info.name}${e.item === "laser" ? ` ×${e.charges}` : ""}`
    : "FIND A PICKUP";
  $("item-hint").textContent = info
    ? info.hint
    : "Drive through a glowing supply box";
  $("item-icon").textContent = info?.icon || "＋";
  $("item-slot").style.setProperty("--item-color", info?.color || "#abbfb5");
  $("item-slot").classList.toggle("loaded", !!info);
  $("item-key").textContent = e.cooldown > 0 ? "…" : "E";
  $("status-badges").textContent =
    e.stun > 0
      ? "LASER HIT · RECOVERING"
      : e.shield > 0
        ? `SHIELDED · ${Math.ceil(e.shield)}s`
        : e.turbo > 0
          ? "CAPACITOR KICK"
          : "";
  $("hit-flash").style.opacity = String(hitFlash);
  $("standings").innerHTML =
    mode === "tour"
      ? ""
      : racers
          .map((r, i) => ({ r, i }))
          .sort((a, b) =>
            a.r.finished && b.r.finished
              ? a.r.finishTime - b.r.finishTime
              : a.r.finished
                ? -1
                : b.r.finished
                  ? 1
                  : progress(b.r) - progress(a.r),
          )
          .map(
            ({ r, i }, place) =>
              `<div class="standing ${i === 0 ? "you" : ""}"><b>${place + 1}</b><i style="background:${r.color}"></i><span>${r.name}<small>${i === 0 ? setups[setupIndex].tag : RIVAL_PROFILES[i - 1].style}</small></span>${items.equipment[i].shield > 0 ? "◇" : items.equipment[i].item === "laser" ? "↗" : ""}</div>`,
          )
          .join("");
  $("speed").textContent = String(Math.round(Math.abs(s.speed) * 3.6));
  $("boost-bar").style.width = `${s.boost * 100}%`;
  $("boost-value").textContent = `${Math.round(s.boost * 100)}%`;
  $("drift-label").textContent =
    s.heat > 0.88
      ? "LAMP COOLING"
      : s.drifting
        ? "CASTER CHAOS"
        : (keys.has("ShiftLeft") || keys.has("ShiftRight")) && s.boost > 0.02
          ? "LAMP OVERDRIVE"
          : "READY TO ROLL";
  $("drift-label").classList.toggle("hot", s.drifting);
  $("timer").textContent = format(raceTime);
  $("lap").textContent =
    mode === "tour"
      ? "FREE DRIVE"
      : `LAP ${Math.min(3, racers[0].laps + 1)} / 3`;
  $("position").textContent = String(getPosition());
  drawMap();
}
const audio = new GameAudio();
function toggleSound() {
  audio.toggle();
  $("sound").innerHTML = `SOUND <span>${audio.enabled ? "ON" : "OFF"}</span> ◌`;
  $("race-sound").textContent = `SOUND ${audio.enabled ? "ON" : "OFF"}`;
  $("sound").setAttribute(
    "aria-label",
    audio.enabled ? "Mute sound" : "Enable sound",
  );
}
$("sound").onclick = toggleSound;
$("race-sound").onclick = toggleSound;
$("item-slot").onclick = () => {
  if (mode === "race" || mode === "tour") items.use(0);
};
$("start").onclick = () => startRace();
$("tour").onclick = () => startRace(true);
$("export-model").onclick = async () => {
  const button = $<HTMLButtonElement>("export-model");
  button.disabled = true;
  $("export-status").textContent = "Preparing your school model…";
  try {
    const { GLTFExporter } =
      await import("three/examples/jsm/exporters/GLTFExporter.js");
    const model = scene.getObjectByName(`school-${selected.id}`)!;
    model.userData = {
      description:
        "Stylized SVLG Gaildorf school interpretation. Dimensions and floor plan are invented for gameplay.",
      references: "See docs/school-reference.md",
      track: selected.name,
    };
    const data = await new GLTFExporter().parseAsync(model, { binary: true });
    const url = URL.createObjectURL(
      new Blob([data as ArrayBuffer], { type: "model/gltf-binary" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `svlg-${selected.id}.glb`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("export-status").textContent =
      "Model downloaded. Open the GLB in a compatible 3D viewer or editor.";
  } catch (error) {
    $("export-status").textContent = "Model export failed. Please try again.";
    console.error(error);
  } finally {
    button.disabled = false;
  }
};
$("garage-done").onclick = () => showTab("race");
$("pause").onclick = pause;
$("resume").onclick = pause;
$("restart").onclick = () =>
  startRace(previousMode === "tour" && mode === "paused");
$("quit").onclick = () => {
  showTab("race");
  loadTrack(selected);
};
document
  .querySelectorAll<HTMLButtonElement>("[data-tab]")
  .forEach((b) => (b.onclick = () => showTab(b.dataset.tab!)));
document.querySelector<HTMLAnchorElement>(".wordmark")!.onclick = (e) => {
  e.preventDefault();
  showTab("race");
};
window.addEventListener("keydown", (e) => {
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      e.code,
    ) &&
    mode !== "menu"
  )
    e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Escape") pause();
  if (e.code === "KeyR" && ["race", "tour"].includes(mode)) recover(racers[0]);
  if (e.code === "KeyC") cameraMode = (cameraMode + 1) % 2;
  if (
    e.code === "Enter" &&
    mode === "menu" &&
    !$("menu").classList.contains("hidden")
  )
    startRace();
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  if (["race", "tour", "countdown"].includes(mode)) pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && ["race", "tour", "countdown"].includes(mode)) pause();
});
document.querySelectorAll<HTMLButtonElement>("[data-key]").forEach((b) => {
  b.onpointerdown = (e) => {
    b.setPointerCapture(e.pointerId);
    keys.add(b.dataset.key!);
    e.preventDefault();
  };
  b.onpointerup = b.onpointercancel = () => keys.delete(b.dataset.key!);
});
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
loadTrack(selected);
renderSetups();
camera.position.copy(
  desiredCam.set(racers[0].state.x + 7, 5, racers[0].state.z + 7),
);
smoothLook.set(racers[0].state.x, 1, racers[0].state.z);
let lastTime = performance.now();
function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.06);
  lastTime = now;
  accumulator += dt;
  while (accumulator >= 1 / 120) {
    step(1 / 120);
    accumulator -= 1 / 120;
  }
  syncModels(now / 1000);
  updateCamera(dt, now / 1000);
  if (mode !== "menu") updateHUD();
  itemView.update(
    ["race", "tour"].includes(mode) ? dt : 0,
    camera,
    mode !== "menu",
  );
  if (["menu", "paused", "finish"].includes(mode)) audio.quiet();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Read-only telemetry makes automated gameplay checks possible without altering game state.
Object.defineProperty(window, "__OVERDRIVE__", {
  get: () => ({
    mode,
    track: selected.id,
    time: raceTime,
    target: checkpoints[racers[0].checkpoint % checkpoints.length].toArray(),
    position: getPosition(),
    player: { ...racers[0].state },
    item: items.equipment[0].item,
    charges: items.equipment[0].charges,
    shield: items.equipment[0].shield,
    hits: items.equipment[0].hits,
    message: lastEventText,
    pickups: items.pickups.map((p) => ({ ...p })),
    quizTargets: items.targets.map((p) => ({ ...p })),
    rivals: racers.slice(1).map((r, i) => ({
      name: r.name,
      style: RIVAL_PROFILES[i].style,
      state: { ...r.state },
      laps: r.laps,
      checkpoint: r.checkpoint,
      item: items.equipment[i + 1].item,
    })),
    checkpoint: racers[0].checkpoint,
    laps: racers[0].laps,
    renderCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  }),
});
