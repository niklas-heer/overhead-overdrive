import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkOrigin,
  createSession,
  csrfToken,
  HttpError,
  MAX_JSON_BYTES,
  readJson,
  readSession,
  requireSession,
  sessionCookie,
  validateName,
} from "./security";

const origin = "https://overhead-overdrive.vercel.app";
function request(
  body = "{}",
  headers: Record<string, string> = {},
  method = "POST",
): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(body)]), {
    method,
    headers: { origin, "content-type": "application/json", ...headers },
    rawHeaders: [],
  }) as unknown as IncomingMessage;
}
function signedRequest() {
  const session = createSession("The Doodler");
  const cookie = sessionCookie(session).split(";")[0];
  return {
    session,
    cookie,
    req: request("{}", { cookie, "x-csrf-token": csrfToken(session) }),
  };
}

beforeEach(() => {
  vi.stubEnv(
    "ONLINE_SESSION_SECRET",
    "a-private-test-secret-of-at-least-32-bytes",
  );
  vi.stubEnv("ONLINE_ORIGIN", origin);
  vi.stubEnv("ONLINE_DEV_ORIGIN", "");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("anonymous online sessions", () => {
  it("creates an unpredictable identity and a secure host-only cookie", () => {
    const { session, req } = signedRequest();
    expect(session.id).toMatch(/^[a-f0-9]{32}$/);
    expect(createSession("Another Rider").id).not.toBe(session.id);
    expect(sessionCookie(session)).toMatch(/^__Host-overdrive=/);
    expect(sessionCookie(session)).toContain(
      "; Path=/; HttpOnly; Secure; SameSite=Strict;",
    );
    expect(sessionCookie(session)).not.toContain("Domain=");
    expect(readSession(req)).toEqual(session);
    expect(requireSession(req)).toEqual(session);
  });

  it("preserves a valid identity when renaming and refreshes its expiry", () => {
    vi.useFakeTimers();
    const first = createSession("Doodler");
    vi.advanceTimersByTime(2000);
    const next = createSession("Lab Partner", first);
    expect(next.id).toBe(first.id);
    expect(next.expires).toBe(first.expires + 2);
    expect(csrfToken(next)).not.toBe(csrfToken(first));
  });

  it("rejects cookie signature and payload tampering", () => {
    const { cookie } = signedRequest();
    expect(
      readSession(
        request("{}", {
          cookie: cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A"),
        }),
      ),
    ).toBeNull();
    const [name, token] = cookie.split("=");
    const [encoded, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString());
    decoded.name = "Cheater";
    const changed = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    expect(
      readSession(request("{}", { cookie: `${name}=${changed}.${signature}` })),
    ).toBeNull();
  });

  it("rejects expired cookies and does not preserve expired identities", () => {
    vi.useFakeTimers();
    const { req, session } = signedRequest();
    vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000 + 1000);
    expect(readSession(req)).toBeNull();
    expect(createSession("Doodler", session).id).not.toBe(session.id);
    expect(() => requireSession(req)).toThrowError(
      expect.objectContaining({ status: 401 }),
    );
  });

  it("requires session-specific CSRF tokens on authenticated actions", () => {
    const { req } = signedRequest();
    delete req.headers["x-csrf-token"];
    expect(() => requireSession(req)).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    req.headers["x-csrf-token"] = csrfToken(createSession("Somebody Else"));
    expect(() => requireSession(req)).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(() => requireSession(request())).toThrowError(
      expect.objectContaining({ status: 401 }),
    );
  });

  it("rejects duplicate session cookies and CSRF headers", () => {
    const { req, cookie } = signedRequest();
    req.headers.cookie = `${cookie}; ${cookie}`;
    expect(() => readSession(req)).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
    req.headers.cookie = cookie;
    req.rawHeaders = ["X-CSRF-Token", "a", "x-csrf-token", "b"];
    expect(() => requireSession(req)).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });

  it("fails closed when session configuration is missing or too short", () => {
    for (const secret of ["", "too-short"]) {
      vi.stubEnv("ONLINE_SESSION_SECRET", secret);
      expect(() => createSession("Doodler")).toThrowError(
        expect.objectContaining({ status: 503 }),
      );
      expect(() => readSession(request())).toThrowError(
        expect.objectContaining({ status: 503 }),
      );
    }
  });
});

describe("origin boundary and names", () => {
  it("requires the exact configured origin, independent of Host headers", () => {
    expect(() => checkOrigin(request())).not.toThrow();
    for (const foreign of [
      "",
      "null",
      "https://evil.example",
      `${origin}.evil.example`,
      `${origin}/`,
      "http://localhost:5173",
    ]) {
      expect(() =>
        checkOrigin(request("{}", { origin: foreign, host: foreign })),
      ).toThrowError(expect.objectContaining({ status: 403 }));
    }
  });

  it("permits an explicitly configured local development origin with a separate cookie", () => {
    vi.stubEnv("ONLINE_DEV_ORIGIN", "http://localhost:5173");
    expect(() =>
      checkOrigin(request("{}", { origin: "http://localhost:5173" })),
    ).not.toThrow();
    const cookie = sessionCookie(createSession("Doodler"));
    expect(cookie).toMatch(/^overdrive-dev=/);
    expect(cookie).not.toContain("; Secure");
    expect(cookie).toContain("; HttpOnly; SameSite=Strict;");
  });

  it("never allows the development exception in production", () => {
    vi.stubEnv("ONLINE_DEV_ORIGIN", "http://localhost:5173");
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      checkOrigin(request("{}", { origin: "http://localhost:5173" })),
    ).toThrow();
    expect(sessionCookie(createSession("Doodler"))).toContain("; Secure;");
  });

  it("fails closed on malformed origin configuration and duplicate Origin headers", () => {
    vi.stubEnv("ONLINE_ORIGIN", "https://example.com/path");
    expect(() => checkOrigin(request())).toThrowError(
      expect.objectContaining({ status: 503 }),
    );
    vi.stubEnv("ONLINE_ORIGIN", origin);
    const req = request();
    req.rawHeaders = ["Origin", origin, "origin", origin];
    expect(() => checkOrigin(req)).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
    vi.stubEnv("ONLINE_DEV_ORIGIN", "http://evil.example");
    expect(() => checkOrigin(request())).toThrowError(
      expect.objectContaining({ status: 503 }),
    );
  });

  it("normalizes readable names while rejecting markup, invisible characters and excess length", () => {
    expect(validateName("  Lab Ｐartner  ")).toBe("Lab Partner");
    expect(validateName("Müller.42_-")).toBe("Müller.42_-");
    for (const name of [
      "<script>",
      "A\nB",
      "A\u200bB",
      "a",
      "a".repeat(21),
      "    ",
      {},
      "a/b",
      "a@b",
    ])
      expect(() => validateName(name)).toThrow(HttpError);
  });
});

describe("bounded JSON transport", () => {
  it("accepts a JSON object with nested input arrays", async () => {
    await expect(
      readJson(request('{"inputs":[[1,0],[0,1]],"action":"submit"}')),
    ).resolves.toEqual({
      inputs: [
        [1, 0],
        [0, 1],
      ],
      action: "submit",
    });
  });

  it("rejects unsupported methods, media types and compression", async () => {
    await expect(readJson(request("{}", {}, "GET"))).rejects.toMatchObject({
      status: 405,
    });
    await expect(
      readJson(request("{}", { "content-type": "text/plain" })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJson(request("{}", { "content-encoding": "gzip" })),
    ).rejects.toMatchObject({ status: 415 });
  });

  it("rejects malformed JSON, nonobject roots and invalid UTF-8", async () => {
    for (const body of ["", "{", "null", "[]", "42", '"hello"'])
      await expect(readJson(request(body))).rejects.toMatchObject({
        status: 400,
      });
    const req = Object.assign(
      Readable.from([Buffer.from([0x7b, 0xff, 0x7d])]),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        rawHeaders: [],
      },
    ) as unknown as IncomingMessage;
    await expect(readJson(req)).rejects.toMatchObject({ status: 400 });
  });

  it("limits bytes with or without a content-length declaration", async () => {
    await expect(
      readJson(request("{}", { "content-length": String(MAX_JSON_BYTES + 1) })),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJson(request(JSON.stringify({ data: "x".repeat(MAX_JSON_BYTES) }))),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("rejects prototype keys anywhere in the tree and bounds nesting", async () => {
    for (const body of [
      '{"__proto__":{}}',
      '{"a":[{"constructor":{}}]}',
      '{"nested":{"prototype":1}}',
      '{"a":'.repeat(26) + "{}" + "}".repeat(26),
    ])
      await expect(readJson(request(body))).rejects.toMatchObject({
        status: 400,
      });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("applies the same limits to Vercel preparsed request bodies", async () => {
    const req = Object.assign(request(), { body: { action: "list" } });
    await expect(readJson(req)).resolves.toEqual({ action: "list" });
    req.body = JSON.parse('{"__proto__":{"polluted":true}}');
    await expect(readJson(req)).rejects.toMatchObject({ status: 400 });
    Object.assign(req, { body: { data: "x".repeat(MAX_JSON_BYTES) } });
    await expect(readJson(req)).rejects.toMatchObject({ status: 413 });
  });
});
