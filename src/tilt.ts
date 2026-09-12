/** Project gravity onto the screen's horizontal axis, including both landscape grips. */
export function screenTilt(beta: number, gamma: number, angle: number) {
  const radians = Math.PI / 180;
  const b = beta * radians,
    g = gamma * radians,
    a = angle * radians;
  return (
    Math.atan2(
      Math.cos(b) * Math.sin(g) * Math.cos(a) + Math.sin(b) * Math.sin(a),
      Math.cos(b) * Math.cos(g),
    ) / radians
  );
}

export class TiltInput {
  private neutral: number | null = null;
  private lastSample = -Infinity;
  private value = 0;

  reset() {
    this.neutral = null;
    this.lastSample = -Infinity;
    this.value = 0;
  }

  sample(
    beta: number | null,
    gamma: number | null,
    angle: number,
    now: number,
  ) {
    if (
      beta === null ||
      gamma === null ||
      ![beta, gamma, angle].every(Number.isFinite)
    )
      return false;
    const tilt = screenTilt(beta, gamma, angle);
    if (this.neutral === null) this.neutral = tilt;
    const delta = ((tilt - this.neutral + 540) % 360) - 180;
    // A small dead zone prevents hand tremor from turning the trolley.
    const target =
      Math.sign(delta) * Math.min(1, Math.max(0, Math.abs(delta) - 3) / 22);
    const dt = Math.max(0, Math.min((now - this.lastSample) / 1000, 0.1));
    this.value += (target - this.value) * (1 - Math.exp(-dt * 18));
    this.lastSample = now;
    return true;
  }

  steer(now: number) {
    // Never retain a turn if iOS stops delivering sensor updates.
    return now - this.lastSample > 500 ? 0 : this.value;
  }
}
