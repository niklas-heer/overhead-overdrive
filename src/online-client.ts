import type { OnlineRace } from "./online-race";
export type OnlinePlayer = {
  id: string;
  name: string;
  rider: number;
  color: string;
  bot?: boolean;
};
export type Room = {
  code: string;
  hostId: string;
  track: string;
  setup: number;
  status: "lobby" | "countdown" | "race" | "finished";
  players: OnlinePlayer[];
  race: OnlineRace | null;
  startAt: number;
  serverNow: number;
  sequence: number;
};
export type SchoolRecord = {
  id: string;
  name: string;
  time: number;
  track: string;
  setup: number;
  createdAt: number;
  ghostId: string;
};
export type Ghost = {
  id: string;
  name: string;
  time: number;
  track: string;
  setup: number;
  frames: [number, number, number, number][];
  version: string;
};
export class OnlineClient {
  player: { id: string; name: string } | null = null;
  private csrf = "";
  private async request<T>(
    action: string,
    data: Record<string, unknown> = {},
    read = false,
  ): Promise<T> {
    const query = new URLSearchParams({
      action,
      ...Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      ),
    });
    const response = await fetch(
      read ? `/api/online?${query}` : "/api/online",
      {
        method: read ? "GET" : "POST",
        credentials: "same-origin",
        headers: read
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf },
        body: read ? undefined : JSON.stringify({ action, ...data }),
        signal: AbortSignal.timeout(12000),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload)
      throw new Error(
        payload?.error ||
          (response.status === 429
            ? "The school office is busy. Please try again shortly."
            : "Online club is unavailable. Offline racing is ready to roll."),
      );
    return payload as T;
  }
  async session(name: string) {
    const result = await this.request<{
      player: { id: string; name: string };
      csrf: string;
    }>("session", { name });
    this.player = result.player;
    this.csrf = result.csrf;
    return result.player;
  }
  records(track: string, setup: number, period: string) {
    return this.request<{ records: SchoolRecord[]; version: string }>(
      "records",
      { track, setup, period },
      true,
    );
  }
  ghost(id: string) {
    return this.request<{ ghost: Ghost }>("ghost", { id }, true);
  }
  trial(track: string, setup: number) {
    return this.request<{
      challenge: string;
      expiresAt: number;
      version: string;
    }>("trial", { track, setup });
  }
  submit(challenge: string, inputs: [number, number][]) {
    return this.request<{
      record: SchoolRecord;
      rank: number | null;
      ghostId: string | null;
    }>("submit", { challenge, inputs });
  }
  room(action: string, data: Record<string, unknown>) {
    return this.request<{ room: Room | null }>(action, data);
  }
}
