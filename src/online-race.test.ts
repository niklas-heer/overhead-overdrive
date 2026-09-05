import { describe, it, expect } from "vitest";
import {
  advanceOnlineRace,
  createOnlineRace,
  decodeOnlineInput,
  encodeOnlineInput,
  validateReplay,
  ONLINE_COURSES,
  ONLINE_MAX_TICKS,
  type OnlineRace,
} from "./online-race";
import { createRivalBrain, driveRival } from "./rivals";
const player = { id: "a", name: "Doodler", rider: 0, color: "#ff663f" };
const trial = () => createOnlineRace("atrium", 0, [player], true);
const clone = (race: OnlineRace): OnlineRace =>
  JSON.parse(JSON.stringify(race));
function recordedLap() {
  const race = trial(),
    brain = createRivalBrain(0),
    course = ONLINE_COURSES.atrium,
    replay: Array<[number, number]> = [];
  while (!race.done) {
    const r = race.players[0],
      count = course.checkpoints.length;
    const input = driveRival(
      brain,
      r.state,
      course.checkpoints[r.checkpoint % count] as Parameters<
        typeof driveRival
      >[2],
      course.checkpoints[(r.checkpoint + 1) % count] as Parameters<
        typeof driveRival
      >[3],
      [],
      course.width,
      race.tick / 120,
    );
    const mask = encodeOnlineInput(input),
      ticks = Math.min(4, ONLINE_MAX_TICKS - race.tick),
      last = replay.at(-1);
    advanceOnlineRace(race, [mask], ticks);
    if (last?.[0] === mask) last[1] += ticks;
    else replay.push([mask, ticks]);
  }
  return { race, replay };
}
describe("authoritative online race", () => {
  it("preserves all masks and rejects malformed values", () => {
    for (let i = 0; i < 256; i++) {
      const d = decodeOnlineInput(i);
      expect(Number.isFinite(d.steer)).toBe(true);
      expect(d.throttle).toBeGreaterThanOrEqual(-1);
      expect(d.throttle).toBeLessThanOrEqual(1);
    }
    expect(
      encodeOnlineInput({
        throttle: 1,
        steer: 1,
        brake: true,
        boost: true,
        use: true,
        recover: true,
      }),
    ).toBe(249);
    for (const value of [-1, 256, 1.5, NaN, Infinity])
      expect(() => decodeOnlineInput(value)).toThrow();
  });
  it("validates courses, setups and player boundaries", () => {
    expect(() => createOnlineRace("__proto__", 0, [player], true)).toThrow();
    expect(() => createOnlineRace("atrium", 3, [player], true)).toThrow();
    expect(() =>
      createOnlineRace("atrium", 0, [player, player], false),
    ).toThrow();
    expect(() =>
      createOnlineRace("atrium", 0, [{ ...player, bot: true }], true),
    ).toThrow();
    expect(() =>
      createOnlineRace("atrium", 0, [{ ...player, color: "url(bad)" }], true),
    ).toThrow();
    expect(() => advanceOnlineRace(trial(), [0], 21601)).toThrow();
    expect(() => advanceOnlineRace(trial(), [0, 0], 1)).toThrow();
  });
  it("roundtrips spring velocities, handbrake transitions and boost hysteresis exactly", () => {
    const a = trial();
    advanceOnlineRace(a, [33], 360);
    advanceOnlineRace(a, [25], 70);
    const b = clone(a);
    for (const [mask, ticks] of [
      [1, 80],
      [37, 90],
      [0, 200],
      [33, 220],
      [17, 12],
    ]) {
      advanceOnlineRace(a, [mask], ticks);
      advanceOnlineRace(b, [mask], ticks);
    }
    expect(clone(a)).toEqual(clone(b));
  });
  it("is independent of request chunking including bot/item state", () => {
    const a = createOnlineRace(
        "chemistry",
        1,
        [player, { ...player, id: "b", name: "Bot", bot: true }],
        false,
      ),
      b = clone(a);
    advanceOnlineRace(a, [33, 0], 600);
    for (let i = 0; i < 30; i++) {
      advanceOnlineRace(b, [33, 0], 20);
      Object.assign(b, clone(b));
    }
    expect(clone(a)).toEqual(clone(b));
  });
  it("recovery keeps sequential progress, spends boost, and applies a penalty once per key press", () => {
    const r = trial();
    advanceOnlineRace(r, [33], 240);
    const checkpoint = r.players[0].checkpoint;
    advanceOnlineRace(r, [128], 200);
    expect(r.players[0].checkpoint).toBe(checkpoint);
    expect(r.players[0].recoveries).toBe(1);
    expect(r.players[0].penaltyTicks).toBe(240);
    expect(r.players[0].laps).toBe(0);
    expect(r.players[0].state.speed).toBe(0);
    advanceOnlineRace(r, [0], 1);
    advanceOnlineRace(r, [128], 1);
    expect(r.players[0].recoveries).toBe(2);
  });
  it("resolves baked solid walls and cannot skip checkpoints by driving straight", () => {
    const r = trial(),
      wall = ONLINE_COURSES.atrium.colliders.find((c) => c.type === "box")!;
    if (wall.type !== "box") throw new Error("Missing wall");
    r.players[0].state.x = (wall.minX + wall.maxX) / 2;
    r.players[0].state.z = (wall.minZ + wall.maxZ) / 2;
    advanceOnlineRace(r, [0], 1);
    const s = r.players[0].state;
    expect(
      s.x < wall.minX || s.x > wall.maxX || s.z < wall.minZ || s.z > wall.maxZ,
    ).toBe(true);
    const straight = trial();
    advanceOnlineRace(straight, [33], 3600);
    expect(straight.players[0].laps).toBe(0);
  });
  it("solo trials have no pickups, opponents or item advantage", () => {
    const a = trial(),
      b = trial();
    advanceOnlineRace(a, [97], 800);
    advanceOnlineRace(b, [33], 800);
    expect(a.players[0].state).toEqual(b.players[0].state);
    expect(a.players[0].equipment.item).toBeNull();
    expect(a.events).toEqual([]);
  });
  it("verifies three laps from controls alone and creates a bounded 10Hz ghost", () => {
    const { race, replay } = recordedLap();
    expect(race.players[0].laps).toBe(3);
    const result = validateReplay("atrium", 0, replay);
    expect(result.finishTicks).toBe(race.players[0].finishTicks);
    expect(result.timeMs).toBe(Math.round((result.finishTicks * 1000) / 120));
    expect(result.ghost.length).toBeLessThanOrEqual(1802);
    expect(result.ghost[0][0]).toBe(0);
    expect(result.ghost.at(-1)![0]).toBe(result.elapsedTicks);
    expect(validateReplay("atrium", 0, replay)).toEqual(result);
  }, 20000);
  it("all four bot racers complete each baked course with finite states", () => {
    for (const track of ["atrium", "chemistry", "courtyard"]) {
      const race = createOnlineRace(
        track,
        0,
        Array.from({ length: 4 }, (_, i) => ({
          ...player,
          id: String(i),
          rider: i,
          bot: true,
        })),
        false,
      );
      advanceOnlineRace(race, [0, 0, 0, 0], ONLINE_MAX_TICKS);
      for (const r of race.players) {
        expect(r.laps, `${track}: ${r.id}`).toBe(3);
        expect(r.finishTicks).toBeLessThan(ONLINE_MAX_TICKS);
        expect(
          Object.values(r.state).every(
            (v) => typeof v !== "number" || Number.isFinite(v),
          ),
        ).toBe(true);
      }
    }
  });
  it("rejects malformed and unfinished replays before accepting scores", () => {
    for (const r of [
      [],
      [[1, 0]],
      [[256, 2]],
      [[1, 1.5]],
      [[1, 21601]],
      [
        [1, 21600],
        [0, 1],
      ],
      [[1, 1, 3]],
    ])
      expect(() =>
        validateReplay("atrium", 0, r as Array<[number, number]>),
      ).toThrow();
    expect(() => validateReplay("atrium", 0, [[0, 120]])).toThrow("three laps");
  });
});
