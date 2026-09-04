# Projector sound redesign

The old racing sound was a single sawtooth oscillator whose pitch rose from 48 Hz by 7 Hz per metre/second. It had the abrasive, artificial buzz of an engine synthesizer, rather than the sound of an appliance on wheels.

The replacement in `src/audio.ts` is original procedural sound, generated locally with Web Audio. It contains no downloaded samples and requires no external media or attribution. It uses:

- A soft, filtered stereo air loop for the cooling fan. Heat changes its brightness slowly.
- A quiet 96 Hz sine hum. The pitch remains stable as the projector accelerates.
- Low rolling noise that follows speed, with very quiet wheel-joint taps every 7.5 metres.
- Rounded friction during drifts and an airy swell during boost.
- Short, distinct pickup arpeggios, falling laser chirps, padded impact sounds, and shield/lap chimes.

All voices share a low-pass filter, dynamics compressor, soft peak ceiling, and user volume control. Notes use short attacks and releases rather than abrupt starts or stops. Muting fades out. Race pause/menu transitions fade the rolling/fan bus while retaining interface sounds. Sound is off by default, and no audio context is created until explicitly enabled.

## Listen and verify

`audio-preview.wav` is a 13-second stereo render of the actual game sound graph, produced by Chromium's `OfflineAudioContext`, without normalization or post-processing:

| Time | Sound |
| --- | --- |
| 0.0–0.5 s | Silence before opt-in |
| 0.5–2 s | Stationary fan and hum |
| 2–6.5 s | Acceleration and rolling, pickup at 3 s, laser at 4.2/4.7 s, impact at 5.5 s |
| 6.5–8 s | Boost |
| 8–9.5 s | Drift friction and ready cue |
| 9.5–11 s | Drift release/mini-turbo, shield and lap chimes |
| 11–12 s | Race sounds fade out |
| 12–13 s | User mute |

To regenerate it with Vite running: `node scripts/audio-check.mjs`. The check verifies opt-in silence, finite samples, comfortable amplitude, absence of abrupt sample discontinuities, and a fade to silence after muting. The checked render measured peak 0.1430 (about −16.9 dBFS) and RMS 0.0306 (about −30.3 dBFS). These are signal checks, not a claim of subjective listening approval.

## Integration

```ts
import { GameAudio } from './audio';
const audio = new GameAudio();
// A user sound-button click calls audio.toggle(); UI text belongs to the caller.
// Existing game loop: audio.update(state, input, dt).
// Non-driving states: audio.quiet().
```

`enabled`, `start`, `toggle`, `setVolume(0…1)`, `update`, `quiet`, `click`, `bell`, `pickup`, `laser`, `hit`, `shield`, `boost`, `driftReady`, `driftRelease`, and `mischief` are public. `start()` is safe to call when muted. The optional constructor context factory exists for offline rendering; normal game code needs no constructor arguments.

## Caster-kick polish

The drift-ready cue is a short rising pair of sine tones. Releasing a charged drift adds a low mechanical clack and a soft filtered-air burst; the ongoing overdrive layer follows the mini-turbo. Mischief lanes play a quiet paper/rattle puff. These cues share the existing opt-in master gain and voice limit.
