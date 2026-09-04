# Overhead Overdrive

**Old-school hardware. After-school horsepower.**

A playable 3D overhead-projector racing game set in a stylized interpretation of Schenk-von-Limpurg-Gymnasium in Gaildorf. Race a vented classroom projector on four casters, drift around the atrium, overdrive the lamp, and try to beat your personal best.

![Overhead Overdrive](docs/screenshots/menu.png)

## Play locally

Requires Node.js 22.18+ and a WebGL2-capable browser.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). Choose a circuit, optionally change your setup in **The Garage**, and press **Let’s Roll**. Sound is opt-in using the header toggle. For a production build:

```sh
npm run build
npm run preview
```

## What is playable

- Three circuits: **Atrium Circuit** (192 m), **Canopy Run** (255 m), and **Kocher Park** (316 m).
- Three-lap races against three opponents using the same vehicle dynamics as the player: The Prefect takes precise lines, Turbo Tutor boosts and overtakes, and Loose Caster makes brief drifting turns.
- Sequential checkpoints, exact finish-line crossing, finishing-order tracking, race timer, and local personal bests per track and setup.
- Three handling setups: balanced Original, grippy Hall Monitor, and powerful Loose Cannon; five paint colors.
- Caster drifting, visible skid trails, a flexing mast, acceleration squat, impact wobble, quadratic drag, and rechargeable lamp boost with thermal lockout.
- Chase and overhead cameras, minimap, recovery, pause, restart, and untimed free driving.
- Keyboard, clickable item slot, and small-screen touch driving controls.
- Collectible laser pointers (three shots), seven-second one-hit transparency shields, and two-second capacitor boosts. Press **E** or **Q** to use the equipped item.
- Lasers tag rivals for a short slowdown. Temporary hit immunity prevents repeated stun-locking, scenery blocks beams, and glowing **POP QUIZ** targets recharge lamp energy when hit.
- Rival name/position panel, item status display, brief hit feedback, and speed-sensitive camera framing.
- Gentle projector fan/hum, caster rolling and drift sounds, plus distinct pickup/laser/shield effects. Sound can be toggled during a race.
- Original procedural 3D school scenery, projector models, materials, signage, lamp beams, and synthesized audio.
- **The School → Download this 3D school** exports the selected environment as GLB. Ready-exported models are in [`models/`](models/).

## Controls

| Input | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake, then reverse |
| A / D or ← / → | Steer |
| Space | Handbrake / caster drift |
| Shift | Lamp overdrive |
| E / Q / click item slot | Fire laser or use held power-up |
| R | Recover at the last checkpoint (+2 seconds during a race) |
| C | Switch chase / overhead camera |
| Esc | Pause / resume |
| Enter | Start from track selection |

Lift or brake before tight turns; short handbrake taps help rotate the trolley. Steering authority decreases with speed. The Hall Monitor is the easiest setup for learning. Boost drains lamp energy and builds heat, then recharges when released. Switching away from the game pauses it automatically.

## The three places

**Atrium Circuit** is the indoor school hall: white brick, graphite tiles, yellow stairs, glass roof and galleries. **Canopy Run** threads an asymmetric route between separate school wings, a red-column covered passage, courtyards and curved bicycle shelters. **Kocher Park** leaves the forecourt for a wooded pond loop and the riverbank. Each has different geometry, scenery, turn rhythm and lap length. The source photographs and maps informed the architecture and setting; the route connections and dimensions remain adapted for racing.

The track rewrite uses a new local-record key, so times from the old room layouts do not compete with the new circuits.

## School model and photographs

The school's public photos informed the white brick, pitched glass atrium roof, graphite tiles, mustard-yellow doors and stairs, grey gallery railings, checkerboard lockers, and yellow benches. See [the photograph reference document](docs/school-reference.md) for direct interior/exterior image links and observed details.

This is an architectural interpretation designed for racing. Dimensions, room connections, course layouts and furniture arrangements are invented. It is not a measured, complete digital twin of the real school. Source photos are references only; they are not redistributed or used as textures. The roof is partially cut away to keep cameras usable. Each GLB represents one playable interpretation, with procedural textures embedded and repeated geometry using `EXT_mesh_gpu_instancing`.

## Physics approach

Dynamics run at a fixed **120 Hz**, independently of rendering. The vehicle has a planar velocity, heading and yaw rate. Longitudinal acceleration competes with speed-squared drag; capped lateral friction preserves inertia through corners; the handbrake reduces caster grip. Opposite throttle brakes before reversing. Impulses resolve circular and axis-aligned scenery contacts, with rubber-like restitution, plus racer-to-racer contacts. Damped springs animate chassis roll, pitch and mast flex. Stock cruising speed is around 16 m/s (58 km/h).

This is an arcade vehicle model with physically motivated behavior. Wheels do not independently simulate suspension or free-swiveling caster joints. Vertical motion, jumps, full rigid-body tipping and destructible furniture are outside this version. The deliberately bounded roll keeps the top-heavy projector controllable.

## Checks

```sh
npm test                 # 29 physics, items and rival regression tests
npm run test:ai          # 9 full AI race simulations against actual world colliders
AI_PACK=1 npm run test:ai # also validate 9 three-rival pack completions
npm run build            # strict TypeScript + production bundle
```

With the dev server running in another terminal:

```sh
npx playwright install chromium
npm run test:browser     # menu, garage, controls, pause, recovery, tracks, tour, mobile
node scripts/steering-smoke.mjs # driver-relative A/D and arrow-key regression
node scripts/race-smoke.mjs    # keyboard-driven race with item use, finish + saved record
node scripts/items-smoke.mjs   # real pickup, laser, item UI, sound, pause/restart
node scripts/audio-check.mjs   # render and validate the actual audio graph
node scripts/export-models.mjs # regenerate and validate the three GLB exports
```

Browser scripts default to port 5173. `GAME_URL` overrides the URL for all browser scripts. The AI regression supports both independent and pack runs, including scenery, passing and racer contacts. It does not simulate combat; the keyboard race check includes the other racers and item use.

## Project structure

- `src/main.ts`: menu, race lifecycle, cameras, controls, HUD and export.
- `src/items.ts` / `src/item-view.ts`: tested item rules, inventory, beam hits, shields and visual effects.
- `src/rivals.ts`: distinct rival handling, driving lines, passing and boost decisions.
- `src/audio.ts`: original fan/rolling sound design and short item effects.
- `src/physics.ts`: dependency-free vehicle dynamics and contact response.
- `src/world.ts`: circuits, original school geometry/materials and projector model.
- `src/effects.ts`: bounded, instanced caster skid trails.
- `src/style.css`: responsive visual design.
- `docs/school-reference.md`: inspected photographs, supplied maps and reconstruction scope.
- `docs/audio-notes.md` / `docs/audio-preview.wav`: audio design notes and a render of the actual sound graph.
- `models/`: self-contained school GLB files exported from the playable scenes.

Built with TypeScript, Three.js and Vite. No backend or account required. Personal records use local browser storage. Fonts load from Google Fonts with local fallbacks; all gameplay geometry and materials are generated locally. A production build can run offline once served locally, using fallback fonts.
