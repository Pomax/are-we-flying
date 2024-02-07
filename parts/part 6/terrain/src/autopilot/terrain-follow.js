import {
  ALTITUDE_HOLD,
  HEADING_MODE,
  TERRAIN_FOLLOW_SAFETY,
  TERRAIN_FOLLOW_DATA,
  ENV_PATH,
} from "../utils/constants.js";
import { getPointAtDistance } from "../utils/utils.js";

import dotenv from "dotenv";
dotenv.config({ path: ENV_PATH });
const { DATA_FOLDER, ALOS_PORT: PORT } = process.env;
import { ALOSInterface } from "../elevation/alos-interface.js";
import { ALOS_VOID_VALUE } from "../elevation/alos-constants.js";
const alos = new ALOSInterface(DATA_FOLDER);

const KNOTS_IN_KM_PER_MINUTE = 0.0308667;
const { ceil } = Math;

export async function terrainFollow(autopilot, flightInformation) {
  const { waypoints } = autopilot;
  const { lat, long, trueHeading, speed } = flightInformation.data;
  const probeLength = speed * KNOTS_IN_KM_PER_MINUTE * 5;
  let maxElevation, geoPolies;

  // If we're flying a flight plan, ask the waypoint manager to give
  // us the shape and max elevation corresponding to the next 5 minutes
  // of flight.
  if (waypoints.active) {
    const result = waypoints.getMaxElevation(lat, long, probeLength);
    geoPolies = result.geoPolies;
    maxElevation = result.maxElevation;
  }

  // Otherwise, use a spike probe.
  else {
    const geoPoly = [
      getPointAtDistance(lat, long, 1, trueHeading - 90),
      getPointAtDistance(lat, long, probeLength, trueHeading),
      getPointAtDistance(lat, long, 1, trueHeading + 90),
    ].map(({ lat, long }) => [lat, long]);
    geoPolies = [geoPoly];
    maxElevation = alos.getMaxElevation(geoPoly);
  }

  const alt = maxElevation.elevation.feet;
  if (alt === ALOS_VOID_VALUE) return;

  const bracketed = TERRAIN_FOLLOW_SAFETY + ceil(alt / 100) * 100;
  autopilot.setParameters({
    [ALTITUDE_HOLD]: bracketed,
    [TERRAIN_FOLLOW_DATA]: {
      geoPolies,
      maxElevation,
    },
  });
}
