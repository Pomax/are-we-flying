import { join, resolve, sep, win32, posix } from "node:path";
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
export const __root = (resolve(join(__dirname, `..`, `..`)) + sep)
  .split(win32.sep)
  .join(posix.sep);

export const ACROBATIC = `ACR`;
export const ALTITUDE_HOLD = `ALT`;
export const AUTO_LAND = `ATL`;
export const AUTO_TAKEOFF = `ATO`;
export const AUTO_THROTTLE = `ATT`;
export const FEET_PER_METER = 3.28084;
export const FEET_PER_DEGREE = 364000;
export const FPM_PER_KNOT = 101.269;
export const HEADING_MODE = `HDG`;
export const INVERTED_FLIGHT = `INV`;
export const KM_PER_ARC_DEGREE = 0.01; // note: on a great circle.
export const KM_PER_NM = 1.852;
export const KMH_PER_KNOT = 1.852;
export const KMS_PER_KNOT = KMH_PER_KNOT / 3600;
export const KNOT_IN_FPS = 1.68781;
export const FPS_IN_KNOTS = 1 / KNOT_IN_FPS;
export const LEVEL_FLIGHT = `LVL`;
export const METERS_PER_FOOT = 0.3048;
export const MSFS_RADIAN = Math.PI / 10;
export const TERRAIN_FOLLOW = `TER`;
