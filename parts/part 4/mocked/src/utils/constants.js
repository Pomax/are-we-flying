import { join, resolve, sep, win32, posix } from "node:path";
export const root = (resolve(join(import.meta.dirname, `..`, `..`)) + sep)
  .split(win32.sep)
  .join(posix.sep);

export const FEET_PER_METER = 3.28084;
export const KNOT_IN_FPS = 1.68781;
export const FPS_IN_KNOTS = 1 / KNOT_IN_FPS;

// flight modes
export const LEVEL_FLIGHT = `LVL`;
export const ALTITUDE_HOLD = `ALT`;
export const HEADING_MODE = `HDG`;
export const AUTO_THROTTLE = `ATT`;
