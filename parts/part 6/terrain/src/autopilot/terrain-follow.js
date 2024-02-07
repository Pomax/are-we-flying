import {
  ALTITUDE_HOLD,
  HEADING_MODE,
  TERRAIN_FOLLOW_SAFETY,
  TERRAIN_FOLLOW_SHAPE,
} from "../utils/constants.js";
import { getPointAtDistance } from "../utils/utils.js";

import dotenv from "dotenv";
dotenv.config({ path: `${import.meta.dirname}/../../../../../.env` });
const { DATA_FOLDER, ALOS_PORT: PORT } = process.env;
import { ALOSInterface } from "../elevation/alos-interface.js";
const alos = new ALOSInterface(DATA_FOLDER);

const KNOTS_IN_KM_PER_MINUTE = 0.0308667;
const { ceil } = Math;

export async function terrainFollow(autopilot, flightInformation) {
  // TODO: if we have waypoints, we should base the shape of our probe
  //       on the flight path, rather than using a spike probe shape.
  const { modes, waypoints } = autopilot;
  const { lat, long, trueHeading, declination, speed } = flightInformation.data;
  const probeLength = speed * KNOTS_IN_KM_PER_MINUTE * 5;
  let geoPoly;

  // If we're flying a flight plan, ask the waypoint manager to give
  // us the shape corresponding to the next 5 minutes of flight.
  if (waypoints.active) {
    geoPoly = waypoints.getElevationProbeShape(
      lat,
      long,
      trueHeading,
      probeLength
    );
  }

  // If not, what's our terrain "cone", at a distance of 5 minutes,
  // along the heading "we should be flying" based on the autopilot,
  // or just our current heading if heading mode is not engaged.
  if (!geoPoly) {
    const heading = modes[HEADING_MODE]
      ? modes[HEADING_MODE] + declination
      : trueHeading;
    const p1 = getPointAtDistance(lat, long, 1, heading - 90);
    const p2 = getPointAtDistance(lat, long, probeLength, heading);
    const p3 = getPointAtDistance(lat, long, 1, heading + 90);
    geoPoly = [
      [p1.lat, p1.long],
      [p2.lat, p2.long],
      [p3.lat, p3.long],
    ];
  }

  // what's the highest point inside that shape?
  const maxElevation = alos.getMaxElevation(geoPoly);
  const alt = maxElevation.elevation.feet;
  const bracketed = TERRAIN_FOLLOW_SAFETY + ceil(alt / 100) * 100;
  autopilot.setParameters({
    [ALTITUDE_HOLD]: bracketed,
    [TERRAIN_FOLLOW_SHAPE]: geoPoly,
  });
}
