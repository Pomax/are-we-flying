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
  const { modes, waypoints } = autopilot;
  const { lat, long, trueHeading, speed, declination } = flightInformation.data;
  let maxElevation, geoPolies;

  // Because we want enough time to climb if it turns out we're
  // flying towards a mountain, we'll set a "probe length" that
  // extends 5 minutes ahead of us based on our current speed.
  const probeLength = speed * KNOTS_IN_KM_PER_MINUTE * 5;

  // Then, we either need to find the maximum elevation along
  // our flight path, if we have a flight plan loaded, or
  // just "ahead of us" if we're flying on autopilot without
  // a specific flight plan.

  // If we're on a flight plan, we'll let the waypoint manager
  // figure out the shape we're using, because it knows where
  // all the waypoints are.
  if (waypoints.active) {
    const result = waypoints.getMaxElevation(lat, long, probeLength, declination);
    geoPolies = result.geoPolies;
    maxElevation = result.maxElevation;
  }

  // If not, we just project a triangle in front of us, with
  // a base that's 1km on either side of us, and a tip that's
  // simply the point 5 minutes ahaead of us:
  else {
    console.log(`terrain followed without waypoints`);
    let heading = trueHeading;
    if (modes[HEADING_MODE]) {
      heading = modes[HEADING_MODE] + declination;
    }
    const geoPoly = [
      getPointAtDistance(lat, long, 1, heading - 90),
      getPointAtDistance(lat, long, probeLength, heading),
      getPointAtDistance(lat, long, 1, heading + 90),
    ].map(({ lat, long }) => [lat, long]);
    geoPolies = [geoPoly];
    maxElevation = alos.getMaxElevation(geoPoly);
    console.log(lat, long, maxElevation);
  }

  // if this didn't yield elevation data (e.g. we're flying
  // over the ocean) just do nothing.
  const alt = maxElevation.elevation.feet;
  if (alt === ALOS_VOID_VALUE) return;

  // But if it did, set our autopilot to however many feet
  // we want to be above the max elevation, based on the
  // constant/ we declared earlier, and then round that up
  // to some multiple of 100 feet.
  const bracketed = ceil((alt + TERRAIN_FOLLOW_SAFETY) / 100) * 100;
  autopilot.setParameters({
    [ALTITUDE_HOLD]: bracketed,
    // And for visualization purposes, also add the polygon(s)
    // that we used and the maximum elevation that we found.
    [TERRAIN_FOLLOW_DATA]: {
      geoPolies,
      maxElevation,
    },
  });
}
