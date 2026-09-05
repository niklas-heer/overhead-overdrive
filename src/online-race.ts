import courseData from "./online-course-data.json" with { type: "json" };
import {
  createVehicle,
  stepVehicle,
  collideAABB,
  collideCircle,
  FIXED_STEP,
  snapshotVehicleDynamics,
  restoreVehicleDynamics,
  type VehicleState,
  type VehicleDynamics,
  type Input,
  type Tuning,
} from "./physics.ts";
import {
  ItemSystem,
  type Equipment,
  type ItemEvent,
  type Obstacle,
  type ItemKind,
} from "./items.ts";
import {
  createRivalBrain,
  driveRival,
  RIVAL_PROFILES,
  type RivalBrain,
} from "./rivals.ts";

export const ONLINE_VERSION = "school-records-v1";
export const ONLINE_MAX_TICKS = 21600;
export const ONLINE_LAPS = 3;
export const ONLINE_SETUPS: readonly Tuning[] = [
  { motor: 1, grip: 1, stability: 1 },
  { motor: 0.88, grip: 1.25, stability: 1.3 },
  { motor: 1.22, grip: 0.78, stability: 0.8 },
];
export type OnlinePlayer = {
  id: string;
  name: string;
  rider: number;
  color: string;
  bot?: boolean;
};
export type OnlineRacer = OnlinePlayer & {
  state: VehicleState;
  physics: VehicleDynamics;
  checkpoint: number;
  laps: number;
  finished: boolean;
  finishTicks: number | null;
  penaltyTicks: number;
  recoveries: number;
  recoveryTicks: number;
  stuckTicks: number;
  previousInput: number;
  brain: RivalBrain;
  equipment: Omit<Equipment, "state">;
};
export type OnlineRace = {
  version: string;
  trackId: string;
  setupIndex: number;
  timeTrial: boolean;
  tick: number;
  players: OnlineRacer[];
  pickupCooldowns: number[];
  events: Array<ItemEvent & { tick: number }>;
  done: boolean;
};
export type GhostFrame = [tick: number, x: number, z: number, yaw: number];
export type ReplayResult = {
  finishTicks: number;
  elapsedTicks: number;
  timeMs: number;
  ghost: GhostFrame[];
};
type Course = {
  width: number;
  length: number;
  points: Array<{ x: number; z: number }>;
  checkpoints: Array<{ x: number; z: number }>;
  tangents: Array<{ x: number; z: number }>;
  grid: Array<{ x: number; z: number; yaw: number }>;
  colliders: Obstacle[];
  pickups: Array<{ x: number; z: number; kind: ItemKind }>;
};
export const ONLINE_COURSES = courseData as unknown as Record<string, Course>;
function courseFor(trackId: string): Course {
  if (!Object.hasOwn(ONLINE_COURSES, trackId))
    throw new Error("Unknown course");
  return ONLINE_COURSES[trackId];
}
function validMask(mask: number) {
  if (!Number.isInteger(mask) || mask < 0 || mask > 255)
    throw new Error("Invalid input mask");
}
export function decodeOnlineInput(
  mask: number,
): Input & { use: boolean; recover: boolean } {
  validMask(mask);
  return {
    throttle: Number(!!(mask & 1)) - Number(!!(mask & 2)),
    steer: Number(!!(mask & 8)) - Number(!!(mask & 4)),
    brake: !!(mask & 16),
    boost: !!(mask & 32),
    use: !!(mask & 64),
    recover: !!(mask & 128),
  };
}
export function encodeOnlineInput(
  input: Input & { use?: boolean; recover?: boolean },
): number {
  return (
    (input.throttle > 0 ? 1 : input.throttle < 0 ? 2 : 0) |
    (input.steer < 0 ? 4 : input.steer > 0 ? 8 : 0) |
    (input.brake ? 16 : 0) |
    (input.boost ? 32 : 0) |
    (input.use ? 64 : 0) |
    (input.recover ? 128 : 0)
  );
}
export function createOnlineRace(
  trackId: string,
  setupIndex: number,
  players: OnlinePlayer[],
  timeTrial = false,
): OnlineRace {
  const course = courseFor(trackId);
  if (!Number.isInteger(setupIndex) || !ONLINE_SETUPS[setupIndex])
    throw new Error("Unknown setup");
  if (
    !Array.isArray(players) ||
    players.length < 1 ||
    players.length > 4 ||
    (timeTrial && players.length !== 1)
  )
    throw new Error("Invalid player count");
  const ids = new Set<string>();
  const racers = players.map((p, i): OnlineRacer => {
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id.length ||
      p.id.length > 80 ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      p.name.length > 24 ||
      !p.name.trim() ||
      !Number.isInteger(p.rider) ||
      p.rider < 0 ||
      p.rider > 3 ||
      !/^#[a-f\d]{6}$/i.test(p.color) ||
      (typeof p.bot !== "undefined" && typeof p.bot !== "boolean") ||
      (timeTrial && p.bot)
    )
      throw new Error("Invalid player");
    ids.add(p.id);
    const grid = course.grid[i],
      state = createVehicle(grid.x, grid.z, grid.yaw);
    const { state: _, ...equipment } = new ItemSystem([state], [], [], [])
      .equipment[0];
    return {
      id: p.id,
      name: p.name.trim(),
      rider: p.rider,
      color: p.color,
      bot: !!p.bot,
      state,
      physics: snapshotVehicleDynamics(state),
      checkpoint: 1,
      laps: 0,
      finished: false,
      finishTicks: null,
      penaltyTicks: 0,
      recoveries: 0,
      recoveryTicks: 0,
      stuckTicks: 0,
      previousInput: 0,
      brain: createRivalBrain(Math.max(0, i - 1)),
      equipment,
    };
  });
  return {
    version: ONLINE_VERSION,
    trackId,
    setupIndex,
    timeTrial,
    tick: 0,
    players: racers,
    pickupCooldowns: course.pickups.map(() => 0),
    events: [],
    done: false,
  };
}
function collide(state: VehicleState, course: Course) {
  for (const wall of course.colliders)
    if (wall.type === "box")
      collideAABB(state, wall.minX, wall.maxX, wall.minZ, wall.maxZ);
    else collideCircle(state, wall.x, wall.z, wall.radius);
}
function recover(r: OnlineRacer, course: Course) {
  const index =
      (r.checkpoint - 1 + course.checkpoints.length) %
      course.checkpoints.length,
    p = course.checkpoints[index],
    h = course.tangents[index];
  // Rebuild the state rather than carrying spring energy or a banked boost through a teleport.
  Object.assign(r.state, createVehicle(p.x, p.z, Math.atan2(h.x, h.z)));
  r.state.boost = 0;
  restoreVehicleDynamics(
    r.state,
    snapshotVehicleDynamics(createVehicle(0, 0, 0)),
  );
  r.penaltyTicks += 240;
  r.recoveries++;
  r.recoveryTicks = 90;
  r.stuckTicks = 0;
  r.equipment.turbo = 0;
  r.equipment.stun = 0;
  r.equipment.immunity = 1;
}
/** Same fixed-step engine in browsers and server. Snapshots need no hidden object identity. */
export function advanceOnlineRace(
  race: OnlineRace,
  inputs: number[],
  ticks: number,
): OnlineRace {
  if (race.version !== ONLINE_VERSION) throw new Error("Race version mismatch");
  if (!Array.isArray(inputs) || inputs.length !== race.players.length)
    throw new Error("Invalid input count");
  inputs.forEach(validMask);
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > ONLINE_MAX_TICKS)
    throw new Error("Invalid tick count");
  const course = courseFor(race.trackId),
    count = course.checkpoints.length;
  const items = new ItemSystem(
    race.players.map((r) => r.state),
    race.timeTrial ? [] : course.pickups,
    [],
    course.colliders,
  );
  race.players.forEach((r, i) => {
    restoreVehicleDynamics(r.state, r.physics);
    Object.assign(items.equipment[i], r.equipment, { state: r.state });
    r.equipment = items.equipment[i];
  });
  items.pickups.forEach((p, i) => (p.cooldown = race.pickupCooldowns[i]));
  for (
    let step = 0;
    step < ticks && race.tick < ONLINE_MAX_TICKS && !race.done;
    step++
  ) {
    race.tick++;
    race.players.forEach((r, i) => {
      const e = items.equipment[i];
      e.active = !r.finished && r.recoveryTicks === 0;
      const controls = decodeOnlineInput(inputs[i]);
      if (r.finished) {
        r.previousInput = inputs[i];
        return;
      }
      if (r.recoveryTicks > 0) {
        r.recoveryTicks--;
        r.previousInput = inputs[i];
        return;
      }
      if (
        (controls.recover && !(r.previousInput & 128)) ||
        (r.bot && r.stuckTicks > 420)
      ) {
        recover(r, course);
        Object.assign(e, r.equipment);
        e.active = false;
        r.previousInput = inputs[i];
        return;
      }
      let input: Input = controls;
      if (r.bot)
        input = driveRival(
          r.brain,
          r.state,
          course.checkpoints[r.checkpoint % count] as Parameters<
            typeof driveRival
          >[2],
          course.checkpoints[(r.checkpoint + 1) % count] as Parameters<
            typeof driveRival
          >[3],
          race.players.filter((p) => !p.finished).map((p) => p.state),
          course.width,
          race.tick * FIXED_STEP,
        );
      if (e.stun > 0)
        input = {
          throttle: 0,
          steer: input.steer * 0.25,
          brake: false,
          boost: false,
        };
      stepVehicle(
        r.state,
        input,
        FIXED_STEP,
        r.bot
          ? RIVAL_PROFILES[r.brain.profileIndex].tuning
          : ONLINE_SETUPS[race.setupIndex],
      );
      collide(r.state, course);
      const nearest = Math.min(
        ...course.checkpoints.map((p) =>
          Math.hypot(r.state.x - p.x, r.state.z - p.z),
        ),
      );
      if (nearest > course.width * 0.65) {
        const drag = Math.exp(-1.4 * FIXED_STEP);
        r.state.vx *= drag;
        r.state.vz *= drag;
        r.state.speed = Math.hypot(r.state.vx, r.state.vz);
      }
      r.stuckTicks = r.state.speed < 0.7 ? r.stuckTicks + 1 : 0;
      if (
        !race.timeTrial &&
        ((controls.use && !(r.previousInput & 64)) ||
          (r.bot && race.tick % 90 === i * 15))
      )
        items.use(i);
      r.previousInput = inputs[i];
    });
    if (!race.timeTrial) {
      for (let i = 0; i < race.players.length; i++)
        for (let j = i + 1; j < race.players.length; j++) {
          const a = race.players[i],
            b = race.players[j];
          if (a.finished || b.finished || a.recoveryTicks || b.recoveryTicks)
            continue;
          const dx = a.state.x - b.state.x,
            dz = a.state.z - b.state.z,
            d = Math.hypot(dx, dz);
          if (d >= 1.4) continue;
          const nx = d > 0.001 ? dx / d : 1,
            nz = d > 0.001 ? dz / d : 0,
            overlap = (1.4 - d) * 0.5;
          a.state.x += nx * overlap;
          a.state.z += nz * overlap;
          b.state.x -= nx * overlap;
          b.state.z -= nz * overlap;
          const v =
            (a.state.vx - b.state.vx) * nx + (a.state.vz - b.state.vz) * nz;
          if (v < 0) {
            a.state.vx -= v * nx * 0.6;
            a.state.vz -= v * nz * 0.6;
            b.state.vx += v * nx * 0.6;
            b.state.vz += v * nz * 0.6;
          }
          for (const p of [a, b]) {
            p.state.collision = Math.max(p.state.collision, 0.15);
            p.state.driftCharge = 0;
            p.state.driftTurbo = 0;
            collide(p.state, course);
          }
        }
      items.step(FIXED_STEP);
      race.events.push(
        ...items.drainEvents().map((e) => ({ ...e, tick: race.tick })),
      );
      race.events = race.events
        .filter((e) => race.tick - e.tick < 120)
        .slice(-40);
    }
    for (const r of race.players) {
      if (r.finished || r.recoveryTicks) continue;
      const target = course.checkpoints[r.checkpoint % count],
        h = course.tangents[r.checkpoint % count];
      // Sequential gates require forward travel; reversals and recovery never grant progress.
      const forward = r.state.vx * h.x + r.state.vz * h.z > 0;
      const crossed =
        r.checkpoint % count !== 0 ||
        (r.state.x - target.x) * h.x + (r.state.z - target.z) * h.z >= 0;
      if (
        forward &&
        crossed &&
        Math.hypot(r.state.x - target.x, r.state.z - target.z) <
          course.width * 0.63
      ) {
        r.checkpoint++;
        if (r.checkpoint > count) {
          r.checkpoint = 1;
          r.laps++;
          if (r.laps >= ONLINE_LAPS) {
            r.finished = true;
            r.finishTicks = race.tick + r.penaltyTicks;
            r.equipment.active = false;
          }
        }
      }
    }
    race.done =
      race.players.every((r) => r.finished) || race.tick >= ONLINE_MAX_TICKS;
  }
  race.players.forEach((r, i) => {
    r.physics = snapshotVehicleDynamics(r.state);
    const { state: _, ...equipment } = items.equipment[i];
    r.equipment = equipment;
  });
  items.pickups.forEach((p, i) => (race.pickupCooldowns[i] = p.cooldown));
  return race;
}
/** Replays untrusted controls from a fresh solo grid. Client-reported times are never consulted. */
export function validateReplay(
  trackId: string,
  setupIndex: number,
  replay: Array<[number, number]>,
): ReplayResult {
  if (
    !Array.isArray(replay) ||
    !replay.length ||
    replay.length > ONLINE_MAX_TICKS
  )
    throw new Error("Invalid replay");
  let total = 0;
  for (const entry of replay) {
    if (!Array.isArray(entry) || entry.length !== 2)
      throw new Error("Invalid replay entry");
    validMask(entry[0]);
    if (
      !Number.isInteger(entry[1]) ||
      entry[1] < 1 ||
      entry[1] > ONLINE_MAX_TICKS
    )
      throw new Error("Invalid replay duration");
    total += entry[1];
    if (total > ONLINE_MAX_TICKS)
      throw new Error("Replay exceeds three minutes");
  }
  const race = createOnlineRace(
      trackId,
      setupIndex,
      [{ id: "replay", name: "Replay", rider: 0, color: "#ff663f" }],
      true,
    ),
    ghost: GhostFrame[] = [];
  const capture = () => {
    const s = race.players[0].state;
    ghost.push([
      race.tick,
      +s.x.toFixed(3),
      +s.z.toFixed(3),
      +s.yaw.toFixed(4),
    ]);
  };
  capture();
  for (const [mask, ticks] of replay) {
    let remaining = ticks;
    while (remaining > 0 && !race.done) {
      const batch = Math.min(remaining, 12 - (race.tick % 12));
      advanceOnlineRace(race, [mask], batch);
      remaining -= batch;
      if (race.tick % 12 === 0 || race.done) capture();
    }
    if (race.done) break;
  }
  const finishTicks = race.players[0].finishTicks;
  if (finishTicks === null) throw new Error("Replay did not finish three laps");
  if (total > race.tick + 120)
    throw new Error("Replay contains excessive trailing input");
  return {
    finishTicks,
    elapsedTicks: race.tick,
    timeMs: Math.round((finishTicks * 1000) / 120),
    ghost,
  };
}
