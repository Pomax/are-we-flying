import { ALTITUDE_HOLD, TERRAIN_FOLLOW_SAFETY } from "../utils/constants.js";
import { getPointAtDistance } from "../utils/utils.js";

import dotenv from "dotenv";
dotenv.config({ path: `${import.meta.dirname}/../../../../../.env` });
const { ALOS_PORT: PORT } = process.env;

const KNOTS_IN_KM_PER_MINUTE = 0.0308667;
const { ceil } = Math;

export async function terrainFollow(autopilot, flightInformation) {
  // what's our terrain "cone", at a distance of 5 minutes
  const { lat, long, heading, speed } = flightInformation.data;
  const probeLength = speed * KNOTS_IN_KM_PER_MINUTE * 5;
  const p1 = getPointAtDistance(lat, long, 1, heading - 90);
  const p2 = getPointAtDistance(lat, long, probeLength, heading);
  const p3 = getPointAtDistance(lat, long, 1, heading + 90);

  // what's the highest point in that code?
  const args = [p1.lat, p1.long, p2.lat, p2.long, p3.lat, p3.long].join(`,`);
  const url = `http://localhost:${PORT}/?poly=${args}`;
  const alosResponse = await fetch(url);
  const { result } = await alosResponse.json();
  const alt = result.elevation.feet;
  const bracketed = TERRAIN_FOLLOW_SAFETY + ceil(alt / 100) * 100;
  autopilot.setParameters({ [ALTITUDE_HOLD]: bracketed });
}
