import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createOnlineHandler } from "./online";
import { MemoryStore, locked } from "./store";
import {
  advanceOnlineRace,
  createOnlineRace,
  encodeOnlineInput,
  ONLINE_COURSES,
  ONLINE_MAX_TICKS,
  validateReplay,
} from "../src/online-race";
import { createRivalBrain, driveRival } from "../src/rivals";

const ORIGIN = "https://overhead-overdrive.vercel.app";
type Identity = { id: string; csrf: string; cookie: string };
type StoredRoom = {
  inputs: Record<string, number>;
  sequences: Record<string, number>;
  players: Array<{ id: string }>;
  race: ReturnType<typeof createOnlineRace> | null;
};
let now: number,
  store: MemoryStore,
  handler: ReturnType<typeof createOnlineHandler>;
let validInputs: Array<[number, number]>, validTime: number;

beforeAll(() => {
  const race = createOnlineRace(
    "atrium",
    0,
    [{ id: "fixture", name: "Fixture", rider: 0, color: "#ff663f" }],
    true,
  );
  const brain = createRivalBrain(0),
    course = ONLINE_COURSES.atrium;
  validInputs = [];
  while (!race.done) {
    const racer = race.players[0],
      count = course.checkpoints.length;
    const input = driveRival(
      brain,
      racer.state,
      course.checkpoints[racer.checkpoint % count] as Parameters<
        typeof driveRival
      >[2],
      course.checkpoints[(racer.checkpoint + 1) % count] as Parameters<
        typeof driveRival
      >[3],
      [],
      course.width,
      race.tick / 120,
    );
    const mask = encodeOnlineInput(input),
      ticks = Math.min(4, ONLINE_MAX_TICKS - race.tick);
    advanceOnlineRace(race, [mask], ticks);
    const previous = validInputs.at(-1);
    if (previous?.[0] === mask) previous[1] += ticks;
    else validInputs.push([mask, ticks]);
  }
  validTime = validateReplay("atrium", 0, validInputs).timeMs;
}, 20000);

beforeEach(() => {
  vi.stubEnv(
    "ONLINE_SESSION_SECRET",
    "a-private-test-secret-of-at-least-32-bytes",
  );
  vi.stubEnv("ONLINE_ORIGIN", ORIGIN);
  vi.stubEnv("ONLINE_DEV_ORIGIN", "");
  vi.stubEnv("VERCEL", "");
  now = Date.now();
  store = new MemoryStore(() => now);
  handler = createOnlineHandler(store, () => now);
});
afterEach(() => vi.unstubAllEnvs());

async function send(
  body: Record<string, unknown> = {},
  who?: Identity,
  options: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const req = Object.assign(
    Readable.from([Buffer.from(JSON.stringify(body))]),
    {
      method: options.method ?? "POST",
      url: options.url ?? "/api/online",
      rawHeaders: [],
      socket: { remoteAddress: "127.0.0.1" },
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        ...(who ? { cookie: who.cookie, "x-csrf-token": who.csrf } : {}),
        ...options.headers,
      },
    },
  ) as unknown as IncomingMessage;
  const headers = new Map<string, string>();
  let result: Record<string, any> = {};
  const res = {
    statusCode: 200,
    setHeader: (key: string, value: string) =>
      headers.set(key.toLowerCase(), value),
    end: (value: string) => {
      result = JSON.parse(value);
    },
  };
  await handler(req, res as unknown as ServerResponse);
  return { status: res.statusCode, body: result, headers };
}
async function identity(name = "Doodler"): Promise<Identity> {
  const response = await send({ action: "session", name });
  expect(response.status).toBe(200);
  return {
    id: response.body.player.id,
    csrf: response.body.csrf,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
}
async function room(who: Identity): Promise<string> {
  const response = await send(
    { action: "create", track: "atrium", setup: 0 },
    who,
  );
  expect(response.status).toBe(200);
  return response.body.room.code;
}
async function trial(who: Identity): Promise<string> {
  const response = await send(
    { action: "trial", track: "atrium", setup: 0 },
    who,
  );
  expect(response.status).toBe(200);
  return response.body.challenge;
}

describe("online HTTP security boundary", () => {
  it("protects every mutation with origin, authentication and CSRF", async () => {
    const who = await identity();
    expect(
      (await send({ action: "trial", track: "atrium", setup: 0 })).status,
    ).toBe(401);
    expect(
      (
        await send({ action: "trial" }, who, {
          headers: { "x-csrf-token": "" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send({ action: "create" }, who, {
          headers: { origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send({ action: "session" }, undefined, {
          headers: { origin: "null" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send({ action: "session" }, undefined, {
          headers: { origin: "" },
        })
      ).status,
    ).toBe(403);
  });

  it("rejects unknown actions, unsupported methods and untrusted identifiers", async () => {
    const who = await identity();
    expect((await send({ action: "deleteEverything" }, who)).status).toBe(400);
    expect((await send({}, who, { method: "DELETE" })).status).toBe(405);
    for (const track of ["__proto__", "atrium:0", "<script>"])
      expect(
        (await send({ action: "trial", track, setup: 0 }, who)).status,
      ).toBe(400);
    expect(
      (await send({ action: "trial", track: "atrium", setup: 3 }, who)).status,
    ).toBe(400);
    expect(
      (await send({ action: "join", code: "*\r\nFLUSHALL" }, who)).status,
    ).toBe(400);
    expect(
      (
        await send({}, undefined, {
          method: "GET",
          url: "/api/online?action=ghost&id=../secret",
        })
      ).status,
    ).toBe(400);
  });

  it("sets no-store and nosniff headers, and never reflects internal error details", async () => {
    vi.spyOn(store, "limit").mockRejectedValue(
      new Error("SECRET_REDIS_TOKEN_123"),
    );
    const response = await send({ action: "session" });
    expect(response.status).toBe(500);
    expect(response.body.error).not.toContain("SECRET");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rate limits anonymous account creation and includes retry guidance", async () => {
    for (let i = 0; i < 20; i++)
      expect((await send({ action: "session" })).status).toBe(200);
    const response = await send({ action: "session" });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});

describe("private room authority", () => {
  it("does not treat full room capacity as exhausted global allowance", async () => {
    const hosts = await Promise.all(
      Array.from({ length: 5 }, (_, i) => identity(`Host ${i}`)),
    );
    for (const host of hosts.slice(0, 4)) await room(host);
    const denied = await send(
      { action: "create", track: "atrium", setup: 0 },
      hosts[4],
    );
    expect(denied.status).toBe(503);
    expect(denied.body.error).toContain("four club rooms");
    const status = await send({}, undefined, {
      method: "GET",
      url: "/api/online?action=status",
    });
    expect(status.body.available).toBe(true);
    expect(
      (await send({ action: "trial", track: "atrium", setup: 0 }, hosts[4]))
        .status,
    ).toBe(200);
  });

  it("releases capacity when the last human leaves, including rooms with bots", async () => {
    const host = await identity("Host");
    for (let i = 0; i < 6; i++) {
      const code = await room(host);
      if (i % 2 === 0)
        expect((await send({ action: "start", code }, host)).status).toBe(200);
      expect((await send({ action: "leave", code }, host)).status).toBe(200);
      expect(await store.get("room:" + code)).toBeNull();
      expect(await store.get("capacity")).toEqual([]);
      expect(await store.get("member:" + host.id)).toBeNull();
    }
  });

  it("requires room membership and allows only the host to start", async () => {
    const host = await identity("Host"),
      guest = await identity("Guest"),
      stranger = await identity("Stranger");
    const code = await room(host);
    for (const action of ["sync", "start", "leave", "rematch"])
      expect(
        (await send({ action, code, sequence: 0, input: 1 }, stranger)).status,
      ).toBe(403);
    expect((await send({ action: "join", code }, guest)).status).toBe(200);
    expect((await send({ action: "start", code }, guest)).status).toBe(403);
    const started = await send({ action: "start", code }, host);
    expect(started.status).toBe(200);
    expect(started.body.room.players).toHaveLength(4);
    expect(started.body.room.status).toBe("countdown");
    expect((await send({ action: "join", code }, stranger)).status).toBe(409);
  });

  it("disallows membership in two rooms, including concurrent join requests", async () => {
    const hostA = await identity("Host A"),
      hostB = await identity("Host B"),
      guest = await identity("Guest");
    const a = await room(hostA),
      b = await room(hostB);
    const results = await Promise.all([
      send({ action: "join", code: a }, guest),
      send({ action: "join", code: b }, guest),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const rooms = await Promise.all([
      store.get<StoredRoom>("room:" + a),
      store.get<StoredRoom>("room:" + b),
    ]);
    expect(
      rooms.filter((r) => r!.players.some((p) => p.id === guest.id)),
    ).toHaveLength(1);
  });

  it("rejects stale input sequences and never accepts client-controlled clock or state", async () => {
    const host = await identity("Host"),
      code = await room(host);
    await send({ action: "start", code }, host);
    await send({ action: "sync", code, sequence: 5, input: 1 }, host);
    await send(
      {
        action: "sync",
        code,
        sequence: 4,
        input: 255,
        tick: 21600,
        state: { x: 999999 },
        finished: true,
      },
      host,
    );
    let stored = await store.get<StoredRoom>("room:" + code);
    expect(stored!.sequences[host.id]).toBe(5);
    expect(stored!.inputs[host.id]).toBe(1);
    expect(stored!.race!.tick).toBe(0);
    now += 4500;
    const response = await send(
      { action: "sync", code, sequence: 6, input: 1, tick: 99999 },
      host,
    );
    expect(response.body.room.race.tick).toBe(60);
    expect(response.body.room.status).toBe("race");
    expect(
      (await send({ action: "sync", code, sequence: 7, input: 256 }, host))
        .status,
    ).toBe(400);
    expect(
      (await send({ action: "sync", code, sequence: -1, input: 0 }, host))
        .status,
    ).toBe(400);
  });

  it("bounds abandoned-race catchup and expires rooms after ten minutes", async () => {
    const host = await identity("Host"),
      code = await room(host);
    await send({ action: "start", code }, host);
    now += 10000;
    const stalled = await send(
      { action: "sync", code, sequence: 0, input: 1 },
      host,
    );
    expect(stalled.body.room.status).toBe("finished");
    expect(stalled.body.room.race.tick).toBe(0);
    now += 600000;
    expect(
      (await send({ action: "sync", code, sequence: 1, input: 1 }, host))
        .status,
    ).toBe(404);
  });

  it("transfers host authority after leaving and invalidates the former member", async () => {
    const host = await identity("Host"),
      guest = await identity("Guest"),
      code = await room(host);
    await send({ action: "join", code }, guest);
    await send({ action: "leave", code }, host);
    expect((await send({ action: "start", code }, host)).status).toBe(403);
    expect((await send({ action: "start", code }, guest)).status).toBe(200);
    expect(await store.get("member:" + host.id)).toBeNull();
  });
});

describe("verified records and ghosts", () => {
  it("returns the same saved receipt on retry without trusting a replacement score", async () => {
    const owner = await identity("Owner"),
      attacker = await identity("Attacker"),
      challenge = await trial(owner);
    now += validTime + 2000;
    const first = await send(
      { action: "submit", challenge, inputs: validInputs },
      owner,
    );
    expect(first.status).toBe(200);
    const retry = await send(
      { action: "submit", challenge, inputs: [[0, 1]], time: 0.001 },
      owner,
    );
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(
      (
        await send(
          { action: "submit", challenge, inputs: validInputs },
          attacker,
        )
      ).status,
    ).toBe(403);
    const board = await store.get<{ all: unknown[] }>("board:atrium:0");
    expect(board?.all).toHaveLength(1);
  });

  it("bounds verification jobs and preserves a busy player's unused pass", async () => {
    const owner = await identity("Owner"),
      challenge = await trial(owner);
    now += validTime + 2000;
    const first = await store.lock("verification:0"),
      second = await store.lock("verification:1");
    expect(
      (await send({ action: "submit", challenge, inputs: validInputs }, owner))
        .status,
    ).toBe(429);
    expect(await store.get("trial:" + challenge)).not.toBeNull();
    await store.unlock("verification:0", first!);
    expect(
      (await send({ action: "submit", challenge, inputs: validInputs }, owner))
        .status,
    ).toBe(200);
    expect(await store.lock("verification:0")).not.toBeNull();
    await store.unlock("verification:1", second!);
  });

  it("does not consume a trial pass when the CSRF token is invalid", async () => {
    const owner = await identity("Owner"),
      challenge = await trial(owner);
    const denied = await send(
      { action: "submit", challenge, inputs: validInputs },
      owner,
      { headers: { "x-csrf-token": "x".repeat(43) } },
    );
    expect(denied.status).toBe(403);
    expect(await store.get("trial:" + challenge)).not.toBeNull();
    now += validTime + 2000;
    expect(
      (await send({ action: "submit", challenge, inputs: validInputs }, owner))
        .status,
    ).toBe(200);
  });

  it("does not let another player burn a stolen trial pass", async () => {
    const owner = await identity("Owner"),
      attacker = await identity("Attacker"),
      challenge = await trial(owner);
    const response = await send(
      { action: "submit", challenge, inputs: [[0, 1]] },
      attacker,
    );
    expect(response.status).toBe(403);
    expect(await store.get("trial:" + challenge)).not.toBeNull();
  });

  it("consumes invalid submissions once and rejects forged score/state fields", async () => {
    const who = await identity(),
      challenge = await trial(who);
    const forged = {
      action: "submit",
      challenge,
      inputs: [[0, 1]],
      time: 0.01,
      laps: 3,
      finished: true,
      frames: [[0, 0, 0, 0]],
    };
    expect((await send(forged, who)).status).toBe(400);
    expect((await send(forged, who)).status).toBe(403);
    expect(await store.get("board:atrium:0")).toBeNull();
  });

  it("rejects even a valid replay submitted faster than elapsed real time", async () => {
    const who = await identity(),
      challenge = await trial(who);
    expect(
      (await send({ action: "submit", challenge, inputs: validInputs }, who))
        .status,
    ).toBe(400);
    expect(await store.get("board:atrium:0")).toBeNull();
  });

  it("stores only verified times and signed names, publishes a bounded ghost and hides player ids", async () => {
    const who = await identity("Lab Partner"),
      challenge = await trial(who);
    now += validTime + 2000;
    const submitted = await send(
      {
        action: "submit",
        challenge,
        inputs: validInputs,
        time: 0.001,
        name: "<img src=x onerror=alert(1)>",
        playerId: "admin",
        track: "courtyard",
        setup: 2,
      },
      who,
    );
    expect(submitted.status).toBe(200);
    expect(submitted.body.record.time).toBe(validTime / 1000);
    expect(submitted.body.record.name).toBe("Lab Partner");
    expect(submitted.body.record.track).toBe("atrium");
    expect(submitted.body.record).not.toHaveProperty("playerId");
    const records = await send({}, undefined, {
      method: "GET",
      url: "/api/online?action=records&track=atrium&setup=0",
    });
    expect(records.body.records).toHaveLength(1);
    expect(records.body.records[0]).not.toHaveProperty("playerId");
    const ghost = await send({}, undefined, {
      method: "GET",
      url: "/api/online?action=ghost&id=" + submitted.body.ghostId,
    });
    expect(ghost.status).toBe(200);
    expect(ghost.body.ghost.frames.length).toBeLessThanOrEqual(1802);
    expect(ghost.body.ghost.name).toBe("Lab Partner");
    const retry = await send(
      { action: "submit", challenge, inputs: validInputs },
      who,
    );
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(submitted.body);
  });

  it("rejects HTML and prototype injection before creating identities or trial records", async () => {
    expect(
      (await send({ action: "session", name: "<b>Hacker</b>" })).status,
    ).toBe(400);
    const injected = JSON.parse(
      '{"action":"session","name":"Hacker","nested":{"__proto__":{"admin":true}}}',
    );
    expect((await send(injected)).status).toBe(400);
    const who = await identity(),
      challenge = await trial(who);
    now += 601000;
    expect(
      (await send({ action: "submit", challenge, inputs: validInputs }, who))
        .status,
    ).toBe(403);
  });
});

describe("store atomicity and leases", () => {
  it("caches global quota rejection for a fixed minute across POST and GET requests", async () => {
    const who = await identity();
    const quotaKey = `quota:${new Date(now).toISOString().slice(0, 7)}`;
    await store.set(quotaKey, 30000, 2678400);
    const limiter = vi.spyOn(store, "limit");
    const first = await send(
      { action: "trial", track: "atrium", setup: 0 },
      who,
    );
    expect(first.status).toBe(503);
    expect(limiter).toHaveBeenCalledTimes(1);
    now += 30000;
    expect((await send({ action: "session" })).status).toBe(503);
    expect(
      (
        await send({}, undefined, {
          method: "GET",
          url: "/api/online?action=records&track=atrium&setup=0",
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await send({}, undefined, {
          method: "GET",
          url: "/api/online?action=status",
        })
      ).body.available,
    ).toBe(false);
    expect(limiter).toHaveBeenCalledTimes(1);
    // A cached rejection must not renew the deadline on every incoming request.
    await store.set(quotaKey, 0, 2678400);
    now += 30001;
    expect(
      (await send({ action: "trial", track: "atrium", setup: 0 }, who)).status,
    ).toBe(200);
    expect(limiter).toHaveBeenCalledTimes(2);
  });

  it("also activates the quota cache when a public GET first hits exhaustion", async () => {
    const quotaKey = `quota:${new Date(now).toISOString().slice(0, 7)}`;
    await store.set(quotaKey, 30000, 2678400);
    const limiter = vi.spyOn(store, "limit");
    const options = {
      method: "GET",
      url: "/api/online?action=records&track=atrium&setup=0",
    };
    expect((await send({}, undefined, options)).status).toBe(503);
    expect((await send({}, undefined, options)).status).toBe(503);
    expect(limiter).toHaveBeenCalledTimes(1);
  });

  it("consumes a one-time value exactly once under concurrent requests", async () => {
    await store.set("one-time", { owner: "A" }, 60);
    const results = await Promise.all([
      store.take("one-time"),
      store.take("one-time"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("prevents an expired holder from committing or unlocking a replacement lease", async () => {
    const first = await store.lock("room");
    expect(await store.lock("room")).toBeNull();
    now += 8001;
    const next = await store.lock("room");
    expect(next).toBeTruthy();
    await expect(
      store.commit("room", first!, "stale", 60),
    ).rejects.toMatchObject({ status: 409 });
    await store.unlock("room", first!);
    expect(await store.lock("room")).toBeNull();
    await store.commit("room", next!, "fresh", 60);
    expect(await store.get("room")).toBe("fresh");
    await expect(
      locked(store, "room", async () => {
        throw new Error("cancelled");
      }),
    ).rejects.toThrow("cancelled");
    expect(await store.lock("room")).toBeTruthy();
  });
});
