import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  advanceOnlineRace,
  createOnlineRace,
  ONLINE_VERSION,
  validateReplay,
} from "../src/online-race.ts";
import {
  checkOrigin,
  createSession,
  csrfToken,
  HttpError,
  readJson,
  readSession,
  requireSession,
  sessionCookie,
} from "./security.ts";
import { locked, RedisStore, type Store } from "./store.ts";

type Race = ReturnType<typeof createOnlineRace>;
type Player = {
  id: string;
  name: string;
  rider: number;
  color: string;
  bot?: boolean;
};
type Room = {
  code: string;
  hostId: string;
  track: string;
  setup: number;
  status: "lobby" | "countdown" | "race" | "finished";
  players: Player[];
  race: Race | null;
  startAt: number;
  createdAt: number;
  sequences: Record<string, number>;
  inputs: Record<string, number>;
  seen: Record<string, number>;
};
type RecordEntry = {
  id: string;
  name: string;
  time: number;
  track: string;
  setup: number;
  createdAt: number;
  ghostId: string;
  playerId: string;
};
type Board = { all: RecordEntry[]; week: RecordEntry[]; weekId: string };
type Challenge = {
  playerId: string;
  track: string;
  setup: number;
  createdAt: number;
  version: string;
};
const id = () => randomBytes(12).toString("hex");
const colors = ["#ff663f", "#5b9c94", "#edc658", "#7994c6", "#ece4ce"];
const trackValue = (value: unknown) => {
  if (
    typeof value !== "string" ||
    !["atrium", "chemistry", "courtyard"].includes(value)
  )
    throw new HttpError(400, "Choose a valid track.");
  return value;
};
const integer = (value: unknown, min: number, max: number, label: string) => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new HttpError(400, `Invalid ${label}.`);
  return value;
};
const keyValue = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/.test(value))
    throw new HttpError(400, "That invite or record link is invalid.");
  return value;
};
const appearance = (body: Record<string, unknown>) => ({
  rider: integer(body.rider ?? 0, 0, 3, "rider"),
  color:
    typeof body.color === "string" && colors.includes(body.color)
      ? body.color
      : colors[0],
});
const weekKey = (now: number) => {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
function publicRecord(entry: RecordEntry) {
  const { playerId: _, ...record } = entry;
  return record;
}
function publicRoom(room: Room, now: number) {
  return {
    code: room.code,
    hostId: room.hostId,
    track: room.track,
    setup: room.setup,
    status: room.status,
    players: room.players,
    race: room.race,
    startAt: room.startAt,
    serverNow: now,
    sequence: room.race?.tick ?? 0,
  };
}

export function createOnlineHandler(
  store: Store = new RedisStore(),
  clock = () => Date.now(),
) {
  // Short-lived instance caches reduce public read cost and repeated quota rejection.
  const cache = new Map<string, { value: unknown; until: number }>();
  let budgetBlockedUntil = 0;
  return async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (value: unknown) => res.end(JSON.stringify(value));
    try {
      const now = clock();
      const url = new URL(
        req.url || "/",
        "https://overhead-overdrive.vercel.app",
      );
      if (req.method !== "GET" && req.method !== "POST")
        throw new HttpError(405, "Method not allowed.");
      if (req.method === "GET") {
        const action = url.searchParams.get("action");
        if (action !== "records" && action !== "ghost" && action !== "status")
          throw new HttpError(400, "Unknown online request.");
        if (action === "status") {
          send({
            version: ONLINE_VERSION,
            available: budgetBlockedUntil < now,
          });
          return;
        }
        if (budgetBlockedUntil > now)
          throw new HttpError(
            503,
            "The free online allowance is resting. Offline racing is still open.",
          );
        const key =
          action === "records"
            ? `board:${trackValue(url.searchParams.get("track"))}:${integer(Number(url.searchParams.get("setup")), 0, 2, "setup")}`
            : `ghost:${keyValue(url.searchParams.get("id"))}`;
        let value = cache.get(key);
        if (!value || value.until < now) {
          await budget(req, store, now, "read", undefined);
          const data = await store.get(key);
          if (cache.size >= 64) cache.delete(cache.keys().next().value!);
          value = { value: data, until: now + 15000 };
          cache.set(key, value);
        }
        if (action === "ghost") {
          if (!value.value)
            throw new HttpError(
              404,
              "This ghost has retired from the record board.",
            );
          send({ ghost: value.value });
          return;
        }
        const board = value.value as Board | null;
        const period =
          url.searchParams.get("period") === "week" ? "week" : "all";
        const entries =
          period === "week" && board?.weekId !== weekKey(now)
            ? []
            : (board?.[period] ?? []);
        send({ records: entries.map(publicRecord), version: ONLINE_VERSION });
        return;
      }
      checkOrigin(req);
      const body = await readJson(req);
      const action = body.action;
      if (
        typeof action !== "string" ||
        ![
          "session",
          "trial",
          "submit",
          "create",
          "join",
          "start",
          "sync",
          "leave",
          "rematch",
        ].includes(action)
      )
        throw new HttpError(400, "Unknown online request.");
      if (budgetBlockedUntil > now)
        throw new HttpError(
          503,
          "The free online allowance is resting. Offline racing is still open.",
        );
      if (action === "session") {
        const previous = readSession(req);
        await budget(req, store, now, action, previous?.id);
        const session = createSession(
          body.name ??
            previous?.name ??
            `Borrower ${randomBytes(2).toString("hex")}`,
          previous ?? undefined,
        );
        res.setHeader("Set-Cookie", sessionCookie(session));
        send({
          player: { id: session.id, name: session.name },
          csrf: csrfToken(session),
        });
        return;
      }
      const session = requireSession(req);
      try {
        await budget(req, store, now, action, session.id);
      } catch (error) {
        if (error instanceof HttpError && error.status === 503)
          budgetBlockedUntil = now + 60000;
        throw error;
      }
      if (action === "trial") {
        const track = trackValue(body.track),
          setup = integer(body.setup, 0, 2, "setup");
        const challenge = id();
        await store.set(
          "trial:" + challenge,
          {
            playerId: session.id,
            track,
            setup,
            createdAt: now,
            version: ONLINE_VERSION,
          },
          600,
        );
        send({ challenge, expiresAt: now + 600000, version: ONLINE_VERSION });
        return;
      }
      if (action === "submit") {
        const challengeId = keyValue(body.challenge);
        const receipt = await store.get<{ playerId: string; result: unknown }>(
          "receipt:" + challengeId,
        );
        if (receipt) {
          if (receipt.playerId !== session.id)
            throw new HttpError(403, "This result belongs to another player.");
          send(receipt.result);
          return;
        }
        // Check ownership before consuming: another player cannot burn a stolen challenge id.
        const check = await store.get<Challenge>("trial:" + challengeId);
        if (!check || check.playerId !== session.id)
          throw new HttpError(
            403,
            "This race pass is expired or belongs to another player.",
          );
        // Bound simultaneous expensive replay verification without consuming a busy player's pass.
        let slot: { key: string; token: string } | null = null;
        for (let i = 0; i < 2 && !slot; i++) {
          const key = `verification:${i}`;
          const token = await store.lock(key);
          if (token) slot = { key, token };
        }
        if (!slot)
          throw new HttpError(
            429,
            "The record office is checking other runs. Try again shortly.",
          );
        let challenge: Challenge;
        let verified: ReturnType<typeof validateReplay>;
        try {
          const consumed = await store.take<Challenge>("trial:" + challengeId);
          if (
            !consumed ||
            consumed.playerId !== session.id ||
            consumed.version !== ONLINE_VERSION
          )
            throw new HttpError(409, "This race pass has already been used.");
          challenge = consumed;
          try {
            verified = validateReplay(
              challenge.track,
              challenge.setup,
              body.inputs as [number, number][],
            );
          } catch {
            throw new HttpError(
              400,
              "The replay could not be verified. Start a fresh time trial.",
            );
          }
          if (
            now - challenge.createdAt + 2000 <
            (verified.elapsedTicks * 1000) / 120
          )
            throw new HttpError(
              400,
              "That run arrived before the race could finish.",
            );
        } finally {
          await store.unlock(slot.key, slot.token);
        }
        const record: RecordEntry = {
          id: id(),
          name: session.name,
          time: verified.timeMs / 1000,
          track: challenge.track,
          setup: challenge.setup,
          createdAt: now,
          ghostId: "",
          playerId: session.id,
        };
        record.ghostId = record.id;
        const boardKey = `board:${record.track}:${record.setup}`;
        const result = await locked(store, boardKey, async (token) => {
          const board = (await store.get<Board>(boardKey)) ?? {
            all: [],
            week: [],
            weekId: weekKey(now),
          };
          const previousIds = new Set(
            [...board.all, ...board.week].map((r) => r.id),
          );
          if (board.weekId !== weekKey(now)) {
            board.week = [];
            board.weekId = weekKey(now);
          }
          for (const period of ["all", "week"] as const) {
            const previous = board[period].find(
              (r) => r.playerId === session.id,
            );
            if (!previous || previous.time > record.time) {
              board[period] = [
                ...board[period].filter((r) => r.playerId !== session.id),
                record,
              ]
                .sort((a, b) => a.time - b.time || a.createdAt - b.createdAt)
                .slice(0, 50);
            }
          }
          const retained = new Set(
            [...board.all, ...board.week].map((r) => r.id),
          );
          if (retained.has(record.id))
            await store.set(
              "ghost:" + record.id,
              {
                id: record.id,
                name: record.name,
                time: record.time,
                track: record.track,
                setup: record.setup,
                frames: verified.ghost.map(([tick, x, z, yaw]) => [
                  tick / 120,
                  x,
                  z,
                  yaw,
                ]),
                version: ONLINE_VERSION,
              },
              31536000,
            );
          await store.commit(boardKey, token, board, 31536000);
          // Delete only records no longer referenced by either board. TTL also bounds crash leftovers.
          await store
            .removeMany(
              [...previousIds]
                .filter((old) => !retained.has(old))
                .map((old) => "ghost:" + old),
            )
            .catch(() => {});
          cache.delete(boardKey);
          const best = board.all.find((r) => r.playerId === session.id);
          return {
            record: publicRecord(record),
            rank:
              board.all.findIndex((r) => r.playerId === session.id) + 1 || null,
            ghostId: retained.has(record.id)
              ? record.id
              : (best?.ghostId ?? null),
          };
        });
        await store.set(
          "receipt:" + challengeId,
          { playerId: session.id, result },
          600,
        );
        send(result);
        return;
      }
      if (action === "create") {
        const track = trackValue(body.track),
          setup = integer(body.setup, 0, 2, "setup");
        const room: Room = {
          code: id(),
          hostId: session.id,
          track,
          setup,
          status: "lobby",
          players: [
            { id: session.id, name: session.name, ...appearance(body) },
          ],
          race: null,
          startAt: 0,
          createdAt: now,
          sequences: {},
          inputs: {},
          seen: { [session.id]: now },
        };
        await locked(store, "member:" + session.id, () =>
          locked(store, "capacity", async (token) => {
            const active = (
              (await store.get<{ code: string; expires: number }[]>(
                "capacity",
              )) ?? []
            ).filter((r) => r.expires > now);
            if (active.length >= 4)
              throw new HttpError(
                503,
                "All four club rooms are busy. Try again in a few minutes.",
              );
            const current = await store.get<string>("member:" + session.id);
            if (current && (await store.get("room:" + current)))
              throw new HttpError(
                409,
                "Leave your existing room before opening another.",
              );
            await store.set("room:" + room.code, room, 600);
            await store.set("member:" + session.id, room.code, 600);
            await store.commit(
              "capacity",
              token,
              [...active, { code: room.code, expires: now + 600000 }],
              660,
            );
          }),
        );
        send({ room: publicRoom(room, now) });
        return;
      }
      const code = keyValue(body.code),
        roomKey = "room:" + code;
      const mutateRoom = () =>
        locked(store, roomKey, async (token) => {
          const room = await store.get<Room>(roomKey);
          if (!room || now - room.createdAt >= 600000)
            throw new HttpError(
              404,
              "This club room has closed. Create a new one.",
            );
          const member = room.players.find(
            (p) => p.id === session.id && !p.bot,
          );
          if (action !== "join" && !member)
            throw new HttpError(
              403,
              "Join this room before controlling a racer.",
            );
          if (action === "join") {
            if (room.status !== "lobby")
              throw new HttpError(
                409,
                "This race has already started. Ask your friend for a rematch.",
              );
            if (!member) {
              if (room.players.length >= 4)
                throw new HttpError(409, "This room already has four racers.");
              const current = await store.get<string>("member:" + session.id);
              if (
                current &&
                current !== code &&
                (await store.get("room:" + current))
              )
                throw new HttpError(409, "Leave your other room first.");
              room.players.push({
                id: session.id,
                name: session.name,
                ...appearance(body),
              });
              await store.set("member:" + session.id, code, 600);
            }
            room.seen[session.id] = now;
          } else if (action === "start" || action === "rematch") {
            if (room.hostId !== session.id)
              throw new HttpError(403, "Only the host can start the race.");
            if (action === "start" && room.status !== "lobby")
              throw new HttpError(409, "The race has already started.");
            if (action === "rematch" && room.status !== "finished")
              throw new HttpError(
                409,
                "Finish the current race before a rematch.",
              );
            room.players = room.players.filter((p) => !p.bot);
            if (action === "rematch") {
              room.status = "lobby";
              room.race = null;
              room.startAt = 0;
            } else {
              const botNames = ["The Prefect", "Turbo Tutor", "Loose Caster"];
              while (room.players.length < 4) {
                const i = room.players.length;
                room.players.push({
                  id: `bot-${i}`,
                  name: botNames[i - 1],
                  rider: i,
                  color: colors[i],
                  bot: true,
                });
              }
              room.race = createOnlineRace(
                room.track,
                room.setup,
                room.players,
                false,
              );
              room.startAt = now + 4000;
              room.status = "countdown";
            }
            room.inputs = {};
            room.sequences = {};
          } else if (action === "leave") {
            room.players = room.players.filter((p) => p.id !== session.id);
            if (room.race) {
              const racer = room.race.players.find((p) => p.id === session.id);
              if (racer) racer.bot = true;
            }
            await store.remove("member:" + session.id);
            if (room.hostId === session.id)
              room.hostId = room.players.find((p) => !p.bot)?.id ?? "";
          } else if (action === "sync") {
            const sequence = integer(
              body.sequence,
              0,
              1000000,
              "input sequence",
            );
            const input = integer(body.input, 0, 255, "input");
            if (
              room.race &&
              room.startAt <= now &&
              room.status !== "finished"
            ) {
              const target = Math.floor(((now - room.startAt) * 120) / 1000);
              const gap = target - room.race.tick;
              if (gap > 600 || target > 21600) room.status = "finished";
              else {
                const inputs = room.race.players.map((p) =>
                  now - (room.seen[p.id] ?? 0) > 1000
                    ? 0
                    : (room.inputs[p.id] ?? 0),
                );
                advanceOnlineRace(room.race, inputs, Math.max(0, gap));
                room.status = room.race.players
                  .filter((p) => !p.bot)
                  .every((p) => p.finished)
                  ? "finished"
                  : "race";
              }
            }
            if (sequence > (room.sequences[session.id] ?? -1)) {
              room.sequences[session.id] = sequence;
              room.inputs[session.id] = input;
            }
            room.seen[session.id] = now;
          }
          await store.commit(
            roomKey,
            token,
            room,
            Math.max(1, Math.ceil((room.createdAt + 600000 - now) / 1000)),
          );
          return publicRoom(room, now);
        });
      const roomResult =
        action === "join"
          ? await locked(store, "member:" + session.id, mutateRoom)
          : await mutateRoom();
      if (action === "leave" && !roomResult.players.some((p) => !p.bot)) {
        await store.remove(roomKey);
        // Capacity is separate from room state; no room lock is held here.
        await locked(store, "capacity", async (token) => {
          const active = (
            (await store.get<{ code: string; expires: number }[]>(
              "capacity",
            )) ?? []
          ).filter((entry) => entry.code !== code && entry.expires > now);
          await store.commit("capacity", token, active, 660);
        });
      }
      send({ room: roomResult });
    } catch (error) {
      const known = error instanceof HttpError;
      if (
        known &&
        error.status === 503 &&
        error.message ===
          "The free online allowance is resting. Offline racing is still open." &&
        budgetBlockedUntil <= clock()
      )
        budgetBlockedUntil = clock() + 60000;
      res.statusCode = known ? error.status : 500;
      if (res.statusCode === 429 || res.statusCode === 503)
        res.setHeader("Retry-After", "60");
      send({
        error: known
          ? error.message
          : "The online club hit a snag. Please try again.",
      });
    }
  };
}

async function budget(
  req: IncomingMessage,
  store: Store,
  now: number,
  action: string,
  playerId?: string,
) {
  // On Vercel this header is platform-derived. Locally use the socket address.
  const address = process.env.VERCEL
    ? String(
        req.headers["x-vercel-forwarded-for"] ||
          req.headers["x-forwarded-for"] ||
          "",
      )
    : req.socket.remoteAddress || "local";
  const ip = createHash("sha256").update(address).digest("hex").slice(0, 24);
  const minute = Math.floor(now / 60000),
    hour = Math.floor(now / 3600000);
  const month = new Date(now).toISOString().slice(0, 7);
  const expensive = action === "submit";
  const max =
    action === "sync"
      ? 600
      : action === "read"
        ? 240
        : action === "session"
          ? 20
          : expensive
            ? 10
            : 30;
  const window = action === "session" || expensive ? hour : minute;
  const seconds = action === "session" || expensive ? 3600 : 60;
  if (
    !(await store.limit([
      {
        key: `rate:${action}:${playerId || ip}:${window}`,
        max,
        seconds: seconds + 1,
      },
      { key: `quota:${month}`, max: 30000, seconds: 2678400 },
    ]))
  ) {
    if (((await store.get<number>(`quota:${month}`)) ?? 0) >= 30000)
      throw new HttpError(
        503,
        "The free online allowance is resting. Offline racing is still open.",
      );
    throw new HttpError(
      429,
      "Too many online requests. Wait a moment; offline racing is open.",
    );
  }
}

export default createOnlineHandler();
