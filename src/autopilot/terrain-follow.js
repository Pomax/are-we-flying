const { ceil } = Math;
import { getPointAtDistance } from "../utils/utils.js";
import { ALTITUDE_HOLD, FEET_PER_METER, KMS_PER_KNOT } from "../utils/constants.js";
import {
  ALOS_VOID_VALUE,
  NO_ALOS_DATA_VALUE,
} from "../elevation/alos-constants.js";

const minutes = 2;

// distance covered at current speed over 2 minutes, in km
function getDistanceGivenSpeed(speed) {
  return speed * KMS_PER_KNOT * 60 * minutes;
}

export const LOAD_TIME = Date.now();

/**
 * ...
 *
 * @param {*} autopilot
 * @param {*} state
 * @param {*} altitude
 */
export async function followTerrain(autopilot, state, altitude = 500) {
  const { latitude: lat, longitude: long, trueHeading } = state;

  const distance = getDistanceGivenSpeed(state.speed);
  const { lat: lat2, long: long2 } = getPointAtDistance(
    lat,
    long,
    distance,
    trueHeading
  );
  const coarseLookup = true;
  const maxValue = autopilot.alos.getHighestPointBetween(
    lat,
    long,
    lat2,
    long2,
    coarseLookup
  );
  if (maxValue.elevation === ALOS_VOID_VALUE) maxValue.elevation = 0;

  autopilot.elevation = maxValue;
  autopilot.elevation.lat2 = lat2;
  autopilot.elevation.long2 = long2;

  // Rememeber: ALOS data is in meters, but MSFS is in feet. We crash really fast if we don't convert units =)
  let targetAltitude = maxValue.elevation * FEET_PER_METER + altitude;

  // We don't want to constantly change altitude, so we use elevation brackets:
  let bracketSize = 100;
  if (targetAltitude > 1000) bracketSize = 200;
  if (targetAltitude > 10000) bracketSize = 500;
  if (targetAltitude > 30000) bracketSize = 1000;
  targetAltitude = ceil(targetAltitude / bracketSize) * bracketSize;

  // Set the ALT value and let the autopilot do the rest
  autopilot.setTarget(ALTITUDE_HOLD, targetAltitude);
}
