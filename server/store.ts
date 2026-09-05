import { randomBytes } from "node:crypto";
import { HttpError } from "./security.ts";

export interface Limit {
  key: string;
  max: number;
  seconds: number;
}
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, seconds: number): Promise<void>;
  take<T>(key: string): Promise<T | null>;
  remove(key: string): Promise<void>;
  removeMany(keys: string[]): Promise<void>;
  limit(limits: Limit[]): Promise<boolean>;
  lock(key: string): Promise<string | null>;
  commit(
    key: string,
    token: string,
    value: unknown,
    seconds: number,
  ): Promise<void>;
  unlock(key: string, token: string): Promise<void>;
}

const prefix = "overdrive:online:v1:";
export class RedisStore implements Store {
  private committed = new Set<string>();
  async command(command: (string | number)[]): Promise<unknown> {
    const url =
      process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token || !/^https:\/\/[a-z0-9.-]+\.upstash\.io\/?$/.test(url))
      throw new HttpError(
        503,
        "The online club is not connected yet. Offline racing is ready.",
      );
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(3500),
      });
    } catch {
      throw new HttpError(
        503,
        "The online club is taking a breather. Try again shortly.",
      );
    }
    if (!response.ok)
      throw new HttpError(
        503,
        "Online storage is temporarily unavailable. Offline racing still works.",
      );
    const result = (await response.json()) as {
      result?: unknown;
      error?: string;
    };
    if (result.error)
      throw new HttpError(
        503,
        "Online storage is temporarily unavailable. Offline racing still works.",
      );
    return result.result;
  }
  async get<T>(key: string) {
    const value = await this.command(["GET", prefix + key]);
    return value === null ? null : (JSON.parse(String(value)) as T);
  }
  async set(key: string, value: unknown, seconds: number) {
    await this.command([
      "SET",
      prefix + key,
      JSON.stringify(value),
      "EX",
      seconds,
    ]);
  }
  async take<T>(key: string) {
    const value = await this.command(["GETDEL", prefix + key]);
    return value === null ? null : (JSON.parse(String(value)) as T);
  }
  async remove(key: string) {
    await this.command(["DEL", prefix + key]);
  }
  async removeMany(keys: string[]) {
    if (keys.length)
      await this.command(["DEL", ...keys.map((key) => prefix + key)]);
  }
  async limit(limits: Limit[]) {
    const script = `for i,key in ipairs(KEYS) do
      local n=redis.call('INCR',key)
      if n==1 then redis.call('EXPIRE',key,tonumber(ARGV[i*2])) end
      if n>tonumber(ARGV[i*2-1]) then return 0 end
    end
    return 1`;
    return (
      (await this.command([
        "EVAL",
        script,
        limits.length,
        ...limits.map((l) => prefix + l.key),
        ...limits.flatMap((l) => [l.max, l.seconds]),
      ])) === 1
    );
  }
  async lock(key: string) {
    const token = randomBytes(16).toString("hex");
    return (await this.command([
      "SET",
      prefix + "lock:" + key,
      token,
      "NX",
      "PX",
      8000,
    ])) === "OK"
      ? token
      : null;
  }
  async commit(key: string, token: string, value: unknown, seconds: number) {
    const result = await this.command([
      "EVAL",
      `if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
      redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]); redis.call('DEL',KEYS[1]); return 1`,
      2,
      prefix + "lock:" + key,
      prefix + key,
      token,
      JSON.stringify(value),
      seconds,
    ]);
    if (result !== 1)
      throw new HttpError(
        409,
        "The room changed while updating. Please retry.",
      );
    this.committed.add(token);
  }
  async unlock(key: string, token: string) {
    if (this.committed.delete(token)) return;
    await this.command([
      "EVAL",
      `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`,
      1,
      prefix + "lock:" + key,
      token,
    ]);
  }
}

/** Isolated test/dev implementation. Production always uses durable Redis. */
export class MemoryStore implements Store {
  private values = new Map<string, { value: unknown; until: number }>();
  constructor(private now = () => Date.now()) {}
  async get<T>(key: string): Promise<T | null> {
    const found = this.values.get(key);
    if (!found || found.until <= this.now()) {
      this.values.delete(key);
      return null;
    }
    return structuredClone(found.value) as T;
  }
  async set(key: string, value: unknown, seconds: number) {
    this.values.set(key, {
      value: structuredClone(value),
      until: this.now() + seconds * 1000,
    });
  }
  async take<T>(key: string): Promise<T | null> {
    const entry = this.values.get(key);
    this.values.delete(key);
    return entry && entry.until > this.now()
      ? (structuredClone(entry.value) as T)
      : null;
  }
  async remove(key: string) {
    this.values.delete(key);
  }
  async removeMany(keys: string[]) {
    for (const key of keys) this.values.delete(key);
  }
  async limit(limits: Limit[]) {
    // No await between reads/writes: this operation is atomic within the test process.
    for (const limit of limits) {
      const old = this.values.get(limit.key);
      const current =
        old && old.until > this.now()
          ? old
          : { value: 0, until: this.now() + limit.seconds * 1000 };
      current.value = Number(current.value) + 1;
      this.values.set(limit.key, current);
      if (Number(current.value) > limit.max) return false;
    }
    return true;
  }
  async lock(key: string) {
    const found = this.values.get("lock:" + key);
    if (found && found.until > this.now()) return null;
    const token = randomBytes(16).toString("hex");
    this.values.set("lock:" + key, { value: token, until: this.now() + 8000 });
    return token;
  }
  async commit(key: string, token: string, value: unknown, seconds: number) {
    const lock = this.values.get("lock:" + key);
    if (!lock || lock.value !== token || lock.until <= this.now())
      throw new HttpError(409, "Room lock expired");
    this.values.set(key, {
      value: structuredClone(value),
      until: this.now() + seconds * 1000,
    });
    this.values.delete("lock:" + key);
  }
  async unlock(key: string, token: string) {
    if (this.values.get("lock:" + key)?.value === token)
      this.values.delete("lock:" + key);
  }
}

export async function locked<T>(
  store: Store,
  key: string,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const token = await store.lock(key);
  if (!token)
    throw new HttpError(
      409,
      "Another racer is updating the room. Please retry.",
    );
  try {
    return await fn(token);
  } finally {
    await store.unlock(key, token);
  }
}
