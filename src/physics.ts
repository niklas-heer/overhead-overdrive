/** SI units: metres, seconds and radians. Positive steering turns right; positive yaw turns left. */
export type Input = {
  throttle: number;
  steer: number;
  brake: boolean;
  boost: boolean;
};
export type Tuning = { motor: number; grip: number; stability: number };
export type VehicleState = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  yawRate: number;
  roll: number;
  pitch: number;
  wobble: number;
  speed: number;
  boost: number;
  heat: number;
  drifting: boolean;
  collision: number;
};

export const VEHICLE_RADIUS = 0.7;
export const FIXED_STEP = 1 / 120;
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const moveToward = (value: number, target: number, delta: number) =>
  value + clamp(target - value, -delta, delta);

type Dynamics = {
  accumulator: number;
  rollVelocity: number;
  pitchVelocity: number;
  wobbleVelocity: number;
  overheated: boolean;
};
const dynamics = new WeakMap<VehicleState, Dynamics>();
function internals(state: VehicleState): Dynamics {
  let value = dynamics.get(state);
  if (!value) {
    value = {
      accumulator: 0,
      rollVelocity: 0,
      pitchVelocity: 0,
      wobbleVelocity: 0,
      overheated: false,
    };
    dynamics.set(state, value);
  }
  return value;
}

export function createVehicle(x: number, z: number, yaw: number): VehicleState {
  return {
    x,
    z,
    yaw,
    vx: 0,
    vz: 0,
    yawRate: 0,
    roll: 0,
    pitch: 0,
    wobble: 0,
    speed: 0,
    boost: 1,
    heat: 0,
    drifting: false,
    collision: 0,
  };
}

/** Accumulates render-frame time, always integrating at 120 Hz. Discards stall time above 250 ms. */
export function stepVehicle(
  state: VehicleState,
  input: Input,
  dt: number,
  tuning: Tuning,
): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const internal = internals(state);
  internal.accumulator += Math.min(dt, 0.25);
  while (internal.accumulator + 1e-10 >= FIXED_STEP) {
    integrate(state, input, tuning, internal);
    internal.accumulator -= FIXED_STEP;
    if (internal.accumulator < 0) internal.accumulator = 0;
  }
}

function spring(
  value: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  limit: number,
): [number, number] {
  velocity += ((target - value) * stiffness - velocity * damping) * FIXED_STEP;
  const next = value + velocity * FIXED_STEP;
  if (Math.abs(next) > limit)
    return [clamp(next, -limit, limit), -velocity * 0.12];
  return [next, velocity];
}

function integrate(
  s: VehicleState,
  input: Input,
  tuning: Tuning,
  d: Dynamics,
): void {
  const dt = FIXED_STEP;
  const motor = clamp(tuning.motor, 0.5, 1.6);
  const grip = clamp(tuning.grip, 0.5, 1.6);
  const stability = clamp(tuning.stability, 0.5, 1.6);
  const throttle = clamp(input.throttle, -1, 1);
  const steer = clamp(input.steer, -1, 1);
  const oldVx = s.vx;
  const oldVz = s.vz;
  const initialSpeed = Math.hypot(s.vx, s.vz);
  const forward = s.vx * Math.sin(s.yaw) + s.vz * Math.cos(s.yaw);

  // A short, tall trolley reacts promptly, but loses steering lock at speed.
  // Forward is local +Z. Viewed from behind, right is -X, so right steering decreases yaw.
  const steerAngle = (-steer * 0.53) / (1 + Math.abs(forward) * 0.085);
  let targetYawRate = clamp(
    (Math.tan(steerAngle) * forward) / 1.65,
    -1.75,
    1.75,
  );
  if (input.brake) targetYawRate *= 1.2;
  s.yawRate +=
    (targetYawRate - s.yawRate) * (1 - Math.exp(-7 * stability * dt));
  s.yaw += s.yawRate * dt;

  const fx = Math.sin(s.yaw),
    fz = Math.cos(s.yaw);
  const rx = fz,
    rz = -fx;
  let longitudinal = s.vx * fx + s.vz * fz;
  let lateral = s.vx * rx + s.vz * rz;

  if (s.heat >= 0.98) d.overheated = true;
  if (s.heat <= 0.4) d.overheated = false;
  const boosting =
    input.boost &&
    throttle > 0 &&
    !input.brake &&
    s.boost > 0.02 &&
    !d.overheated;
  s.boost = clamp(s.boost + (boosting ? -0.3 : 0.105) * dt, 0, 1);
  s.heat = clamp(s.heat + (boosting ? 0.31 : -0.22) * dt, 0, 1);

  // Opposite throttle is a service brake until the wheels begin to reverse.
  const opposing = longitudinal * throttle < -0.15;
  let drive =
    throttle * (opposing ? 21 : throttle < 0 ? 6.2 * motor : 10.3 * motor);
  if (boosting) drive += 10.5 * motor;
  // Bluff-body drag grows quadratically: stock cruising speed is about 16 m/s.
  const drag = 0.037 * longitudinal * initialSpeed;
  drive -= drag;
  if (longitudinal < -6.5) drive += (-longitudinal - 6.5) * 9;
  longitudinal += drive * dt;
  longitudinal = moveToward(longitudinal, 0, (input.brake ? 13 : 0.65) * dt);

  // Caster friction is capped, so inertia survives a hard corner as a controllable slide.
  const lateralRate = (input.brake ? 2.2 : 10.5) * grip;
  const lateralLimit = (input.brake ? 5.4 : 15.5) * grip;
  const correction = lateral * (1 - Math.exp(-lateralRate * dt));
  lateral -= clamp(correction, -lateralLimit * dt, lateralLimit * dt);
  s.vx = fx * longitudinal + rx * lateral;
  s.vz = fz * longitudinal + rz * lateral;
  s.speed = Math.hypot(s.vx, s.vz);
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  s.drifting =
    s.speed > 3 &&
    (Math.abs(lateral) > 1.5 || (input.brake && Math.abs(steer) > 0.15));
  s.collision = Math.max(0, s.collision - dt * 2.5);

  // Damped springs sell the high centre of mass without tipping the playable chassis.
  const ax = (s.vx - oldVx) / dt,
    az = (s.vz - oldVz) / dt;
  const lateralAccel = ax * rx + az * rz;
  const forwardAccel = ax * fx + az * fz;
  const rollTarget = clamp((lateralAccel * 0.019) / stability, -0.3, 0.3);
  const pitchTarget = clamp((-forwardAccel * 0.012) / stability, -0.22, 0.22);
  [s.roll, d.rollVelocity] = spring(
    s.roll,
    d.rollVelocity,
    rollTarget,
    62 * stability,
    10,
    0.36,
  );
  [s.pitch, d.pitchVelocity] = spring(
    s.pitch,
    d.pitchVelocity,
    pitchTarget,
    68 * stability,
    11,
    0.27,
  );
  [s.wobble, d.wobbleVelocity] = spring(
    s.wobble,
    d.wobbleVelocity,
    -s.roll * 0.7 + s.yawRate * 0.035,
    39 * stability,
    3.7,
    0.28,
  );
}

/** Removes penetration and reflects only velocity travelling into the contact. */
function contact(
  s: VehicleState,
  nx: number,
  nz: number,
  penetration: number,
): void {
  s.x += nx * (penetration + 0.001);
  s.z += nz * (penetration + 0.001);
  const into = s.vx * nx + s.vz * nz;
  if (into < 0) {
    // Soft rubber edges absorb most impact; tangential velocity survives to slide along walls.
    s.vx -= nx * into * 1.16;
    s.vz -= nz * into * 1.16;
    const tx = -nz,
      tz = nx;
    const tangent = (s.vx * tx + s.vz * tz) * 0.08;
    s.vx -= tx * tangent;
    s.vz -= tz * tangent;
    const d = internals(s);
    d.wobbleVelocity += clamp(
      -into * (nx * Math.cos(s.yaw) - nz * Math.sin(s.yaw)) * 0.2,
      -2,
      2,
    );
    s.collision = clamp(Math.abs(into) / 7, 0.12, 1);
  }
  s.speed = Math.hypot(s.vx, s.vz);
}

export function collideCircle(
  s: VehicleState,
  cx: number,
  cz: number,
  radius: number,
): boolean {
  const dx = s.x - cx,
    dz = s.z - cz;
  const distance = Math.hypot(dx, dz);
  const combined = Math.max(0, radius) + VEHICLE_RADIUS;
  if (distance >= combined) return false;
  if (distance > 1e-8)
    contact(s, dx / distance, dz / distance, combined - distance);
  else {
    const speed = Math.hypot(s.vx, s.vz);
    contact(
      s,
      speed > 1e-8 ? -s.vx / speed : 1,
      speed > 1e-8 ? -s.vz / speed : 0,
      combined,
    );
  }
  return true;
}

export function collideAABB(
  s: VehicleState,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  const closestX = clamp(s.x, minX, maxX),
    closestZ = clamp(s.z, minZ, maxZ);
  const dx = s.x - closestX,
    dz = s.z - closestZ;
  const distance = Math.hypot(dx, dz);
  if (distance >= VEHICLE_RADIUS) return false;
  if (distance > 1e-8)
    contact(s, dx / distance, dz / distance, VEHICLE_RADIUS - distance);
  else {
    // Centre inside the solid: choose the nearest exit, including the chassis radius.
    const exits = [s.x - minX, maxX - s.x, s.z - minZ, maxZ - s.z];
    const nearest = exits.indexOf(Math.min(...exits));
    const normals = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    contact(
      s,
      normals[nearest][0],
      normals[nearest][1],
      exits[nearest] + VEHICLE_RADIUS,
    );
  }
  return true;
}
