/** Wraps an angle into the range (-PI, PI]. */
export function normalizeAngle(angleInRad: number): number {
  let a = angleInRad % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

export const DEG_TO_RAD = Math.PI / 180;
export const GRAVITY_IN_M_PER_S2 = 9.81;
