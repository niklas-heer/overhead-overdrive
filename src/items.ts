import type { VehicleState } from "./physics";

export type ItemKind = "laser" | "shield" | "turbo";
export const ITEM_INFO = {
  laser: {
    name: "LASER POINTER",
    hint: "3 shots · aim at a rival or a quiz target",
    icon: "↗",
    color: "#ff6072",
  },
  shield: {
    name: "TRANSPARENCY SHIELD",
    hint: "Block one laser hit for 7 seconds",
    icon: "◇",
    color: "#65e5d2",
  },
  turbo: {
    name: "CAPACITOR KICK",
    hint: "A 2-second burst of extra power",
    icon: "ϟ",
    color: "#ffd76c",
  },
} as const;
export type Obstacle =
  | { type: "box"; minX: number; maxX: number; minZ: number; maxZ: number }
  | { type: "circle"; x: number; z: number; radius: number };
export type Pickup = { x: number; z: number; kind: ItemKind; cooldown: number };
export type QuizTarget = { x: number; z: number; cooldown: number };
export type Equipment = {
  state: VehicleState;
  item: ItemKind | null;
  charges: number;
  shield: number;
  stun: number;
  turbo: number;
  immunity: number;
  cooldown: number;
  active: boolean;
  hits: number;
  collected: number;
};
export type ItemEvent = {
  type: "pickup" | "laser" | "hit" | "blocked" | "target" | "shield" | "turbo";
  owner: number;
  victim?: number;
  kind?: ItemKind;
  from?: { x: number; z: number };
  to?: { x: number; z: number };
};
export function createEquipment(state: VehicleState): Equipment {
  return {
    state,
    item: null,
    charges: 0,
    shield: 0,
    stun: 0,
    turbo: 0,
    immunity: 0,
    cooldown: 0,
    active: true,
    hits: 0,
    collected: 0,
  };
}
function circleHit(
  x: number,
  z: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
) {
  const rx = cx - x,
    rz = cz - z,
    along = rx * dx + rz * dz,
    side = rx * rx + rz * rz - along * along;
  if (side > radius * radius || along < 0) return Infinity;
  return Math.max(0, along - Math.sqrt(Math.max(0, radius * radius - side)));
}
function wallHit(x: number, z: number, dx: number, dz: number, wall: Obstacle) {
  if (wall.type === "circle")
    return circleHit(x, z, dx, dz, wall.x, wall.z, wall.radius);
  let lo = 0,
    hi = 32;
  for (const [p, d, min, max] of [
    [x, dx, wall.minX, wall.maxX],
    [z, dz, wall.minZ, wall.maxZ],
  ]) {
    if (Math.abs(d) < 1e-8) {
      if (p < min || p > max) return Infinity;
    } else {
      let a = (min - p) / d,
        b = (max - p) / d;
      if (a > b) [a, b] = [b, a];
      lo = Math.max(lo, a);
      hi = Math.min(hi, b);
      if (lo > hi) return Infinity;
    }
  }
  return lo;
}
/** Deterministic item rules; receives the same vehicle states used by the driving simulation. */
export class ItemSystem {
  readonly equipment: Equipment[];
  readonly pickups: Pickup[];
  readonly targets: QuizTarget[];
  private events: ItemEvent[] = [];
  constructor(
    states: VehicleState[],
    pickups: Array<{ x: number; z: number; kind: ItemKind }>,
    targets: Array<{ x: number; z: number }>,
    readonly obstacles: Obstacle[],
  ) {
    this.equipment = states.map(createEquipment);
    this.pickups = pickups.map((p) => ({ ...p, cooldown: 0 }));
    this.targets = targets.map((p) => ({ ...p, cooldown: 0 }));
  }
  step(dt: number) {
    for (const pickup of this.pickups)
      pickup.cooldown = Math.max(0, pickup.cooldown - dt);
    for (const target of this.targets)
      target.cooldown = Math.max(0, target.cooldown - dt);
    this.equipment.forEach((e, i) => {
      for (const key of [
        "shield",
        "stun",
        "turbo",
        "immunity",
        "cooldown",
      ] as const)
        e[key] = Math.max(0, e[key] - dt);
      if (!e.active) return;
      if (e.stun > 0) {
        const drag = Math.exp(-2.1 * dt);
        e.state.vx *= drag;
        e.state.vz *= drag;
      }
      if (e.turbo > 0) {
        e.state.vx += Math.sin(e.state.yaw) * 8 * dt;
        e.state.vz += Math.cos(e.state.yaw) * 8 * dt;
      }
      e.state.speed = Math.hypot(e.state.vx, e.state.vz);
      if (e.item) return;
      for (const pickup of this.pickups)
        if (
          pickup.cooldown === 0 &&
          Math.hypot(e.state.x - pickup.x, e.state.z - pickup.z) < 1.55
        ) {
          e.item = pickup.kind;
          e.charges = pickup.kind === "laser" ? 3 : 1;
          e.collected++;
          pickup.cooldown = 8;
          this.events.push({ type: "pickup", owner: i, kind: pickup.kind });
          break;
        }
    });
  }
  use(owner: number): boolean {
    const e = this.equipment[owner];
    if (!e?.active || !e.item || e.cooldown > 0 || e.stun > 0) return false;
    e.cooldown = 0.45;
    if (e.item === "shield") {
      e.shield = 7;
      this.events.push({ type: "shield", owner });
    } else if (e.item === "turbo") {
      e.turbo = 2;
      this.events.push({ type: "turbo", owner });
    } else this.fire(owner);
    if (--e.charges === 0) e.item = null;
    return true;
  }
  private fire(owner: number) {
    const shooter = this.equipment[owner],
      s = shooter.state;
    const dx = Math.sin(s.yaw),
      dz = Math.cos(s.yaw),
      x = s.x + dx * 0.85,
      z = s.z + dz * 0.85;
    let distance = 32,
      victim = -1,
      targetIndex = -1;
    for (const wall of this.obstacles)
      distance = Math.min(distance, wallHit(x, z, dx, dz, wall));
    this.equipment.forEach((e, i) => {
      if (i === owner || !e.active) return;
      const d = circleHit(x, z, dx, dz, e.state.x, e.state.z, 1.15);
      if (d < distance) {
        distance = d;
        victim = i;
      }
    });
    this.targets.forEach((target, i) => {
      if (target.cooldown > 0) return;
      const d = circleHit(x, z, dx, dz, target.x, target.z, 0.9);
      if (d < distance) {
        distance = d;
        victim = -1;
        targetIndex = i;
      }
    });
    const to = { x: x + dx * distance, z: z + dz * distance };
    this.events.push({ type: "laser", owner, from: { x, z }, to });
    if (victim >= 0) {
      const e = this.equipment[victim];
      if (e.shield > 0) {
        e.shield = 0;
        e.immunity = 1;
        this.events.push({ type: "blocked", owner, victim, to });
      } else if (e.immunity === 0) {
        e.stun = 1.05;
        e.immunity = 2.4;
        e.state.vx *= 0.5;
        e.state.vz *= 0.5;
        shooter.hits++;
        this.events.push({ type: "hit", owner, victim, to });
      }
    } else if (targetIndex >= 0) {
      this.targets[targetIndex].cooldown = 10;
      s.boost = Math.min(1, s.boost + 0.2);
      shooter.hits++;
      this.events.push({ type: "target", owner, to });
    }
  }
  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
