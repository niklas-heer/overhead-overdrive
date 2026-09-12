export const RACE_LAPS = 3;
export type Point = { x: number; z: number };
export type Gate = Point & { dx: number; dz: number };
export type RaceProgress = {
  checkpoint: number;
  laps: number;
  gatesPassed: number;
  lapTimes: number[];
};

export function createRaceProgress(): RaceProgress {
  return { checkpoint: 1, laps: 0, gatesPassed: 0, lapTimes: [] };
}

/** The fraction of this movement that crosses a finite gate in the forward direction. */
export function crossGate(
  from: Point,
  to: Point,
  gate: Gate,
  halfWidth: number,
) {
  const before = (from.x - gate.x) * gate.dx + (from.z - gate.z) * gate.dz;
  const after = (to.x - gate.x) * gate.dx + (to.z - gate.z) * gate.dz;
  if (before > 0 || after <= 0 || after <= before) return null;
  const fraction = -before / (after - before);
  const x = from.x + (to.x - from.x) * fraction - gate.x;
  const z = from.z + (to.z - from.z) * fraction - gate.z;
  return Math.hypot(x, z) <= halfWidth ? fraction : null;
}

/** Player and rivals must cross every ordered gate, including the finish, on every lap. */
export function advanceRaceProgress(
  progress: RaceProgress,
  from: Point,
  to: Point,
  gates: Gate[],
  halfWidth: number,
  time: number,
  dt: number,
) {
  if (progress.laps >= RACE_LAPS) return null;
  const fraction = crossGate(
    from,
    to,
    gates[progress.checkpoint % gates.length],
    halfWidth,
  );
  if (fraction === null) return null;
  progress.gatesPassed++;
  progress.checkpoint++;
  if (progress.checkpoint <= gates.length) return null;
  progress.checkpoint = 1;
  progress.laps++;
  const crossingTime = time - dt + fraction * dt;
  const previous = progress.lapTimes.reduce((sum, lap) => sum + lap, 0);
  progress.lapTimes.push(crossingTime - previous);
  return crossingTime;
}

export function lapStatus(laps: number, finished: boolean) {
  return finished
    ? `FINISHED · ${RACE_LAPS}/${RACE_LAPS} LAPS`
    : `LAP ${Math.min(RACE_LAPS, laps + 1)}/${RACE_LAPS}`;
}
