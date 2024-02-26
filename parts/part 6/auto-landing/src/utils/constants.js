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
export const KNOTS_IN_KM_PER_MINUTE = 0.0308667;

// AP values
export const AUTOPILOT_INTERVAL = 500;
export const FAST_AUTOPILOT_INTERVAL = 100;

// flight modes
export const LEVEL_FLIGHT = `LVL`;
export const ALTITUDE_HOLD = `ALT`;
export const HEADING_MODE = `HDG`;
export const HEADING_TARGETS = `HeadingTargets`;
export const AUTO_THROTTLE = `ATT`;
export const AUTO_TAKEOFF = `ATO`;

// terrain follow
export const TERRAIN_FOLLOW = `TER`;
export const TERRAIN_FOLLOW_DATA = `TerrainFollowData`;
export const TERRAIN_FOLLOW_SAFETY = 500;

// auto landing
export const AUTO_LANDING = `ATL`;
export const AUTO_LANDING_DATA = `ALD`;
// approach lengths, in minutes
export const APPROACH_LINE_DURATION = 1;
export const GLIDE_SLOPE_DURATION = 3;
export const SHORT_FINAL_DURATION = 1;


export const CUT_THE_ENGINES = `CUT_THE_ENGINES`;
export const END_OF_LANDING = `END_OF_LANDING`;
export const FLY_THE_GLIDE_SLOPE = `FLY_THE_GLIDE_SLOPE`;
export const GET_ONTO_THE_APPROACH = `GET_ONTO_THE_APPROACH`;
export const LAND_ON_THE_RUNWAY = `LAND_ON_THE_RUNWAY`;
export const RIDE_OUT_SHORT_FINAL = `RIDE_OUT_SHORT_FINAL`;
export const ROLL_AND_BRAKE = `ROLL_AND_BRAKE`;
export const THROTTLE_TO_GLIDE_SPEED = `THROTTLE_TO_GLIDE_SPEED`;

export const LANDING_STEPS = [
  GET_ONTO_THE_APPROACH,
  THROTTLE_TO_GLIDE_SPEED,
  FLY_THE_GLIDE_SLOPE,
  RIDE_OUT_SHORT_FINAL,
  CUT_THE_ENGINES,
  LAND_ON_THE_RUNWAY,
  ROLL_AND_BRAKE,
  END_OF_LANDING,
];
