import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const origin = process.env.GAME_URL || "http://localhost:5173";
  await page.goto(`${origin}/src/audio.ts`);
  const result = await page.evaluate(async () => {
    const { GameAudio } = await import("/src/audio.ts");
    const sampleRate = 24000,
      duration = 13;
    const context = new OfflineAudioContext(
      2,
      sampleRate * duration,
      sampleRate,
    );
    let created = 0;
    const audio = new GameAudio(() => {
      created++;
      return context;
    });
    audio.start();
    audio.click();
    const silentUntilEnabled = created === 0;
    const state = {
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      yaw: 0,
      yawRate: 0,
      roll: 0,
      pitch: 0,
      wobble: 0,
      speed: 0,
      boost: 1,
      heat: 0.1,
      drifting: false,
      collision: 0,
    };
    const input = { throttle: 0, steer: 0, brake: false, boost: false };
    const checkpoints = [];
    for (let tick = 1; tick < duration * 10; tick++) {
      const at = tick / 10;
      checkpoints.push(
        context.suspend(at).then(async () => {
          if (tick === 5) audio.toggle();
          if (tick >= 5 && tick < 110) {
            state.speed = tick < 20 ? 0 : Math.min(22, (tick - 20) * 0.5);
            state.heat = tick < 65 ? 0.2 : 0.55;
            input.throttle = tick < 20 ? 0 : 1;
            input.boost = tick >= 65 && tick < 80;
            state.drifting = tick >= 80 && tick < 95;
            audio.update(state, input, 0.1);
          }
          if (tick === 30) audio.pickup();
          if (tick === 42 || tick === 47) audio.laser();
          if (tick === 55) audio.hit();
          if (tick === 65) audio.boost();
          if (tick === 95) audio.shield();
          if (tick === 103) audio.bell();
          if (tick === 110) audio.quiet();
          if (tick === 120) audio.toggle();
          await context.resume();
        }),
      );
    }
    const rendered = await context.startRendering();
    await Promise.all(checkpoints);
    const left = rendered.getChannelData(0),
      right = rendered.getChannelData(1);
    let peak = 0,
      square = 0,
      maxStep = 0,
      initialPeak = 0,
      tailPeak = 0;
    for (let i = 0; i < left.length; i++) {
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      square += left[i] * left[i];
      if (i) maxStep = Math.max(maxStep, Math.abs(left[i] - left[i - 1]));
      if (i < sampleRate * 0.5)
        initialPeak = Math.max(initialPeak, Math.abs(left[i]));
      if (i > sampleRate * 12.7)
        tailPeak = Math.max(tailPeak, Math.abs(left[i]));
    }
    const samples = Array.from(left, (sample, index) => [
      sample,
      right[index],
    ]).flat();
    return {
      samples,
      sampleRate,
      silentUntilEnabled,
      peak,
      rms: Math.sqrt(square / left.length),
      maxStep,
      initialPeak,
      tailPeak,
    };
  });
  assert.equal(
    result.silentUntilEnabled,
    true,
    "No audio context before opt-in",
  );
  assert.equal(result.initialPeak, 0, "Opt-in starts from silence");
  assert.ok(
    result.samples.every(Number.isFinite),
    "All rendered samples are finite",
  );
  assert.ok(
    result.peak > 0.015 && result.peak < 0.3,
    `Comfortable peak ${result.peak}`,
  );
  assert.ok(
    result.rms > 0.002 && result.rms < 0.06,
    `Comfortable average ${result.rms}`,
  );
  assert.ok(result.maxStep < 0.06, `No abrupt sample jumps ${result.maxStep}`);
  assert.ok(
    result.tailPeak < 0.00003,
    `Mute fades to silence ${result.tailPeak}`,
  );
  const data = Buffer.alloc(44 + result.samples.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(result.sampleRate, 24);
  data.writeUInt32LE(result.sampleRate * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(result.samples.length * 2, 40);
  result.samples.forEach((sample, index) =>
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, sample)) * 32767),
      44 + index * 2,
    ),
  );
  await mkdir("docs", { recursive: true });
  await writeFile("docs/audio-preview.wav", data);
  delete result.samples;
  console.log(
    "PASS: original projector mix, opt-in, amplitude, continuity, mute fade",
    result,
  );
  console.log(
    "Rendered actual GameAudio output: docs/audio-preview.wav (13 seconds, stereo PCM)",
  );
} finally {
  await browser.close();
}
