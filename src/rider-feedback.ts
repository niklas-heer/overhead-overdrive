import * as THREE from "three";
import type { VehicleState } from "./physics";

export type ReactionRacer = {
  mesh: THREE.Object3D;
  state: VehicleState;
  stun: number;
  finished: boolean;
};
export type RiderReaction = {
  racerIndex: number;
  kind: "drift" | "boost" | "collision" | "stun" | "overtake";
};
type Memory = {
  state: VehicleState;
  boost: number;
  collision: number;
  stun: boolean;
  charged: boolean;
  turbo: boolean;
  boosting: boolean;
  cooling: number;
  overtakes: Map<THREE.Object3D, number>;
};

/** Transition detector kept independent of rendering so pauses and event cooldowns are testable. */
export class RiderReactionDirector {
  private memory = new WeakMap<THREE.Object3D, Memory>();

  clear() {
    this.memory = new WeakMap();
  }

  update(
    dt: number,
    racers: readonly ReactionRacer[],
    active: boolean,
  ): RiderReaction[] {
    if (!active || !Number.isFinite(dt) || dt <= 0) return [];
    dt = Math.min(dt, 0.1);
    const reactions: RiderReaction[] = [];
    racers.forEach((racer, racerIndex) => {
      const s = racer.state;
      let previous = this.memory.get(racer.mesh);
      // A recovery creates a fresh VehicleState; never turn its jumps into a joke.
      const initial = !previous || previous.state !== s;
      if (initial) {
        previous = {
          state: s,
          boost: s.boost,
          collision: s.collision,
          stun: racer.stun > 0,
          charged: s.driftCharge >= 0.45,
          turbo: s.driftTurbo > 0,
          boosting: false,
          cooling: previous?.cooling ?? 0,
          overtakes: new Map(),
        };
        this.memory.set(racer.mesh, previous);
      }
      const p = previous!;
      p.cooling = Math.max(0, p.cooling - dt);
      let overtook = false;
      const currentPairs = new Map<THREE.Object3D, number>();
      // An actual nearby pass: travel in the same direction, move from behind to ahead.
      // Hysteresis avoids firing on tiny side-by-side changes or oncoming traffic.
      if (!racer.finished && s.speed > 6) {
        for (const other of racers) {
          if (other === racer || other.finished || !other.mesh.visible)
            continue;
          const dx = other.state.x - s.x,
            dz = other.state.z - s.z;
          if (
            Math.hypot(dx, dz) > 10 ||
            Math.cos(other.state.yaw - s.yaw) < 0.86
          )
            continue;
          const along = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
          const lateral = Math.abs(dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw));
          if (lateral > 3.5) continue;
          const before = p.overtakes.get(other.mesh);
          const passed = before !== undefined && before > 0.8 && along < -1.1;
          if (passed) overtook = true;
          currentPairs.set(
            other.mesh,
            passed || along > 0.8 ? along : (before ?? along),
          );
        }
      }
      const boosting = s.boost < p.boost - dt * 0.1 && s.speed > 9;
      let kind: RiderReaction["kind"] | null = null;
      if (
        !initial &&
        !racer.finished &&
        racer.mesh.visible &&
        p.cooling === 0
      ) {
        if (racer.stun > 0 && !p.stun) kind = "stun";
        else if (s.collision > 0.25 && s.collision > p.collision + 0.16)
          kind = "collision";
        else if (overtook) kind = "overtake";
        else if (s.driftTurbo > 0 && !p.turbo) kind = "drift";
        else if (s.driftCharge >= 0.45 && !p.charged) kind = "drift";
        else if (boosting && !p.boosting) kind = "boost";
      }
      if (kind) {
        reactions.push({ racerIndex, kind });
        p.cooling = 10;
      }
      p.boosting = boosting;
      p.boost = s.boost;
      p.collision = s.collision;
      p.stun = racer.stun > 0;
      p.charged = s.driftCharge >= 0.45;
      p.turbo = s.driftTurbo > 0;
      p.overtakes = currentPairs;
    });
    return reactions;
  }
}

const PHRASES: Record<RiderReaction["kind"], readonly string[]> = {
  drift: ["I meant that!", "Perfectly planned."],
  boost: ["Out of syllabus!", "Late for physics!"],
  collision: ["That was a wall.", "Minor correction!"],
  stun: ["Rude!", "No laser pens!"],
  overtake: ["Excuse me!", "Passing my exams!"],
};
type Bubble = {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  owner: THREE.Object3D | null;
  age: number;
};

/** At most two short, world-sized comic reactions: the player and one nearby rival.
 * Update after racer animation and the camera. active=false freezes the existing cue.
 * clear() on track changes, race restart, or returning to the menu. */
export class RiderFeedback {
  readonly group = new THREE.Group();
  private readonly director = new RiderReactionDirector();
  private readonly bubbles: Bubble[] = [];
  private readonly phraseCounts = new Map<RiderReaction["kind"], number>();
  private readonly right = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly duration = 1.25;

  constructor(scene: THREE.Scene) {
    this.group.name = "rider-reactions";
    scene.add(this.group);
    for (let i = 0; i < 2; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      const context = canvas.getContext("2d")!;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = i === 0 ? "player-aside" : "rival-aside";
      sprite.visible = false;
      sprite.scale.set(1.2, 0.6, 1);
      this.group.add(sprite);
      this.bubbles.push({
        sprite,
        canvas,
        context,
        texture,
        owner: null,
        age: 99,
      });
    }
  }

  private say(
    bubble: Bubble,
    text: string,
    owner: THREE.Object3D,
    rival: boolean,
  ) {
    const c = bubble.context;
    c.clearRect(0, 0, 512, 256);
    c.fillStyle = "#fff8df";
    c.strokeStyle = "#31424b";
    c.lineWidth = 7;
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(46, 22);
    c.quadraticCurveTo(248, 3, 464, 24);
    c.quadraticCurveTo(495, 28, 486, 167);
    c.quadraticCurveTo(482, 197, 452, 194);
    if (rival) {
      c.lineTo(407, 194);
      c.lineTo(439, 241);
      c.lineTo(352, 196);
    }
    c.lineTo(146, 196);
    if (!rival) {
      c.lineTo(71, 241);
      c.lineTo(101, 193);
    }
    c.lineTo(44, 193);
    c.quadraticCurveTo(13, 187, 23, 49);
    c.quadraticCurveTo(26, 27, 46, 22);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#293e4a";
    c.font = 'bold 47px "Comic Sans MS", "Trebuchet MS", sans-serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (c.measureText(next).width > 413 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    lines.forEach((value, i) =>
      c.fillText(value, 256, 110 + (i - (lines.length - 1) / 2) * 54),
    );
    bubble.texture.needsUpdate = true;
    bubble.owner = owner;
    bubble.age = 0;
    bubble.sprite.visible = true;
  }

  update(
    dt: number,
    camera: THREE.Camera,
    racers: readonly ReactionRacer[],
    active: boolean,
  ) {
    const safeDt =
      active && Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    for (const bubble of this.bubbles) bubble.age += safeDt;
    const cues = this.director.update(safeDt, racers, active);
    for (const cue of cues) {
      const racer = racers[cue.racerIndex];
      const rival = cue.racerIndex !== 0;
      const bubble = this.bubbles[rival ? 1 : 0];
      if (bubble.age < this.duration) continue;
      racer.mesh.getWorldPosition(this.position);
      if (rival && this.position.distanceTo(camera.position) > 18) continue;
      const count = this.phraseCounts.get(cue.kind) ?? 0;
      this.phraseCounts.set(cue.kind, count + 1);
      const phrases = PHRASES[cue.kind];
      this.say(bubble, phrases[count % phrases.length], racer.mesh, rival);
    }
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.bubbles.forEach((bubble, index) => {
      const owner = bubble.owner;
      if (
        !owner ||
        bubble.age >= this.duration ||
        !owner.visible ||
        !owner.parent
      ) {
        bubble.sprite.visible = false;
        return;
      }
      const head = owner.getObjectByName("rider-head");
      if (head) head.getWorldPosition(this.position);
      else {
        owner.getWorldPosition(this.position);
        this.position.y += 2.5;
      }
      this.position.y += 0.48;
      this.position.addScaledVector(this.right, index === 0 ? 0.91 : -0.91);
      bubble.sprite.position.copy(this.position);
      const distance = this.position.distanceTo(camera.position);
      const fade = THREE.MathUtils.clamp((24 - distance) / 12, 0, 1);
      const life = Math.min(
        1,
        bubble.age / 0.11,
        (this.duration - bubble.age) / 0.26,
      );
      bubble.sprite.material.opacity = fade * life * 0.95;
      bubble.sprite.visible = fade > 0;
      const pop = 1 + Math.sin(Math.min(1, bubble.age / 0.18) * Math.PI) * 0.07;
      bubble.sprite.scale.set(1.2 * pop, 0.6 * pop, 1);
    });
  }

  clear() {
    this.director.clear();
    this.phraseCounts.clear();
    for (const bubble of this.bubbles) {
      bubble.owner = null;
      bubble.age = 99;
      bubble.sprite.visible = false;
    }
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
    for (const bubble of this.bubbles) {
      bubble.texture.dispose();
      bubble.sprite.material.dispose();
    }
  }
}
