# Security boundaries

## Application architecture

The game serves a static Vite frontend and one Vercel Function at `/api/online`. The online API uses a dedicated Upstash Redis database; offline best times and rider preferences stay in browser storage. Offline records are never promoted to the public leaderboard. Players can modify their own browser simulation; browser hardening does not prevent that.

Production response headers in `vercel.json` restrict JavaScript to this origin, block inline scripts and eval, disallow framing, forms, plugins and workers, restrict outgoing connections, disable unused device permissions, and prevent MIME sniffing. Google Fonts is explicitly allowed. Inline CSS is required for procedural HUD styles; this exception does not permit inline JavaScript. Blob/data resources are allowed for generated textures and GLB exports.

Only built frontend assets and the API endpoint are served. Environment files and Git internals are excluded from uploads, and `.env*` and `.vercel/` are ignored by Git. Never place credentials in `public/` or `VITE_*` variables, which become public browser assets. Player-supplied nicknames use `textContent`, not template interpolation into HTML.

Vercel system DDoS mitigations are active. The project firewall has a published `Game request flood guard` rule: all paths, 2,000 requests per IP per fixed 60-second window, returning a rate-limit response above the limit. This generous threshold accommodates shared school networks; it is not protection against a distributed attack by itself. The rule is stored in Vercel, separately from `vercel.json`. Review it when API endpoints are added: those need much tighter per-session limits and bounded concurrent work. Attack Mode is left off during normal play so visitors do not receive a challenge page on every visit.

Inspect the live firewall with `npx vercel@latest firewall overview --scope niklas-heers-projects`. No paid security service was enabled.

Verification:

```sh
npm audit
npm test
npm run build
GAME_URL=https://overhead-overdrive.vercel.app npm run test:security
GAME_URL=https://overhead-overdrive.vercel.app npm run test:browser
```

The security smoke test checks actual response headers, private-file 404s, malformed local preferences, normal model export, and browser enforcement against harmless injected-script and off-origin request probes. It is a regression check, not a penetration-test certification. Repeat dependency audits when changing dependencies and before releases.

## Online controls and limits

- Anonymous identities use HMAC-signed, 30-day HttpOnly/Secure/SameSite=Strict cookies. Mutations require an exact approved Origin and a session-bound CSRF token. The API never accepts a client-supplied player identity. Clearing cookies loses this anonymous identity; nicknames are public display names, not unique verified accounts.
- Nicknames are restricted to 2–20 letters/numbers/spaces/dots/dashes/underscores. JSON bodies are limited to 256KiB with depth/type/prototype-key checks. Unexpected actions, invalid masks, invalid track/setup IDs and unauthorized room actions are rejected.
- The server creates a single-use ten-minute race pass tied to player, course, setup and physics version. Submitted RLE controls contain at most 21,600 fixed 120Hz ticks. The server re-simulates from its own starting grid, requires three sequential laps and calculates penalties and finish time. Two global leased verification slots bound concurrent replay work. A player-bound ten-minute receipt lets the client recover a successful save after a lost response without adding another record. No client-reported time, position or hit is trusted. This verifies a physically valid run, not that a human rather than a bot drove it.
- Multiplayer uses short HTTP updates with client prediction, not WebSocket connections. Redis leases serialize room changes; input sequence numbers reject stale controls, and only elapsed server time advances the race. Input stops after one second without updates. Races end after three minutes or a catch-up gap above five seconds; rooms expire after ten minutes. Membership is checked on every update; only the host can start/rematch. Invitation codes contain 96 random bits and authorize joining an unstarted room, not controlling another player.
- The dedicated database credentials and signing secret stay server-side. The client receives only public board/ghost data and its current room snapshot. Room snapshots contain no credentials or session tokens. There is no arbitrary file/model upload: ghosts contain only server-generated numeric positions at 10Hz.
- Boards retain the top 50 personal bests per track/setup for the current UTC week and all time. Displaced ghost records are removed; boards and ghost data have one-year TTLs. Public board/ghost reads have a bounded 15-second instance cache. Failed storage operations fail closed rather than silently using in-memory production data.
- The launch budget allows four active rooms and 30,000 uncached online API calls per UTC calendar month. Per-session limits are 600 sync requests/minute, 30 other mutations/minute and ten replay submissions/hour. New sessions are limited to 20/hour/IP; uncached public reads to 240/minute/IP. This is a request guard, not a guarantee against distributed quota exhaustion: Redis commands, rejected traffic and platform overhead have separate quotas. Database auto-upgrades must be disabled; exhausting the free allowance disables online operations while offline racing remains available.

Local testing uses an explicitly separate in-memory development server. Production cannot enable that fallback. Tests cover session tampering, origin/CSRF, body limits, concurrent room membership, replay ownership/consumption, forged scores, lease expiration and capacity/quota failure. Keep these gates when adding accounts, chat, public matchmaking or a different transport.

## Hosting constraints

As checked on 2026-09-05, Vercel Hobby is restricted to personal, non-commercial projects. It includes 4 active CPU hours and 360 GB-hours of function memory; functions have a five-minute maximum duration. WebSockets are beta, terminate at the function duration limit and require external durable room state across instances. Database/ghost storage has separate provider quotas. These limits do not guarantee a particular player capacity; measure the actual simulation and verification workload before making capacity claims.

Sources: [Hobby limits](https://vercel.com/docs/plans/hobby), [WebSockets](https://vercel.com/docs/functions/websockets), [WAF rate limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).
