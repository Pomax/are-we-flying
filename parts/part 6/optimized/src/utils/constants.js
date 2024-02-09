import { join, resolve, sep, win32, posix } from "node:path";
export const root = (resolve(join(import.meta.dirname, `..`, `..`)) + sep)
  .split(win32.sep)
  .join(posix.sep);

export const ENV_PATH = `${root}../../../.env`;
console.log(ENV_PATH);

export const FEET_PER_METER = 3.28084;
export const KNOT_IN_FPS = 1.68781;
export const FPS_IN_KNOTS = 1 / KNOT_IN_FPS;
export const ONE_KTS_IN_KMS = 0.000514444;
export const FPS_PER_KNOT = 1.68781;
export const KM_PER_NM = 1.852;
export const KM_PER_ARC_DEGREE = 111.320; // note: on a great circle.

// flight modes
export const LEVEL_FLIGHT = `LVL`;
export const ALTITUDE_HOLD = `ALT`;
export const HEADING_MODE = `HDG`;
export const HEADING_TARGETS = `HeadingTargets`;
export const AUTO_THROTTLE = `ATT`;

// terrain follow
export const TERRAIN_FOLLOW = `TER`;
export const TERRAIN_FOLLOW_DATA = `TerrainFollowData`;
export const TERRAIN_FOLLOW_SAFETY = 500;
