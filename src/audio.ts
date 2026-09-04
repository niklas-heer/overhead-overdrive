import type { Input, VehicleState } from "./physics";

type AirLayer = {
  gain: GainNode;
  filter: BiquadFilterNode;
  source: AudioBufferSourceNode;
};
const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

/** Original projector foley. Nothing is created or played until the user enables sound. */
export class GameAudio {
  enabled = false;
  private context: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private dynamics: GainNode | null = null;
  private effects: GainNode | null = null;
  private fan: AirLayer | null = null;
  private wheels: AirLayer | null = null;
  private friction: AirLayer | null = null;
  private overdrive: AirLayer | null = null;
  private hum: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.65;
  private travelled = 0;
  private voices = 0;
  private lastHit = -Infinity;
  private lastLaser = -Infinity;

  // Injecting an offline context permits rendering and measuring the actual game mix.
  constructor(
    private readonly createContext: () => BaseAudioContext = () =>
      new AudioContext(),
  ) {}

  start() {
    if (!this.enabled) return;
    if (!this.context) this.initialize();
    const context = this.context!;
    if (context instanceof AudioContext && context.state === "suspended") {
      void context.resume().catch(() => {
        /* A later user gesture can resume it. */
      });
    }
    this.master!.gain.setTargetAtTime(this.volume, context.currentTime, 0.045);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.start();
    else if (this.context && this.master) {
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.035);
    }
  }

  setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.volume = clamp(value);
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(
        this.enabled ? this.volume : 0,
        this.context.currentTime,
        0.045,
      );
    }
  }

  update(state: VehicleState, input: Input, dt = 1 / 60) {
    if (!this.enabled || !this.context) return;
    const time = this.context.currentTime;
    const speed = clamp(Math.abs(state.speed) / 23);
    const boosting =
      input.boost &&
      state.boost > 0.02 &&
      state.heat < 0.98 &&
      input.throttle > 0;
    this.dynamics!.gain.setTargetAtTime(1, time, 0.15);
    // The cooling fan follows lamp load, not vehicle RPM. No ever-rising engine whine.
    this.fan!.gain.gain.setTargetAtTime(
      0.085 + clamp(state.heat) * 0.035,
      time,
      0.5,
    );
    this.fan!.filter.frequency.setTargetAtTime(
      570 + clamp(state.heat) * 160,
      time,
      0.65,
    );
    this.hum!.gain.setTargetAtTime(
      0.014 + Math.abs(input.throttle) * 0.003,
      time,
      0.3,
    );
    this.wheels!.gain.gain.setTargetAtTime(
      Math.pow(speed, 1.25) * 0.23,
      time,
      0.18,
    );
    this.wheels!.filter.frequency.setTargetAtTime(
      230 + speed * 360,
      time,
      0.25,
    );
    this.friction!.gain.gain.setTargetAtTime(
      state.drifting ? 0.09 * speed : 0,
      time,
      0.1,
    );
    this.overdrive!.gain.gain.setTargetAtTime(
      boosting ? 0.12 : 0,
      time,
      boosting ? 0.2 : 0.3,
    );
    // Quiet wheel joints give a sense of travel without a repeated ticking loop.
    this.travelled += Math.abs(state.speed) * clamp(dt, 0, 0.1);
    if (this.travelled > 7.5 && speed > 0.15) {
      this.travelled %= 7.5;
      this.note(170, 110, 0.045, 0.009 * speed, 0, this.dynamics!);
    }
  }

  quiet() {
    if (this.context && this.dynamics) {
      this.dynamics.gain.setTargetAtTime(0, this.context.currentTime, 0.09);
      this.travelled = 0;
    }
  }

  click() {
    this.note(540, 480, 0.085, 0.032);
  }
  bell() {
    this.note(659.25, 659.25, 0.38, 0.048);
    this.note(987.77, 987.77, 0.48, 0.037, 0.12);
    this.note(1318.51, 1318.51, 0.5, 0.022, 0.24);
  }
  pickup() {
    this.note(523.25, 523.25, 0.13, 0.042);
    this.note(659.25, 659.25, 0.15, 0.036, 0.065);
    this.note(1046.5, 1046.5, 0.24, 0.029, 0.13);
  }
  laser() {
    if (!this.context || this.context.currentTime - this.lastLaser < 0.07)
      return;
    this.lastLaser = this.context.currentTime;
    this.note(1120, 330, 0.19, 0.057);
    this.puff(1800, 0.095, 0.047);
  }
  hit() {
    if (!this.context || this.context.currentTime - this.lastHit < 0.13) return;
    this.lastHit = this.context.currentTime;
    this.note(135, 62, 0.15, 0.067);
    this.puff(680, 0.16, 0.11);
  }
  shield() {
    this.note(392, 392, 0.4, 0.036);
    this.note(587.33, 587.33, 0.42, 0.024, 0.045);
    this.note(783.99, 783.99, 0.5, 0.02, 0.09);
  }
  boost() {
    this.puff(1100, 0.38, 0.14);
  }

  private initialize() {
    const context = this.createContext();
    this.context = context;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -17;
    compressor.knee.value = 14;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3900;
    lowpass.Q.value = 0.55;
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.dynamics = context.createGain();
    this.dynamics.gain.value = 0;
    this.effects = context.createGain();
    this.effects.gain.value = 1;
    this.dynamics.connect(lowpass);
    this.effects.connect(lowpass);
    lowpass.connect(compressor);
    // Soft ceiling also protects against several simultaneous item stingers.
    const limiter = context.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const sample = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = 0.27 * Math.tanh(sample / 0.27);
    }
    limiter.curve = curve;
    limiter.oversample = "2x";
    compressor.connect(limiter);
    limiter.connect(this.master);
    this.master.connect(context.destination);
    this.noise = context.createBuffer(
      2,
      context.sampleRate * 6,
      context.sampleRate,
    );
    // Deterministic original noise, lightly correlated for a small, centered appliance.
    let seed = 271828;
    const left = this.noise.getChannelData(0),
      right = this.noise.getChannelData(1);
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 2147483648 - 1;
    };
    for (let i = 0; i < left.length; i++) {
      const center = random();
      left[i] = center * 0.8 + random() * 0.2;
      right[i] = center * 0.8 + random() * 0.2;
    }
    this.fan = this.air(570, 80, 0);
    this.wheels = this.air(380, 100, 1.4);
    this.friction = this.air(1300, 390, 2.9);
    this.overdrive = this.air(1050, 180, 4.1);
    this.hum = context.createGain();
    this.hum.gain.value = 0;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 96;
    oscillator.connect(this.hum);
    this.hum.connect(this.dynamics);
    oscillator.start();
  }

  private air(frequency: number, highpass: number, offset: number): AirLayer {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.55;
    const cut = context.createBiquadFilter();
    cut.type = "highpass";
    cut.frequency.value = highpass;
    cut.Q.value = 0.55;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(cut);
    cut.connect(gain);
    gain.connect(this.dynamics!);
    source.start(0, offset);
    return { source, filter, gain };
  }

  private envelope(
    gain: AudioParam,
    start: number,
    duration: number,
    volume: number,
  ) {
    gain.setValueAtTime(0, start);
    gain.linearRampToValueAtTime(
      volume,
      start + Math.min(0.012, duration * 0.2),
    );
    gain.exponentialRampToValueAtTime(0.00001, start + duration);
    gain.linearRampToValueAtTime(0, start + duration + 0.015);
  }

  private note(
    from: number,
    to: number,
    duration: number,
    volume: number,
    delay = 0,
    destination?: AudioNode,
  ) {
    if (!this.enabled || !this.context || this.voices >= 24) return;
    const context = this.context,
      start = context.currentTime + delay;
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    this.envelope(gain.gain, start, duration, volume);
    oscillator.connect(gain);
    gain.connect(destination ?? this.effects!);
    this.voices++;
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.voices--;
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private puff(frequency: number, duration: number, volume: number) {
    if (!this.enabled || !this.context || this.voices >= 24) return;
    const context = this.context,
      start = context.currentTime;
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    source.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.55;
    this.envelope(gain.gain, start, duration, volume);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effects!);
    this.voices++;
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      this.voices--;
    };
    source.start(start, 0.7);
    source.stop(start + duration + 0.02);
  }
}
