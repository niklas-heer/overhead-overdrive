import * as THREE from "three";
import { buildWorld, createProjector, tracks, type Track } from "./world";
import {
  createVehicle,
  DRIFT_READY_CHARGE,
  stepVehicle,
  collideAABB,
  collideCircle,
  type VehicleState,
  type Input,
} from "./physics";
import "./style.css";
import { TiltInput } from "./tilt";
import {
  advanceRaceProgress,
  createRaceProgress,
  lapStatus,
  type Gate,
  type RaceProgress,
} from "./race-progress";
import { CasterTrails, DriftSparks } from "./effects";
import { attachRider, animateRider, RIDERS } from "./rider";
import { RiderFeedback } from "./rider-feedback";
import { animateProjector } from "./personality";
import { SchoolMischief } from "./mischief";
import { GameAudio } from "./audio";
import { ItemSystem, ITEM_INFO, type ItemKind } from "./items";
import { ItemView } from "./item-view";
import { RIVAL_PROFILES, createRivalBrain, driveRival } from "./rivals";

import { OnlineClient, type Room, type Ghost } from "./online-client";
import { OnlineUI } from "./online-ui";
import {
  createOnlineRace,
  advanceOnlineRace,
  ONLINE_VERSION,
  type OnlineRace,
} from "./online-race";

type Mode = "menu" | "countdown" | "race" | "tour" | "paused" | "finish";
type Racer = RaceProgress & {
  state: VehicleState;
  mesh: THREE.Group;
  name: string;
  color: string;
  finished: boolean;
  finishTime: number;
  stuck: number;
  brain: ReturnType<typeof createRivalBrain>;
  itemTimer: number;
  recoveryGrace: number;
  recoveries: number;
  previous: { x: number; z: number };
};
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="viewport" aria-label="3D overhead projector racing game"></div>
  <div class="vignette"></div>
  <header id="header"><a class="wordmark" href="#" aria-label="Overhead Overdrive home"><span class="brand-icon">▰<i></i></span> OVERHEAD<span>OVERDRIVE</span><sup>®</sup></a><nav><button class="nav-link active" data-tab="race">THE RACE</button><button class="nav-link" data-tab="online">THE CLUB</button><button class="nav-link" data-tab="garage">THE GARAGE</button><button class="nav-link" data-tab="school">THE SCHOOL <span>↗</span></button></nav><button id="sound" class="sound" title="Toggle sound" aria-label="Enable sound">SOUND <span>OFF</span> ◌</button></header>
  <main id="menu">
    <section class="hero"><div class="eyebrow"><span class="live-dot"></span> SCHOOL’S OUT. PROJECTORS AREN’T.</div><h1>ZERO AERO.<br>ALL <em>OVERDRIVE.</em></h1><p class="intro" id="hero-intro">The classroom legend. Now a track menace.<br>Take your overhead projector for the ride of its life.</p><div class="hero-meta"><span>01 — GAILDORF, GERMANY</span><span>EST. AFTER SCHOOL</span></div></section>
    <aside class="machine-label"><span class="label-line"></span><span class="tiny">YOUR HIGH-PERFORMANCE DINOSAUR</span><strong>THE ORIGINAL <span>01</span></strong><span class="machine-spec">850 W OF QUESTIONABLE DECISIONS</span><button id="crew-shortcut" class="crew-shortcut">MEET YOUR ACCOMPLICE ↗</button></aside>
    <section class="race-picker"><div class="section-label"><span>01 / PICK YOUR PLAYGROUND</span><span class="track-count">3 PLACES. ONE QUESTIONABLE VEHICLE.</span></div><div id="tracks" class="track-grid"></div><p id="track-brief" class="track-brief"></p><div class="launch-row"><div class="keys-caption"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span><span>DRIVE</span><span class="key wide">SPACE</span><span>DRIFT</span><span class="key wide">SHIFT</span><span>BOOST</span><span class="key">E</span><span>ITEM</span></div><p class="touch-caption">Hold GO to drive. Steer with ◀ ▶. Hold DRIFT, then release for a kick. Tap your supply to use it. Try TILT for motion steering.</p><button id="start" class="primary">LET’S ROLL <span>↗</span></button></div></section>
  </main>
  <section id="garage" class="panel hidden"><span class="eyebrow">THE GARAGE / BUILT DIFFERENT</span><h2>Office equipment.<br><em>Unprofessional speed.</em></h2><p>Pick your accomplice. Borrow a projector. Return it before Monday.</p><section class="crew-picker" aria-label="Choose your rider"><div class="crew-heading"><span class="tiny">01 / WHO’S BORROWING IT?</span><div class="crew-modes" aria-label="Rider mode"><button id="ride-mode" aria-pressed="true">RIDE ALONG</button><button id="classic-mode" aria-pressed="false">CLASSIC</button></div></div><div id="rider-cards" class="rider-cards"></div><p id="rider-bio" class="rider-bio"></p><span class="crew-note">Same trolley handling. Different questionable decisions.</span></section><div class="section-label tuning-label">02 / TUNE YOUR TROLLEY</div><div id="setups" class="setups"></div><div class="paint-row"><span>RACING LIVERY</span><div id="paints"></div></div><button id="garage-done" class="primary">BACK TO THE GRID <span>↗</span></button></section>
  <section id="school" class="panel school-panel hidden"><span class="eyebrow">THE SCHOOL / REAL PLACE. UNREAL RACING.</span><h2>Back to<br><em>Gaildorf.</em></h2><p>A 3D interpretation of the Schenk-von-Limpurg-Gymnasium, built from its public architecture photos: the glass-roof atrium, white brick walls, yellow doors and steel gallery railings.</p><div class="school-note"><strong>A familiar school. A new racing line.</strong><p>The visual details follow photos. Room connections, dimensions and race courses are imagined for the game, not a surveyed reconstruction.</p></div><div class="source-links"><a href="https://www.svlg-gaildorf.de/de/unsere-schule/profil" target="_blank" rel="noopener">EXPLORE THE SCHOOL WEBSITE ↗</a><a href="/school-reference.md" target="_blank" rel="noopener">PHOTO REFERENCES & MODEL NOTES ↗</a></div><button id="tour" class="primary">TAKE A FREE DRIVE <span>↗</span></button><button id="export-model" class="secondary">DOWNLOAD THIS 3D SCHOOL · GLB ↓</button><p id="export-status" role="status"></p></section>
  <footer id="footer"><span>A LOVE LETTER TO SCHOOL DAYS & ARCADE RACERS.</span><span>NO HOMEWORK. JUST HORSEPOWER. <b>↗</b></span></footer>
  <section id="hud" class="hidden"><div class="hud-top"><div><span class="tiny" id="race-title">ATRIUM CIRCUIT</span><div class="position"><strong id="position">1</strong><span>/ 4</span></div></div><div class="timing"><span class="tiny" id="lap">LAP 1 / 3</span><strong id="timer">00:00.00</strong><span id="best" class="tiny"></span></div><button id="pause" class="hud-button" aria-label="Pause game">Ⅱ</button></div><div id="standings" class="standings"></div><button id="race-sound" class="race-sound" aria-label="Toggle race sound">SOUND OFF</button><button id="item-slot" class="item-slot" aria-label="Use equipped item"><span id="item-icon">＋</span><div><span class="tiny">SCHOOL SUPPLIES</span><strong id="item-name">FIND A PICKUP</strong><span id="item-hint">Drive through a glowing supply box</span></div><kbd id="item-key">E</kbd></button><div id="status-badges"></div><div id="hit-flash"></div><div id="countdown"></div><div id="race-message"></div><div class="hud-bottom"><div class="map-block"><canvas id="minimap" width="220" height="160"></canvas><span id="next-turn" class="tiny">FOLLOW THE PAINTED ARROWS</span></div><div class="race-controls"><span>WASD / ARROWS · DRIVE</span><span>SPACE · DRIFT &nbsp; SHIFT · BOOST &nbsp; E · USE ITEM</span><span>R · RECOVER &nbsp; C · CAMERA &nbsp; ESC · PAUSE</span></div><div class="speedometer"><span id="drift-label">READY TO ROLL</span><div><strong id="speed">0</strong><span>KM/H</span></div><div class="drift-meter" aria-label="Drift charge"><div id="drift-charge"></div></div><div class="boost-track"><div id="boost-bar"></div></div><span class="tiny">LAMP OVERDRIVE <span id="boost-value">100%</span></span></div></div><div id="touch-actions"><button id="touch-tilt" class="hud-button" aria-pressed="false">TILT OFF</button><button id="touch-recover" class="hud-button" aria-label="Recover at last checkpoint">RECOVER</button><button id="touch-camera" class="hud-button" aria-label="Switch camera">CAMERA</button></div><p id="tilt-status" role="status"></p><div id="touch-controls" aria-label="Touch driving controls"><button data-key="ArrowLeft" aria-label="Steer left">◀</button><button data-key="ArrowRight" aria-label="Steer right">▶</button><button data-key="ArrowDown" aria-label="Brake and reverse">↓</button><button data-key="Space" aria-label="Hold to drift">DRIFT</button><button data-key="ShiftLeft" aria-label="Hold to boost">BOOST</button><button data-key="ArrowUp" aria-label="Accelerate">GO</button></div></section>
  <div id="overlay" class="overlay hidden"><div class="dialog"><span class="eyebrow" id="overlay-tag">RECESS</span><h2 id="overlay-title">Take a breather.</h2><p id="overlay-copy">Your projector is keeping the lamp warm.</p><div id="results"></div><button id="resume" class="primary">KEEP ROLLING <span>↗</span></button><button id="restart" class="secondary">RESTART RACE</button><button id="quit" class="text-button">BACK TO SCHOOL SELECTION</button></div></div>
  <div id="error" class="hidden"></div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const hidden = (id: string, value: boolean) =>
  $(id).classList.toggle("hidden", value);
const onlineUI = new OnlineUI();
const onlineClient = new OnlineClient();
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
let riderIndex = 0;
let ridersEnabled = true;
try {
  const saved = JSON.parse(localStorage.getItem("overdrive-crew-v1") || "null");
  if (
    saved &&
    Number.isInteger(saved.index) &&
    saved.index >= 0 &&
    saved.index < RIDERS.length
  )
    riderIndex = saved.index;
  if (typeof saved?.enabled === "boolean") ridersEnabled = saved.enabled;
} catch {
  /* Private browsing still gets a complete default crew. */
}
const touchDevice = matchMedia("(any-pointer: coarse)").matches;
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
renderer.setPixelRatio(Math.min(devicePixelRatio, touchDevice ? 1.25 : 1.7));
renderer.setSize(innerWidth, innerHeight, false);
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
const shadowSize = touchDevice ? 1024 : 2048;
sun.shadow.mapSize.set(shadowSize, shadowSize);
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
const riderFeedback = new RiderFeedback(scene);
const trails = new CasterTrails(scene);
const sparks = new DriftSparks(scene);
let mischief: SchoolMischief;
let driftReleases = 0;
let momentCount = 0;
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
const tilt = new TiltInput();
let tiltEnabled = false;
let tiltTimeout: ReturnType<typeof setTimeout> | undefined;
let gates: Gate[] = [];
let raceClosed = false;
let finishSignature = "";
const keys = new Set<string>();
// Track fingers independently from the keyboard and from other fingers on a button.
const touchPointers = new Map<number, HTMLButtonElement>();
const isDown = (key: string) =>
  keys.has(key) ||
  [...touchPointers.values()].some((b) => b.dataset.key === key);
function clearControls() {
  tilt.reset();
  keys.clear();
  const held = [...touchPointers];
  touchPointers.clear();
  for (const [id, button] of held) {
    button.classList.remove("held");
    if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
  }
  pendingUse = pendingRecover = false;
}
function recoverPlayer() {
  if (!["race", "tour"].includes(mode)) return;
  if (onlineKind) pendingRecover = true;
  else recover(racers[0]);
}
const bestKey = () => `overdrive-v4-best-${selected.id}-${setupIndex}`;
const getBest = () => {
  try {
    const best = Number(localStorage.getItem(bestKey()) || 0);
    return Number.isFinite(best) && best > 0 ? best : 0;
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

function disposeRacerModel(model: THREE.Group) {
  model.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      geometries.add(obj.geometry);
      for (const material of Array.isArray(obj.material)
        ? obj.material
        : [obj.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
      if (obj instanceof THREE.InstancedMesh) obj.dispose();
    }
  });
  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
}
function makeRacerModel(paint: string, index: number) {
  const model = createProjector(paint, index + 1);
  if (ridersEnabled) attachRider(model, (riderIndex + index) % RIDERS.length);
  return model;
}
function rebuildRacerModels() {
  riderFeedback.clear();
  for (let i = 0; i < racers.length; i++) {
    const racer = racers[i];
    const model = makeRacerModel(i === 0 ? color : racer.color, i);
    model.position.copy(racer.mesh.position);
    model.quaternion.copy(racer.mesh.quaternion);
    disposeRacerModel(racer.mesh);
    racer.mesh = model;
    if (i === 0) racer.color = color;
    scene.add(model);
    itemView?.setVehicle(i, model);
  }
  syncModels(performance.now() / 1000);
}
function removeRacers() {
  for (const racer of racers) disposeRacerModel(racer.mesh);
  racers = [];
}
function loadTrack(track: Track) {
  selected = track;
  riderFeedback.clear();
  trails.clear();
  sparks.clear();
  mischief?.dispose();
  itemView?.dispose();
  if (world) world.dispose();
  removeRacers();
  world = buildWorld(scene, track);
  mischief = new SchoolMischief(scene, world, track);
  const length = world.curve.getLength();
  checkpoints = Array.from(
    { length: Math.max(20, Math.round(length / 5)) },
    (_, i) => world.curve.getPointAt(i / Math.max(20, Math.round(length / 5))),
  );
  gates = checkpoints.map((p, i) => {
    const h = world.curve.getTangentAt(i / checkpoints.length);
    return { x: p.x, z: p.z, dx: h.x, dz: h.z };
  });
  const colors = [color, ...RIVAL_PROFILES.map((p) => p.color)];
  const names = ["YOU", ...RIVAL_PROFILES.map((p) => p.name)];
  for (let i = 0; i < 4; i++) {
    const t = i === 0 ? 0 : 1 - i * 0.011;
    const p = world.curve.getPointAt(t);
    const tangent = world.curve.getTangentAt(t);
    const side = i % 2 === 0 ? -1 : 1;
    const x = p.x + tangent.z * side * 0.9,
      z = p.z - tangent.x * side * 0.9;
    const mesh = makeRacerModel(colors[i], i);
    scene.add(mesh);
    racers.push({
      state: createVehicle(x, z, Math.atan2(tangent.x, tangent.z)),
      mesh,
      name: names[i],
      color: colors[i],
      ...createRaceProgress(),
      previous: { x, z },
      recoveries: 0,
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
  itemView = new ItemView(
    scene,
    items,
    racers.map((r) => r.mesh),
  );
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
function saveCrew() {
  try {
    localStorage.setItem(
      "overdrive-crew-v1",
      JSON.stringify({ index: riderIndex, enabled: ridersEnabled }),
    );
  } catch {
    /* Selection still works when storage is unavailable. */
  }
}
function riderPortrait(index: number) {
  const c = RIDERS[index].colors;
  return `<svg viewBox="0 0 64 68" aria-hidden="true"><defs><linearGradient id="stick-${index}" x1="0" x2="1"><stop offset="0" stop-color="${c.top}"/><stop offset="1" stop-color="${c.accent}"/></linearGradient></defs><rect width="64" height="68" rx="5" fill="${c.top}" opacity=".1"/><ellipse cx="33" cy="64" rx="17" ry="3" fill="#11282c" opacity=".4"/><g fill="none" stroke="url(#stick-${index})" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M32 27v20m0-14L19 40m13-7l12 7M32 47L23 61m9-14l10 14"/></g><circle cx="32" cy="18" r="11" fill="url(#stick-${index})"/><circle cx="28" cy="17" r="1.4" fill="#21363b"/><circle cx="36" cy="17" r="1.4" fill="#21363b"/><path d="M28 22q4 3 8 0" fill="none" stroke="#21363b" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}
function renderRiders() {
  $("rider-cards").innerHTML = RIDERS.map(
    (r, i) =>
      `<button class="rider-card ${i === riderIndex && ridersEnabled ? "selected" : ""}" data-rider="${i}" aria-pressed="${i === riderIndex && ridersEnabled}" aria-label="Ride as ${r.name}" style="--crew:${r.colors.accent}">${riderPortrait(i)}<span><strong>${r.name}</strong><small>${r.tag}</small></span><b aria-hidden="true">${i === riderIndex && ridersEnabled ? "✓" : ""}</b></button>`,
  ).join("");
  $("ride-mode").setAttribute("aria-pressed", String(ridersEnabled));
  $("classic-mode").setAttribute("aria-pressed", String(!ridersEnabled));
  $("rider-bio").textContent = ridersEnabled
    ? RIDERS[riderIndex].description
    : "Just the projector. Four casters, one lamp, nobody taking responsibility.";
  $("crew-shortcut").textContent = ridersEnabled
    ? `${RIDERS[riderIndex].name.toUpperCase()} · CHANGE RIDER ↗`
    : "CLASSIC · MEET THE RIDERS ↗";
  $("hero-intro").innerHTML = ridersEnabled
    ? "One borrowed projector. One very bad idea.<br>Hang on. School’s out."
    : "The classroom legend. Now a track menace.<br>Take your overhead projector for the ride of its life.";
  document
    .querySelectorAll<HTMLButtonElement>("[data-rider]")
    .forEach((button) => {
      button.onclick = () => {
        riderIndex = Number(button.dataset.rider);
        ridersEnabled = true;
        changeCrew();
      };
    });
}
function changeCrew() {
  saveCrew();
  rebuildRacerModels();
  renderRiders();
  audio.click();
}
$("ride-mode").onclick = () => {
  ridersEnabled = true;
  changeCrew();
};
$("classic-mode").onclick = () => {
  ridersEnabled = false;
  changeCrew();
};
$("crew-shortcut").onclick = () => showTab("garage");
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
        rebuildRacerModels();
        updatePaint();
      }),
  );
}
function showTab(tab: string) {
  if (onlineKind) stopOnline();
  if (currentRoom && tab !== "online") void leaveRoom();
  hidden("online", tab !== "online");
  if (tab === "online") {
    onlineUI.element.scrollTop = 0;
    void refreshRecords();
  }
  mode = "menu";
  riderFeedback.clear();
  hidden("menu", tab !== "race");
  hidden("garage", tab !== "garage");
  hidden("school", tab !== "school");
  hidden("header", false);
  hidden("footer", tab === "online");
  hidden("hud", true);
  hidden("overlay", true);
  document
    .querySelectorAll("[data-tab]")
    .forEach((el) =>
      el.classList.toggle("active", (el as HTMLElement).dataset.tab === tab),
    );
  clearControls();
}
function startRace(tour = false) {
  if (onlineKind) stopOnline();
  if (currentRoom) void leaveRoom();
  hidden("online", true);
  loadTrack(selected);
  raceTime = 0;
  raceClosed = false;
  finishSignature = "";
  hitFlash = 0;
  lastEventText = "";
  driftReleases = 0;
  momentCount = 0;
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
  clearControls();
  camera.position
    .copy(racers[0].mesh.position)
    .add(new THREE.Vector3(-5, 5, -7));
  audio.start();
  audio.click();
}
function pause() {
  if (mode === "paused") {
    mode = previousMode;
    tilt.reset();
    hidden("overlay", true);
    audio.start();
    return;
  }
  if (!["race", "countdown", "tour"].includes(mode)) return;
  previousMode = mode;
  mode = "paused";
  clearControls();
  hidden("overlay", false);
  $("overlay-tag").textContent = "RECESS";
  $("overlay-title").textContent = "Take a breather.";
  $("overlay-copy").textContent =
    onlineKind === "room"
      ? "Your friends keep racing while you take a breather. Resume to catch up."
      : "Your projector is keeping the lamp warm.";
  $("results").innerHTML = "";
  hidden("resume", false);
  $("restart").textContent =
    onlineKind === "room"
      ? "LEAVE RACE"
      : "RESTART " + (previousMode === "tour" ? "FREE DRIVE" : "RACE");
}
function recover(racer: Racer) {
  if (racer.finished || racer.recoveryGrace > 0) return;
  const index =
    (racer.checkpoint - 1 + checkpoints.length) % checkpoints.length;
  const p = checkpoints[index],
    tangent = world.curve.getTangentAt(index / checkpoints.length);
  racer.state = createVehicle(p.x, p.z, Math.atan2(tangent.x, tangent.z));
  // The same two seconds stationary and empty boost tank apply to every racer.
  racer.state.boost = 0;
  racer.recoveryGrace = 2;
  racer.recoveries++;
  racer.stuck = 0;
  racer.previous = { x: racer.state.x, z: racer.state.z };
  if (items) {
    const e = items.equipment[racers.indexOf(racer)];
    e.state = racer.state;
    e.stun = 0;
    e.turbo = 0;
    e.immunity = 2;
  }
  if (racer === racers[0] && mode === "race") {
    recoverPenalty = 2.5;
    $("race-message").textContent = "RECOVERING · 2 SECOND STOP";
  }
}
function finish() {
  mode = "finish";
  riderFeedback.clear();
  audio.bell();
  const previous = getBest();
  const resultTime = racers[0].finishTime;
  const isBest = !previous || resultTime < previous;
  if (isBest) saveBest(resultTime);
  hidden("overlay", false);
  $("overlay-tag").textContent = isBest
    ? "NEW PERSONAL BEST"
    : "CLASS DISMISSED";
  $("overlay-title").textContent =
    getPosition() === 1 ? "Top of the class." : "Gloriously unqualified.";
  $("overlay-copy").textContent =
    `${selected.name} · ${setups[setupIndex].name} · ${ridersEnabled ? RIDERS[riderIndex].name : "Classic"} · 3 laps · ${items.equipment[0].hits} laser hits`;
  renderFinishResults();
  hidden("resume", true);
  $("restart").textContent = "ONE MORE RACE";
}
function renderFinishResults() {
  const signature = [
    raceClosed,
    ...racers.map((r) => `${r.laps}:${r.finished}`),
  ].join("|");
  if (signature === finishSignature) return;
  finishSignature = signature;
  const resultTime = racers[0].finishTime;
  const isBest = $("overlay-tag").textContent === "NEW PERSONAL BEST";
  const podium = racers
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.finished)
    .sort((a, b) => a.r.finishTime - b.r.finishTime)
    .slice(0, 3);
  $("results").innerHTML =
    `<div class="book-podium" aria-label="Race podium">${[1, 0, 2]
      .map((index) => {
        if (!podium[index]) return "";
        const { r, i } = podium[index];
        return `<div class="podium-place place-${index + 1}" style="--racer:${r.color}"><div class="podium-machine" aria-hidden="true"><i></i><b></b>${ridersEnabled ? `<em class="podium-rider" style="--shirt:${RIDERS[(riderIndex + i) % RIDERS.length].colors.top};--skin:${RIDERS[(riderIndex + i) % RIDERS.length].colors.skin}"><span></span></em>` : ""}</div><span>${i === 0 ? "YOU" : r.name}</span><div class="book-stack"><strong>${index + 1}</strong><small>${["ADVANCED CHAOS", "APPLIED WOBBLE", "LOOSE SCREWS"][index]}</small></div></div>`;
      })
      .join(
        "",
      )}</div><div class="result-awards"><span><b>${driftReleases}</b> CASTER KICKS</span><span><b>${items.equipment[0].hits}</b> LASER TAGS</span><span><b>${momentCount}</b> MISCHIEF MOMENTS</span></div><div class="result-time">${format(resultTime)}</div><p>FINISHED ${ordinal(getPosition())} / 4${isBest ? " · YOUR FASTEST RUN YET" : ""}</p>`;
  const classification = document.createElement("div");
  classification.className = "race-classification";
  classification.setAttribute("aria-label", "Verified race results");
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
    .forEach((r) => {
      const row = document.createElement("p");
      row.textContent = `${r.name} · ${r.finished ? `${format(r.finishTime)} · 3/3 LAPS` : raceClosed ? `DID NOT FINISH · ${r.laps}/3 LAPS COMPLETED` : `STILL RACING · ${lapStatus(r.laps, false)}`}`;
      classification.append(row);
    });
  $("results").append(classification);
  const waiting = document.createElement("p");
  waiting.className = "finish-waiting";
  waiting.textContent = raceClosed
    ? "CLASSIFICATION COMPLETE"
    : "YOUR TIME IS LOCKED · RIVALS ARE FINISHING THEIR LAPS";
  $("results").prepend(waiting);
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
function updateProgress(r: Racer, dt: number) {
  if (r.finished || r.recoveryGrace > 0) return;
  const crossingTime = advanceRaceProgress(
    r,
    r.previous,
    r.state,
    gates,
    selected.width * 0.63,
    raceTime,
    dt,
  );
  if (crossingTime === null) return;
  if (r.laps >= 3) {
    r.finished = true;
    r.finishTime = crossingTime;
    r.state.vx = r.state.vz = r.state.speed = 0;
  }
  if (r === racers[0]) {
    audio.bell();
    if (!r.finished) {
      $("race-message").textContent =
        r.laps === 2
          ? "FINAL LAP · MAKE IT COUNT"
          : "LAP 2 · CLASS IS IN SESSION";
      recoverPenalty = 2.4;
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
  if (onlineKind) {
    stepOnline(dt);
    return;
  }
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
  if (mode !== "race" && mode !== "tour" && mode !== "finish") return;
  if (mode === "finish" && raceClosed) return;
  raceTime += dt;
  racers.forEach((r) => {
    r.previous.x = r.state.x;
    r.previous.z = r.state.z;
    r.recoveryGrace = Math.max(0, r.recoveryGrace - dt);
  });
  const input: Input = {
    throttle:
      isDown("KeyW") || isDown("ArrowUp")
        ? 1
        : isDown("KeyS") || isDown("ArrowDown")
          ? -1
          : 0,
    steer: steeringInput(),
    brake: isDown("Space"),
    boost: isDown("ShiftLeft") || isDown("ShiftRight"),
  };
  const player = racers[0];
  if (items.equipment[0].stun > 0) {
    input.throttle *= 0.25;
    input.steer *= 0.6;
    input.boost = false;
    player.state.driftCharge = player.state.driftTurbo = 0;
  }
  const beforeCharge = player.state.driftCharge;
  const beforeTurbo = player.state.driftTurbo;
  if (!player.finished && player.recoveryGrace === 0)
    stepVehicle(player.state, input, dt, setups[setupIndex]);
  collide(player);
  if (mode === "race" || mode === "finish") {
    for (let i = 1; i < racers.length; i++) {
      const r = racers[i];
      if (r.finished || r.recoveryGrace > 0) continue;
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
        r.state.driftCharge = r.state.driftTurbo = 0;
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
        recover(r);
        r.stuck = 0;
      }
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
            a.driftCharge = a.driftTurbo = b.driftCharge = b.driftTurbo = 0;
            a.vx -= vel * nx * 0.6;
            a.vz -= vel * nz * 0.6;
            b.vx += vel * nx * 0.6;
            b.vz += vel * nz * 0.6;
          }
        }
      }
    // Judge everyone after movement and contacts, then classify the finish together.
    racers.forEach((r) => updateProgress(r, dt));
    if (player.finished && mode === "race") finish();
    if (mode === "finish") {
      // Keep simulating real driving after the player's finish; a time limit bounds a stuck rival.
      raceClosed =
        racers.every((r) => r.finished) ||
        raceTime >= Math.max(180, player.finishTime + 60);
    }
  }
  items.equipment.forEach((equipment, i) => {
    equipment.active =
      !racers[i].finished &&
      racers[i].recoveryGrace === 0 &&
      (mode !== "tour" || i === 0);
  });
  const activeMischief = racers.filter(
    (r, i) =>
      !r.finished && r.recoveryGrace === 0 && (mode !== "tour" || i === 0),
  );
  for (const event of mischief.update(
    dt,
    activeMischief.map((r) => r.state),
    true,
  )) {
    if (activeMischief[event.racerIndex] === player) {
      momentCount++;
      audio.mischief();
      if (recoverPenalty <= 0) announce(event.title, 1.4);
    }
  }
  items.step(dt);
  if (isDown("KeyE") || isDown("KeyQ")) items.use(0);
  for (const event of items.drainEvents()) {
    itemView.event(event);
    const isPlayer = event.owner === 0;
    if (event.type === "pickup" && isPlayer) {
      audio.pickup();
      announce(
        `${ITEM_INFO[event.kind!].name} · ${touchDevice ? "TAP SUPPLY TO USE" : "E TO USE"}`,
        2.1,
      );
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
  if (
    beforeCharge < DRIFT_READY_CHARGE &&
    player.state.driftCharge >= DRIFT_READY_CHARGE
  )
    audio.driftReady();
  if (beforeTurbo <= 0 && player.state.driftTurbo > 0) {
    driftReleases++;
    audio.driftRelease();
    announce("CASTER KICK!", 1.1);
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
function syncModels(time: number, dt = 0) {
  for (let i = 0; i < racers.length; i++) {
    const r = racers[i],
      s = r.state;
    r.mesh.visible =
      mode === "menu"
        ? i === 0
        : onlineKind === "trial"
          ? i === 0
          : mode === "tour"
            ? i === 0
            : i === 0 || !r.finished;
    if (onlineKind === "room" && dt > 0 && mode !== "menu") {
      r.mesh.position.lerp(
        new THREE.Vector3(s.x, 0.055, s.z),
        1 - Math.exp(-22 * dt),
      );
    } else r.mesh.position.set(s.x, 0.055, s.z);
    r.mesh.rotation.set(0, s.yaw, 0);
    const animation = {
      idle: mode === "menu",
      stun: items?.equipment[i].stun ?? 0,
      turbo:
        s.driftTurbo > 0 ||
        items?.equipment[i].turbo > 0 ||
        (i === 0 && isDown("ShiftLeft") && s.heat < 0.98 && s.boost > 0.02),
      celebrating: mode === "finish" && i === 0,
    };
    animateProjector(r.mesh, s, dt, time, animation);
    if (ridersEnabled) animateRider(r.mesh, s, dt, time, animation);
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
      s.x + Math.sin(angle) * 7.6,
      3.5,
      s.z + Math.cos(angle) * 7.6,
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
        s.x - Math.sin(s.yaw) * (9.0 + Math.abs(s.speed) * 0.065),
        5.2 + Math.abs(s.speed) * 0.022,
        s.z - Math.cos(s.yaw) * (9.0 + Math.abs(s.speed) * 0.065),
      );
      lookAt.set(
        s.x + Math.sin(s.yaw) * 4.7 + s.vx * 0.07,
        1.05,
        s.z + Math.cos(s.yaw) * 4.7 + s.vz * 0.07,
      );
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
        (items.equipment[0].turbo > 0 || s.driftTurbo > 0 ? 3 : 0);
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
    if ((mode === "tour" || onlineKind === "trial") && i > 0) continue;
    const r = racers[i];
    if (i > 0 && r.finished) continue;
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
  if (!onlineKind && mode === "finish") renderFinishResults();
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
  if (!onlineKind)
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
                `<div class="standing ${i === 0 ? "you" : ""}"><b>${place + 1}</b><i style="background:${r.color}"></i><span>${r.name}<small>${r.recoveryGrace > 0 ? "RECOVERING · 2 SEC" : lapStatus(r.laps, r.finished)}</small></span>${items.equipment[i].shield > 0 ? "◇" : items.equipment[i].item === "laser" ? "↗" : ""}</div>`,
            )
            .join("");
  if (onlineKind) renderOnlineStandings();
  $("speed").textContent = String(Math.round(Math.abs(s.speed) * 3.6));
  $("boost-bar").style.width = `${s.boost * 100}%`;
  $("boost-value").textContent = `${Math.round(s.boost * 100)}%`;
  $("drift-label").textContent =
    s.driftTurbo > 0
      ? "CASTER KICK!"
      : s.driftCharge >= DRIFT_READY_CHARGE
        ? touchDevice
          ? "RELEASE DRIFT → KICK!"
          : "RELEASE SPACE → KICK!"
        : s.driftCharge > 0
          ? "CHARGING CASTERS"
          : s.heat > 0.88
            ? "LAMP COOLING"
            : s.drifting
              ? "CASTER CHAOS"
              : (isDown("ShiftLeft") || isDown("ShiftRight")) && s.boost > 0.02
                ? "LAMP OVERDRIVE"
                : "READY TO ROLL";
  $("drift-label").classList.toggle(
    "hot",
    s.driftCharge >= DRIFT_READY_CHARGE || s.driftTurbo > 0,
  );
  $("drift-charge").style.width = `${s.driftCharge * 100}%`;
  $("drift-charge").classList.toggle(
    "ready",
    s.driftCharge >= DRIFT_READY_CHARGE,
  );
  $("next-turn").textContent =
    s.driftCharge >= DRIFT_READY_CHARGE
      ? "RELEASE DRIFT FOR A SPEED KICK"
      : raceTime < 8
        ? touchDevice
          ? "DRIFT + STEER · CHARGE A KICK"
          : "SPACE + STEER · CHARGE A DRIFT KICK"
        : "GOLD CHEVRONS · A CHEEKY SPEED KICK";
  if (onlineKind === "trial")
    $("next-turn").textContent = "BOOST & CASTER KICKS · RECOVER +2 SEC";
  $("timer").textContent = format(
    racers[0].finished ? racers[0].finishTime : raceTime,
  );
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
  if (onlineKind) {
    pendingUse = true;
    return;
  }
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
function setTiltEnabled(enabled: boolean, message: string) {
  clearTimeout(tiltTimeout);
  tiltEnabled = enabled;
  tilt.reset();
  $("touch-tilt").textContent = enabled ? "TILT ON" : "TILT OFF";
  $("touch-tilt").setAttribute("aria-pressed", String(enabled));
  $("tilt-status").textContent = message;
}
$("touch-tilt").onclick = async () => {
  if (tiltEnabled) {
    setTiltEnabled(false, "Touch steering ready.");
    return;
  }
  if (!window.isSecureContext) {
    setTiltEnabled(false, "Tilt needs HTTPS. Touch controls still work.");
    return;
  }
  if (typeof DeviceOrientationEvent === "undefined") {
    setTiltEnabled(false, "Motion sensing unavailable. Use the touch arrows.");
    return;
  }
  const button = $<HTMLButtonElement>("touch-tilt");
  button.disabled = true;
  try {
    const sensor = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<string>;
    };
    if (
      sensor.requestPermission &&
      (await sensor.requestPermission()) !== "granted"
    ) {
      setTiltEnabled(
        false,
        "Motion access declined. Touch controls still work.",
      );
      return;
    }
    setTiltEnabled(
      true,
      "Hold your phone comfortably. Tilt left or right to steer.",
    );
    tiltTimeout = setTimeout(() => {
      setTiltEnabled(
        false,
        "No motion data. Use touch steering or try TILT again.",
      );
    }, 5000);
  } catch {
    setTiltEnabled(
      false,
      "Motion access unavailable. Touch controls still work.",
    );
  } finally {
    button.disabled = false;
  }
};
window.addEventListener("deviceorientation", (event) => {
  if (!tiltEnabled || document.hidden) return;
  // iOS exposes the viewport rotation through window.orientation, including in Safari's mobile viewport.
  const angle =
    (window as Window & { orientation?: number }).orientation ??
    screen.orientation?.angle ??
    0;
  if (
    event.beta !== null &&
    event.gamma !== null &&
    Number.isFinite(event.beta) &&
    Number.isFinite(event.gamma)
  )
    clearTimeout(tiltTimeout);
  // A permission prompt can pause the game; wait for resume to calibrate the grip.
  if (!["race", "tour", "countdown"].includes(mode)) return;
  if (tilt.sample(event.beta, event.gamma, angle, performance.now())) {
    clearTimeout(tiltTimeout);
    $("tilt-status").textContent = "Tilt to steer · toggle off/on to recenter";
  }
});
$("touch-recover").onclick = recoverPlayer;
$("touch-camera").onclick = () => {
  cameraMode = (cameraMode + 1) % 2;
};
$("resume").onclick = pause;
$("restart").onclick = () => {
  if (onlineKind === "trial") {
    void launchTrial(activeGhost || undefined);
    return;
  }
  if (onlineKind === "room") {
    void returnToClub();
    return;
  }
  startRace(previousMode === "tour" && mode === "paused");
};
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
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement ||
    e.target instanceof HTMLTextAreaElement
  )
    return;
  if (e.repeat) return;
  if (onlineKind === "room" && ["KeyE", "KeyQ"].includes(e.code))
    pendingUse = true;
  if (e.code === "KeyR") recoverPlayer();
  if (e.code === "Escape") pause();
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
  clearControls();
  if (["race", "tour", "countdown"].includes(mode)) pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearControls();
    if (["race", "tour", "countdown"].includes(mode)) pause();
  }
});
document.querySelectorAll<HTMLButtonElement>("[data-key]").forEach((b) => {
  b.oncontextmenu = (e) => e.preventDefault();
  b.onpointerdown = (e) => {
    if (!["race", "tour", "countdown"].includes(mode)) return;
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    touchPointers.set(e.pointerId, b);
    b.classList.add("held");
    audio.start();
  };
  const release = (e: PointerEvent) => {
    touchPointers.delete(e.pointerId);
    b.classList.toggle("held", [...touchPointers.values()].includes(b));
  };
  b.onpointerup = b.onpointercancel = b.onlostpointercapture = release;
});
function resizeViewport() {
  const { width, height } = $("viewport").getBoundingClientRect();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
new ResizeObserver(() => requestAnimationFrame(resizeViewport)).observe(
  $("viewport"),
);
window.addEventListener("resize", resizeViewport);
window.addEventListener("orientationchange", () => {
  clearControls();
  if (["race", "tour", "countdown"].includes(mode)) pause();
});
// Online racing shares the deterministic simulation used to check submitted runs.
let onlineKind: "trial" | "room" | null = null;
let onlineRace: OnlineRace | null = null;
let currentRoom: Room | null = null;
let trialChallenge = "";
let trialInputs: [number, number][] = [];
let activeGhost: Ghost | null = null;
let ghostMesh: THREE.Group | null = null;
let networkTimer: ReturnType<typeof setTimeout> | undefined;
let networkGeneration = 0;
let syncSequence = 0;
let networkFailures = 0;
let serverOffset = 0;
let lastServerTick = 0;
let lastOnlineEvent = -1;
let onlineFinishing = false;
let pendingUse = false;
let pendingRecover = false;
let recordsGeneration = 0;

function steeringInput() {
  const left = isDown("KeyA") || isDown("ArrowLeft");
  const right = isDown("KeyD") || isDown("ArrowRight");
  return left || right
    ? Number(right) - Number(left)
    : tiltEnabled
      ? tilt.steer(performance.now())
      : 0;
}
function onlineMask() {
  if (document.hidden || mode === "paused" || mode === "finish") return 0;
  const steer = steeringInput();
  return (
    (isDown("KeyW") || isDown("ArrowUp") ? 1 : 0) |
    (isDown("KeyS") || isDown("ArrowDown") ? 2 : 0) |
    (steer < -0.15 ? 4 : 0) |
    (steer > 0.15 ? 8 : 0) |
    (isDown("Space") ? 16 : 0) |
    (isDown("ShiftLeft") || isDown("ShiftRight") ? 32 : 0) |
    (isDown("KeyE") || isDown("KeyQ") || pendingUse ? 64 : 0) |
    (isDown("KeyR") || pendingRecover ? 128 : 0)
  );
}
async function ensureOnlineSession() {
  const name =
    onlineUI.input("online-name").value.trim().slice(0, 20) || "The Doodler";
  if (!onlineClient.player || onlineClient.player.name !== name)
    await onlineClient.session(name);
  try {
    localStorage.setItem("overdrive-club-name", name);
  } catch {}
  return onlineClient.player!;
}
async function onlineAction(action: () => Promise<void>) {
  onlineUI.setBusy(true);
  onlineUI.status("Checking in at the school office…");
  try {
    await action();
  } catch (error) {
    onlineUI.status(
      error instanceof Error
        ? error.message
        : "The school office is unavailable.",
      true,
    );
  } finally {
    onlineUI.setBusy(false);
  }
}
async function refreshRecords() {
  const generation = ++recordsGeneration;
  const track = onlineUI.input("online-track").value || selected.id;
  const setup = Number(onlineUI.input("online-setup").value || 0);
  onlineUI.status("Fetching the noticeboard…");
  try {
    const result = await onlineClient.records(
      track,
      setup,
      onlineUI.input("online-period").value,
    );
    if (generation !== recordsGeneration) return;
    onlineUI.records(
      result.records,
      (id) =>
        void onlineAction(async () => {
          const { ghost } = await onlineClient.ghost(id);
          await launchTrial(ghost);
        }),
    );
    onlineUI.status("School records · verified runs · three laps");
  } catch (error) {
    if (generation === recordsGeneration)
      onlineUI.status(
        error instanceof Error ? error.message : "Records unavailable.",
        true,
      );
  }
}
function clubOptions() {
  return {
    track: onlineUI.input("online-track").value,
    setup: Number(onlineUI.input("online-setup").value),
    rider: riderIndex,
    color,
  };
}
function initOnline() {
  for (const track of tracks) {
    const option = document.createElement("option");
    option.value = track.id;
    option.textContent = track.name;
    onlineUI.el("online-track").append(option);
  }
  setups.forEach((setup, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = setup.name;
    onlineUI.el("online-setup").append(option);
  });
  for (const id of ["online-track", "online-setup", "online-period"])
    onlineUI.el(id).onchange = () => {
      if (id !== "online-period") {
        activeGhost = null;
        onlineUI.el("online-ghost-note").textContent = "";
        onlineUI.el("online-trial").textContent = "SET A SCHOOL RECORD ↗";
        onlineUI.el("online-trial").onclick = () =>
          void onlineAction(() => launchTrial());
      }
      void refreshRecords();
    };
  onlineUI.el("online-refresh").onclick = () => void refreshRecords();
  onlineUI.el("online-trial").onclick = () =>
    void onlineAction(() => launchTrial());
  onlineUI.el("online-back").onclick = () => {
    void leaveRoom();
    showTab("race");
  };
  onlineUI.el("online-create").onclick = () =>
    void onlineAction(async () => {
      await ensureOnlineSession();
      const { room } = await onlineClient.room("create", clubOptions());
      if (room) enterRoom(room);
    });
  onlineUI.el("online-join").onclick = () =>
    void onlineAction(async () => {
      await ensureOnlineSession();
      let code = onlineUI.input("online-code").value.trim();
      if (code.includes("#"))
        code = new URLSearchParams(code.split("#")[1]).get("room") || "";
      const { room } = await onlineClient.room("join", {
        code,
        rider: riderIndex,
        color,
      });
      if (room) enterRoom(room);
    });
  onlineUI.el("online-room-start").onclick = () =>
    void onlineAction(async () => {
      if (!currentRoom) return;
      const { room } = await onlineClient.room("start", {
        code: currentRoom.code,
      });
      if (room) receiveRoom(room);
    });
  onlineUI.el("online-copy").onclick = () =>
    void onlineAction(async () => {
      if (!currentRoom) return;
      await copyInvite("room", currentRoom.code);
      onlineUI.status("Invitation copied. Send it to your accomplices.");
    });
  onlineUI.el("online-leave").onclick = () =>
    void onlineAction(async () => {
      await leaveRoom();
      onlineUI.status("You left the club.");
    });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentRoom && !networkTimer) scheduleRoomSync(0);
  });
  const readInvitation = () => {
    const invite = new URLSearchParams(location.hash.slice(1));
    if (invite.has("room")) {
      showTab("online");
      onlineUI.input("online-code").value = invite.get("room")!.slice(0, 64);
      onlineUI.status("You’ve been invited. Choose a name and join the club.");
    } else if (invite.has("ghost")) {
      showTab("online");
      void onlineAction(async () => {
        const { ghost } = await onlineClient.ghost(
          invite.get("ghost")!.slice(0, 80),
        );
        onlineUI.input("online-track").value = ghost.track;
        onlineUI.input("online-setup").value = String(ghost.setup);
        activeGhost = ghost;
        onlineUI.el("online-ghost-note").textContent =
          `Challenge from ${ghost.name} · ${format(ghost.time)}. Race their ghost when you’re ready.`;
        onlineUI.el("online-trial").textContent = "RACE THIS GHOST ↗";
        onlineUI.el("online-trial").onclick = () =>
          void onlineAction(() => launchTrial(ghost));
        onlineUI.status("Ghost challenge loaded.");
      });
    }
  };
  setTimeout(readInvitation, 0);
  window.addEventListener("hashchange", readInvitation);
}
async function copyInvite(kind: "room" | "ghost", id: string) {
  const url = new URL(location.href);
  url.hash = `${kind}=${encodeURIComponent(id)}`;
  await navigator.clipboard.writeText(url.href);
}
function clearGhost() {
  if (ghostMesh) {
    disposeRacerModel(ghostMesh);
    ghostMesh = null;
  }
}
function stopOnline() {
  onlineKind = null;
  onlineRace = null;
  onlineFinishing = false;
  trialInputs = [];
  trialChallenge = "";
  lastOnlineEvent = -1;
  pendingUse = false;
  pendingRecover = false;
  clearGhost();
  $("online-share")?.remove();
  if (currentRoom) void leaveRoom();
}
async function launchTrial(ghost?: Ghost) {
  const player = await ensureOnlineSession();
  const track = ghost?.track || onlineUI.input("online-track").value;
  const setup = ghost?.setup ?? Number(onlineUI.input("online-setup").value);
  if (ghost && ghost.version !== ONLINE_VERSION)
    throw new Error(
      "This ghost used older racing rules. Set a fresh school record instead.",
    );
  const challenge = await onlineClient.trial(track, setup);
  if (challenge.version !== ONLINE_VERSION)
    throw new Error(
      "The school has new racing rules. Reload the game to compete.",
    );
  selected = tracks.find((t) => t.id === track)!;
  setupIndex = setup;
  startRace();
  onlineKind = "trial";
  onlineFinishing = false;
  trialChallenge = challenge.challenge;
  trialInputs = [];
  activeGhost = ghost || null;
  onlineRace = createOnlineRace(
    track,
    setup,
    [{ ...player, rider: riderIndex, color }],
    true,
  );
  installOnlineEquipment();
  applyOnlineRace();
  if (ghost) {
    ghostMesh = createProjector("#85cfc7", 5);
    ghostMesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = false;
        for (const m of Array.isArray(obj.material)
          ? obj.material
          : [obj.material]) {
          m.transparent = true;
          m.opacity = 0.28;
          m.depthWrite = false;
        }
      }
    });
    scene.add(ghostMesh);
  }
  $("race-title").textContent = `SCHOOL RECORDS / ${selected.name}`;
  $("best").textContent = ghost
    ? `${ghost.name.toUpperCase()} · ${format(ghost.time)}`
    : "VERIFIED TIME TRIAL · NO ITEMS";
  document.querySelector(".position")!.classList.add("hidden");
}
function installOnlineEquipment() {
  itemView.dispose();
  const pickups =
    onlineKind === "trial"
      ? []
      : items.pickups.map(({ x, z, kind }) => ({ x, z, kind }));
  items = new ItemSystem(
    racers.map((r) => r.state),
    pickups,
    [],
    world.colliders,
  );
  itemView = new ItemView(
    scene,
    items,
    racers.map((r) => r.mesh),
  );
}
function orderedOnlinePlayers() {
  if (!onlineRace) return [];
  const id = onlineClient.player?.id;
  return [...onlineRace.players].sort(
    (a, b) => Number(b.id === id) - Number(a.id === id),
  );
}
function applyOnlineRace() {
  if (!onlineRace) return;
  const players = orderedOnlinePlayers();
  players.forEach((p, i) => {
    const r = racers[i];
    Object.assign(r.state, p.state);
    r.checkpoint = p.checkpoint;
    r.laps = p.laps;
    r.finished = p.finished;
    r.finishTime = (p.finishTicks ?? Infinity) / 120;
    r.recoveries = p.recoveries;
    r.name = p.name;
    r.color = p.color;
    Object.assign(items.equipment[i], p.equipment, { state: r.state });
  });
  items.pickups.forEach(
    (p, i) => (p.cooldown = onlineRace!.pickupCooldowns[i] || 0),
  );
  for (const event of onlineRace.events) {
    if (event.tick <= lastOnlineEvent) continue;
    const ownerId = onlineRace.players[event.owner]?.id;
    const victimId =
      event.victim === undefined
        ? undefined
        : onlineRace.players[event.victim]?.id;
    const owner = players.findIndex((p) => p.id === ownerId);
    const victim =
      victimId === undefined
        ? undefined
        : players.findIndex((p) => p.id === victimId);
    itemView.event({ ...event, owner, victim });
    if (owner === 0 && event.type === "laser") audio.laser();
    if (owner === 0 && event.type === "pickup") audio.pickup();
    if (victim === 0 && event.type === "hit") audio.hit();
  }
  lastOnlineEvent = Math.max(
    lastOnlineEvent,
    ...onlineRace.events.map((e) => e.tick),
  );
  raceTime = (onlineRace.tick + (players[0]?.penaltyTicks || 0)) / 120;
}
function stepOnline(dt: number) {
  if (!onlineRace) return;
  if (
    onlineKind === "room" &&
    mode === "paused" &&
    currentRoom?.status === "countdown" &&
    Date.now() + serverOffset < currentRoom.startAt
  )
    return;
  if (mode === "countdown") {
    if (onlineKind === "room") {
      countdownTime =
        (currentRoom!.startAt - (Date.now() + serverOffset)) / 1000;
    } else countdownTime -= dt;
    $("countdown").textContent =
      countdownTime > 0 ? String(Math.min(3, Math.ceil(countdownTime))) : "GO!";
    if (countdownTime <= 0) {
      mode = "race";
      $("countdown").textContent = "";
    }
    return;
  }
  if (onlineKind === "trial" && mode !== "race") return;
  if (onlineKind === "room" && mode === "finish") return;
  if (onlineKind === "room" && onlineRace.tick - lastServerTick > 90) return;
  const mask = onlineMask();
  if (onlineKind === "trial") {
    const previous = trialInputs.at(-1);
    if (previous && previous[0] === mask) previous[1]++;
    else trialInputs.push([mask, 1]);
  }
  const inputs = onlineRace.players.map((p) =>
    p.id === onlineClient.player?.id ? mask : p.previousInput,
  );
  advanceOnlineRace(onlineRace, inputs, 1);
  if (onlineKind === "trial") pendingUse = false;
  applyOnlineRace();
  const player = orderedOnlinePlayers()[0];
  audio.update(
    racers[0].state,
    {
      throttle: mask & 1 ? 1 : mask & 2 ? -1 : 0,
      steer: (mask & 8 ? 1 : 0) - (mask & 4 ? 1 : 0),
      brake: !!(mask & 16),
      boost: !!(mask & 32),
    },
    dt,
  );
  if (
    onlineKind === "trial" &&
    (player.finished || onlineRace.done) &&
    !onlineFinishing
  )
    void finishOnline(player.finished);
}
function updateGhost() {
  if (!ghostMesh || !activeGhost || onlineKind !== "trial") return;
  const frames = activeGhost.frames;
  const time = (onlineRace?.tick || 0) / 120;
  let hi = frames.findIndex((f) => f[0] >= time);
  if (hi < 0) hi = frames.length - 1;
  const a = frames[Math.max(0, hi - 1)],
    b = frames[hi];
  if (!a || !b) return;
  const t = Math.max(
    0,
    Math.min(1, (time - a[0]) / Math.max(0.001, b[0] - a[0])),
  );
  ghostMesh.position.set(
    THREE.MathUtils.lerp(a[1], b[1], t),
    0.055,
    THREE.MathUtils.lerp(a[2], b[2], t),
  );
  ghostMesh.rotation.y =
    a[3] + Math.atan2(Math.sin(b[3] - a[3]), Math.cos(b[3] - a[3])) * t;
  ghostMesh.visible = mode !== "menu" && time <= activeGhost.time + 2;
}
function renderOnlineStandings() {
  const list = $("standings");
  list.replaceChildren();
  if (onlineKind === "trial") {
    const label = document.createElement("div");
    label.className = "standing you";
    label.textContent = activeGhost
      ? `GHOST · ${activeGhost.name} · ${format(activeGhost.time)}`
      : "SOLO · SERVER-VERIFIED TIME TRIAL";
    list.append(label);
    $("item-name").textContent = "TIME TRIAL";
    $("item-hint").textContent = "Pure racing · boost and caster kicks";
    return;
  }
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
    .forEach((r, i) => {
      const row = document.createElement("div");
      row.className = `standing ${r === racers[0] ? "you" : ""}`;
      const rank = document.createElement("b");
      rank.textContent = String(i + 1);
      const dot = document.createElement("i");
      dot.style.background = r.color;
      const name = document.createElement("span");
      name.textContent = r.name;
      const status = document.createElement("small");
      status.textContent = lapStatus(r.laps, r.finished);
      name.append(status);
      row.append(rank, dot, name);
      list.append(row);
    });
}
async function finishOnline(completed = true) {
  if (onlineFinishing) return;
  onlineFinishing = true;
  mode = "finish";
  clearControls();
  audio.bell();
  hidden("overlay", false);
  hidden("resume", true);
  $("overlay-tag").textContent =
    onlineKind === "trial" ? "SCHOOL RECORDS" : "AFTER-SCHOOL CLUB";
  $("overlay-title").textContent = completed
    ? "Class dismissed."
    : "The bell has rung.";
  $("overlay-copy").textContent =
    onlineKind === "trial" && completed
      ? "Checking your run at the school office…"
      : completed
        ? "A little chaos between friends. Shall we do it again?"
        : "Three-minute session ended. Try a fresh run.";
  $("results").replaceChildren();
  const time = document.createElement("div");
  time.className = "result-time";
  time.textContent = completed
    ? format(racers[0].finishTime)
    : format(raceTime);
  $("results").append(time);
  $("restart").textContent =
    onlineKind === "trial" ? "ANOTHER TIME TRIAL" : "BACK TO THE CLUB";
  if (onlineKind === "trial" && completed) {
    const challenge = trialChallenge,
      inputs = trialInputs.map((r) => [...r] as [number, number]);
    async function saveRun() {
      if (onlineKind !== "trial" || trialChallenge !== challenge) return;
      $("online-retry")?.remove();
      $("overlay-copy").textContent = "Checking your run at the school office…";
      try {
        const result = await onlineClient.submit(challenge, inputs);
        if (onlineKind !== "trial" || trialChallenge !== challenge) return;
        $("overlay-title").textContent = result.rank
          ? `Your record: No. ${result.rank}.`
          : "A verified finish.";
        const newBest = result.ghostId === result.record.id;
        $("overlay-copy").textContent = newBest
          ? "Verified and saved. Send your ghost to a friend and dare them to beat it."
          : result.ghostId
            ? "Run verified. Your faster personal best remains on the noticeboard. Share that ghost to challenge a friend."
            : "Run verified. Keep practicing for a place in the top 50.";
        time.textContent = format(result.record.time);
        if (result.ghostId) {
          const ghostId = result.ghostId;
          const share = document.createElement("button");
          share.id = "online-share";
          share.className = "secondary";
          share.textContent = "SHARE GHOST CHALLENGE ↗";
          share.onclick = () => {
            void copyInvite("ghost", ghostId)
              .then(() => (share.textContent = "CHALLENGE LINK COPIED ✓"))
              .catch(
                () => (share.textContent = "Clipboard unavailable — try again"),
              );
          };
          $("results").append(share);
        }
      } catch (error) {
        if (onlineKind !== "trial" || trialChallenge !== challenge) return;
        $("overlay-copy").textContent =
          `Save not confirmed: ${error instanceof Error ? error.message : "Please try again."}`;
        const retry = document.createElement("button");
        retry.id = "online-retry";
        retry.className = "secondary";
        retry.textContent = "RETRY SAVE ↻";
        retry.onclick = () => {
          retry.disabled = true;
          retry.textContent = "CHECKING…";
          void saveRun();
        };
        $("results").append(retry);
      }
    }
    await saveRun();
  } else if (onlineKind === "room") {
    [...racers]
      .sort((a, b) => a.finishTime - b.finishTime)
      .forEach((r, i) => {
        const line = document.createElement("p");
        line.textContent = `${r.finished ? `${i + 1}.` : "DNF"} ${r.name} · ${r.finished ? `${format(r.finishTime)} · 3/3 LAPS` : `${r.laps}/3 LAPS COMPLETED`}`;
        $("results").append(line);
      });
  }
}
function enterRoom(room: Room) {
  currentRoom = room;
  syncSequence = 0;
  receiveRoom(room);
  scheduleRoomSync(1000);
  onlineUI.status("Your club is open. Copy the invitation to bring friends.");
}
function receiveRoom(room: Room) {
  if (currentRoom && room.code !== currentRoom.code) return;
  currentRoom = room;
  serverOffset = room.serverNow - Date.now();
  onlineUI.room(room, onlineClient.player?.id);
  if (room.status === "lobby") return;
  if (!room.race) return;
  if (room.race.version !== ONLINE_VERSION) {
    onlineUI.status("New racing rules are available. Reload to join.", true);
    return;
  }
  if (onlineKind !== "room") {
    const savedRoom = room;
    currentRoom = null;
    selected = tracks.find((t) => t.id === room.track)!;
    setupIndex = room.setup;
    startRace();
    currentRoom = savedRoom;
    onlineKind = "room";
    onlineFinishing = false;
    onlineRace = structuredClone(room.race);
    const players = orderedOnlinePlayers();
    players.forEach((p, i) => {
      disposeRacerModel(racers[i].mesh);
      const model = createProjector(p.color, i + 1);
      if (ridersEnabled) attachRider(model, p.rider);
      racers[i].mesh = model;
      scene.add(model);
    });
    installOnlineEquipment();
    $("race-title").textContent = `AFTER-SCHOOL CLUB / ${selected.name}`;
    $("best").textContent = "PRIVATE RACE · FRIENDS & SCHOOL BOTS";
  }
  onlineRace = structuredClone(room.race);
  lastServerTick = onlineRace.tick;
  applyOnlineRace();
  if (room.status === "countdown") {
    if (mode !== "paused") mode = "countdown";
    countdownTime = Math.max(0, (room.startAt - room.serverNow) / 1000);
  } else if (mode === "countdown") mode = "race";
  if (room.status === "finished" && !onlineFinishing)
    void finishOnline(orderedOnlinePlayers()[0].finished);
}
function scheduleRoomSync(delay: number) {
  if (networkTimer) clearTimeout(networkTimer);
  networkTimer = undefined;
  if (!currentRoom || currentRoom.status === "finished" || document.hidden)
    return;
  const generation = networkGeneration;
  networkTimer = setTimeout(async () => {
    networkTimer = undefined;
    if (!currentRoom || generation !== networkGeneration || document.hidden)
      return;
    const code = currentRoom.code;
    const began = performance.now();
    const sentMask = onlineMask();
    try {
      const { room } = await onlineClient.room("sync", {
        code,
        sequence: ++syncSequence,
        input: sentMask,
      });
      if (sentMask & 64) pendingUse = false;
      if (sentMask & 128) pendingRecover = false;
      if (generation !== networkGeneration) return;
      networkFailures = 0;
      if (room) receiveRoom(room);
      else throw new Error("This club has closed.");
      if (onlineKind === "room") $("race-message").textContent = "";
    } catch (error) {
      if (generation !== networkGeneration) return;
      networkFailures = Math.min(4, networkFailures + 1);
      const text =
        error instanceof Error
          ? error.message
          : "Connection lost. Reconnecting…";
      onlineUI.status(text, true);
      if (onlineKind === "room")
        $("race-message").textContent = "CONNECTION PAUSED · RECONNECTING";
    }
    if (generation === networkGeneration && currentRoom)
      scheduleRoomSync(
        Math.max(
          0,
          (networkFailures
            ? 1000 * 2 ** networkFailures
            : currentRoom.status === "lobby"
              ? 1000
              : 180) -
            (performance.now() - began),
        ),
      );
  }, delay);
}
async function leaveRoom() {
  const room = currentRoom;
  currentRoom = null;
  networkGeneration++;
  if (networkTimer) clearTimeout(networkTimer);
  networkTimer = undefined;
  onlineUI.room(null);
  if (room)
    await onlineClient.room("leave", { code: room.code }).catch(() => {});
}
async function returnToClub() {
  if (!currentRoom) {
    stopOnline();
    showTab("online");
    return;
  }
  const room = currentRoom;
  if (room.status !== "finished") {
    await leaveRoom();
    onlineKind = null;
    onlineRace = null;
    showTab("online");
    return;
  }
  networkGeneration++;
  if (networkTimer) clearTimeout(networkTimer);
  networkTimer = undefined;
  try {
    if (room.hostId === onlineClient.player?.id) {
      const result = await onlineClient.room("rematch", { code: room.code });
      currentRoom = null;
      onlineKind = null;
      onlineRace = null;
      showTab("online");
      if (result.room) enterRoom(result.room);
    } else {
      await leaveRoom();
      onlineKind = null;
      showTab("online");
      onlineUI.input("online-code").value = room.code;
      onlineUI.status("Rejoin when the host opens the next race.");
    }
  } catch (error) {
    onlineUI.status(
      error instanceof Error ? error.message : "Could not reopen the club.",
      true,
    );
  }
}

initOnline();
loadTrack(selected);
renderSetups();
renderRiders();
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
  const visualDt = ["paused", "finish"].includes(mode) ? 0 : dt;
  syncModels(now / 1000, mode === "finish" ? dt : visualDt);
  sparks.update(
    ["race", "tour"].includes(mode) ? dt : 0,
    mode === "menu" || mode === "finish"
      ? []
      : mode === "tour"
        ? [racers[0].state]
        : racers.map((r) => r.state),
  );
  updateCamera(dt, now / 1000);
  riderFeedback.update(
    dt,
    camera,
    racers.map((r, i) => ({
      mesh: r.mesh,
      state: r.state,
      stun: items.equipment[i].stun,
      finished: r.finished,
    })),
    ridersEnabled && ["race", "tour"].includes(mode),
  );
  if (mode !== "menu") updateHUD();
  updateGhost();
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
    cameraMode,
    tiltEnabled,
    steering: steeringInput(),
    input: {
      throttle: isDown("ArrowUp") || isDown("KeyW"),
      steerLeft: isDown("ArrowLeft") || isDown("KeyA"),
      steerRight: isDown("ArrowRight") || isDown("KeyD"),
      drift: isDown("Space"),
      boost: isDown("ShiftLeft") || isDown("ShiftRight"),
    },
    online: onlineKind,
    onlineTick: onlineRace?.tick,
    onlinePenaltyTicks: orderedOnlinePlayers()[0]?.penaltyTicks,
    roomCode: currentRoom?.code,
    track: selected.id,
    time: raceTime,
    target: checkpoints[racers[0].checkpoint % checkpoints.length].toArray(),
    position: getPosition(),
    player: { ...racers[0].state },
    item: items.equipment[0].item,
    charges: items.equipment[0].charges,
    shield: items.equipment[0].shield,
    hits: items.equipment[0].hits,
    ridersEnabled,
    riderIndex,
    riderName: RIDERS[riderIndex].name,
    driftReleases,
    momentCount,
    message: lastEventText,
    pickups: items.pickups.map((p) => ({ ...p })),
    quizTargets: items.targets.map((p) => ({ ...p })),
    rivals: racers.slice(1).map((r, i) => ({
      name: r.name,
      finished: r.finished,
      finishTime: r.finishTime,
      visible: r.mesh.visible,
      gatesPassed: r.gatesPassed,
      lapTimes: [...r.lapTimes],
      recoveries: r.recoveries,
      recoverySeconds: r.recoveryGrace,
      style: RIVAL_PROFILES[i].style,
      state: { ...r.state },
      laps: r.laps,
      checkpoint: r.checkpoint,
      item: items.equipment[i + 1].item,
    })),
    raceClosed,
    trackLength: world.curve.getLength(),
    gateCount: gates.length,
    gatesPassed: racers[0].gatesPassed,
    lapTimes: [...racers[0].lapTimes],
    recoveries: racers[0].recoveries,
    recoverySeconds: racers[0].recoveryGrace,
    checkpoint: racers[0].checkpoint,
    laps: racers[0].laps,
    renderCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  }),
});
