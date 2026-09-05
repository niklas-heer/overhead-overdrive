import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface Session {
  id: string;
  name: string;
  /** Unix seconds, matching the signed cookie's absolute expiry. */
  expires: number;
}

const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const MAX_JSON_BYTES = 256 * 1024;
const DEFAULT_ORIGIN = "https://overhead-overdrive.vercel.app";

function secret(): string {
  const value = process.env.ONLINE_SESSION_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32)
    throw new HttpError(503, "Online play is not configured.");
  return value;
}

function devOrigin(): string | null {
  const value = process.env.ONLINE_DEV_ORIGIN;
  if (!value || process.env.NODE_ENV === "production") return null;
  try {
    const url = new URL(value);
    if (
      url.origin === value &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      return value;
  } catch {
    /* Invalid explicit development settings fail closed. */
  }
  throw new HttpError(503, "Online play is not configured.");
}

function cookieName(): string {
  return devOrigin() ? "overdrive-dev" : "__Host-overdrive";
}

/** Reject duplicate security headers rather than relying on Node's coalescing. */
function header(req: IncomingMessage, name: string): string | undefined {
  const matches = (req.rawHeaders ?? [])
    .filter((_, i) => i % 2 === 0)
    .filter((key) => key.toLowerCase() === name).length;
  const value = req.headers[name];
  if (matches > 1 || Array.isArray(value))
    throw new HttpError(400, "Ambiguous request headers.");
  return value;
}

export function checkOrigin(req: IncomingMessage): void {
  const configured = process.env.ONLINE_ORIGIN ?? DEFAULT_ORIGIN;
  let expected: string;
  try {
    const url = new URL(configured);
    if (url.origin !== configured || url.protocol !== "https:")
      throw new Error();
    expected = url.origin;
  } catch {
    throw new HttpError(503, "Online play is not configured.");
  }
  const origin = header(req, "origin");
  const dev = devOrigin();
  if (!origin || (origin !== expected && origin !== dev))
    throw new HttpError(403, "This request must come from the game.");
}

export function validateName(input: unknown): string {
  if (
    typeof input !== "string" ||
    /[\p{Cc}\p{Cf}]/u.test(input) ||
    input.length > 100
  )
    throw new HttpError(
      400,
      "Use a name of 2–20 letters, numbers, spaces, dots, dashes or underscores.",
    );
  const name = input.normalize("NFKC").trim();
  const length = Array.from(name).length;
  if (length < 2 || length > 20 || !/^[\p{L}\p{N} ._-]+$/u.test(name))
    throw new HttpError(
      400,
      "Use a name of 2–20 letters, numbers, spaces, dots, dashes or underscores.",
    );
  return name;
}

function signature(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function validSession(value: unknown): value is Session {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Session;
  if (Object.keys(value).sort().join(",") !== "expires,id,name") return false;
  if (typeof session.id !== "string" || !/^[a-f0-9]{32}$/.test(session.id))
    return false;
  if (!Number.isSafeInteger(session.expires)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (session.expires <= now || session.expires > now + SESSION_SECONDS + 60)
    return false;
  try {
    return validateName(session.name) === session.name;
  } catch {
    return false;
  }
}

export function createSession(
  name: unknown,
  previous?: Session | null,
): Session {
  secret();
  return {
    id:
      previous && validSession(previous)
        ? previous.id
        : randomBytes(16).toString("hex"),
    name: validateName(name),
    expires: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
}

export function sessionCookie(session: Session): string {
  if (!validSession(session)) throw new HttpError(400, "Invalid session.");
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url",
  );
  const token = `${encoded}.${signature(`session.v1.${encoded}`)}`;
  const secure = devOrigin() ? "" : "; Secure";
  return `${cookieName()}=${token}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${Math.max(0, session.expires - Math.floor(Date.now() / 1000))}; Expires=${new Date(session.expires * 1000).toUTCString()}`;
}

export function readSession(req: IncomingMessage): Session | null {
  secret();
  const raw = header(req, "cookie");
  if (!raw) return null;
  if (raw.length > 16_384) throw new HttpError(400, "Invalid cookies.");
  const name = cookieName();
  const matches = raw
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.split("=", 1)[0] === name);
  if (matches.length > 1) throw new HttpError(400, "Ambiguous session cookie.");
  if (!matches.length) return null;
  const token = matches[0].slice(name.length + 1);
  if (token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))
    return null;
  const [encoded, signed] = token.split(".");
  if (!equal(signature(`session.v1.${encoded}`), signed)) return null;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    return validSession(value) ? value : null;
  } catch {
    return null;
  }
}

export function csrfToken(session: Session): string {
  return signature(`csrf.v1.${session.id}.${session.expires}`);
}

export function requireSession(req: IncomingMessage): Session {
  checkOrigin(req);
  const session = readSession(req);
  if (!session)
    throw new HttpError(401, "Please choose your online name again.");
  const token = header(req, "x-csrf-token");
  if (!token || token.length !== 43 || !equal(csrfToken(session), token))
    throw new HttpError(
      403,
      "Invalid session request. Refresh the game and try again.",
    );
  return session;
}

function checkJson(value: unknown, depth = 0): void {
  if (depth > 24) throw new HttpError(400, "JSON is nested too deeply.");
  if (!value || typeof value !== "object") return;
  const prototype = Object.getPrototypeOf(value);
  if (
    prototype !== Object.prototype &&
    prototype !== Array.prototype &&
    prototype !== null
  )
    throw new HttpError(400, "Invalid JSON object.");
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype")
      throw new HttpError(400, "Forbidden JSON key.");
    checkJson((value as Record<string, unknown>)[key], depth + 1);
  }
}

export async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  if (req.method !== "POST")
    throw new HttpError(405, "Use POST for online requests.");
  const contentType = header(req, "content-type");
  if (
    !contentType ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(contentType)
  )
    throw new HttpError(415, "Send JSON with Content-Type application/json.");
  const length = header(req, "content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES))
    throw new HttpError(413, "Request is too large.");
  const encoding = header(req, "content-encoding");
  if (encoding && encoding !== "identity")
    throw new HttpError(415, "Compressed requests are not accepted.");

  let value: unknown;
  // Vercel may supply an already parsed body; raw Node requests use the stream.
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  try {
    if (
      parsed !== undefined &&
      typeof parsed === "object" &&
      !Buffer.isBuffer(parsed)
    ) {
      checkJson(parsed);
      if (Buffer.byteLength(JSON.stringify(parsed), "utf8") > MAX_JSON_BYTES)
        throw new HttpError(413, "Request is too large.");
      value = parsed;
    } else {
      let raw: Buffer;
      if (typeof parsed === "string" || Buffer.isBuffer(parsed)) {
        raw = Buffer.from(parsed);
      } else {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > MAX_JSON_BYTES)
            throw new HttpError(413, "Request is too large.");
          chunks.push(buffer);
        }
        raw = Buffer.concat(chunks);
      }
      if (raw.length > MAX_JSON_BYTES)
        throw new HttpError(413, "Request is too large.");
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new HttpError(400, "Send a JSON object.");
    checkJson(value);
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON.");
  }
}
