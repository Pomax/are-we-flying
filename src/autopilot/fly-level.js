import {
  radians,
  constrainMap,
  getCompassDiff,
} from "../utils/utils.js";

import { AUTO_TAKEOFF, HEADING_MODE } from "../utils/constants.js";
import { AutoPilot } from "./autopilot.js";

const { abs } = Math;
const DEFAULT_TARGET_BANK = 0;
const DEFAULT_MAX_TURN_RATE = 3;
const DEFAULT_MAX_BANK = 30;

// Test constants
const FEATURES = {
  EMERGENCY_PROTECTION: false, // does nothing yet.
  FLY_SPECIFIC_HEADING: true,
  UPDATE_FROM_WAYPOINTS: true,
};

export const LOAD_TIME = Date.now();

/**
 * In order to fly in the direction we should be going, our goal is to end up
 * in a situation where our bank (i.e. roll) as well as the speed at which our
 * bank is changing (i.e. whether our roll is changing) are both zero.
 *
 * To do so, we're going to trim the plane just a little, such that "how much
 * we're off" will be slightly smaller the next time this functions runs. And
 * since this function will run over and over and over until we turn off the
 * autopilot's LVL function, this should eventually level us out.
 *
 * trim adjustments: positive numbers tip us to the right, negative to the left.
 *.get(
 * @param {*} autopilot
 */
export async function flyLevel(autopilot, { data: flightData }) {
  const { trim } = autopilot;
  const { bank, speed, heading, lat, long, declination } = flightData;
  const { bank: dBank } = flightData.d ?? { bank: 0 };

  // Our bank/roll information:
  const maxBank = constrainMap(speed, 50, 200, 10, DEFAULT_MAX_BANK);
  const maxdBank = DEFAULT_MAX_TURN_RATE;

  // How big our corrections are going to be:
  const step = constrainMap(speed, 50, 150, radians(1), radians(5));

  // Our "how much are we off" information:
  const { targetBank } = getTargetBankAndTurnRate(
    autopilot,
    heading,
    lat,
    long,
    speed,
    declination,
    maxBank
  );
  const diff = targetBank - bank;

  // And finally, apply the corrections.
  let update = 0;
  update -= constrainMap(diff, -maxBank, maxBank, -step, step);
  update += constrainMap(dBank, -maxdBank, maxdBank, -step / 2, step / 2);

  if (FEATURES.EMERGENCY_PROTECTION) {
    // ...what would be a good policy to pr
  }

  if (!isNaN(update)) {
    trim.roll += update;
    autopilot.set("AILERON_TRIM_PCT", trim.roll);
  }
}

/**
 * If we're note flying a heading and we just need to fly straight, then
 * our target bank angle should be zero, but if we do need to fly a specific
 * heading, then we can set a non-zero bank angle, depending on how far from
 * the intended heading we are, and the closer we get to the intended heading,
 * the closer the target bank angle should get to zero.
 *
 * @param {*} autopilot
 * @returns
 */
function getTargetBankAndTurnRate(
  autopilot,
  heading,
  lat,
  long,
  speed,
  declination,
  maxBank
) {
  let targetBank = DEFAULT_TARGET_BANK;
  let maxTurnRate = DEFAULT_MAX_TURN_RATE;

  // Are we flying using waypoints?
  if (FEATURES.UPDATE_FROM_WAYPOINTS) {
    updateHeadingFromWaypoint(
      autopilot,
      heading,
      lat,
      long,
      speed,
      declination
    );
  }

  // If there is an autopilot flight heading set (either because the
  // user set one, or because of the previous waypoint logic) then we
  // set a new target bank, somewhere between zero and the maximum
  // bank angle we want to allow, with the target bank closer to zero
  // the closer we already are to our target heading.
  let flightHeading =
    FEATURES.FLY_SPECIFIC_HEADING && autopilot.modes[HEADING_MODE];

  if (flightHeading) {
    const hDiff = getCompassDiff(heading, flightHeading);
    targetBank = constrainMap(hDiff, -30, 30, maxBank, -maxBank);
    maxTurnRate = constrainMap(abs(hDiff), 0, 10, 0.02, maxTurnRate);
  }

  return { targetBank, maxTurnRate };
}

/**
 * Are we supposed to fly towards a specific waypoint? If so,
 * our heading may change over time, since the Earth's magnetic
 * field is pretty non-uniform. As such, every time this runs,
 * we'll need to check  what heading we actually need to fly.
 *
 * @param {AutoPilot} autopilot
 * @returns
 */
function updateHeadingFromWaypoint(
  autopilot,
  heading,
  lat,
  long,
  speed,
  declination
) {
  if (autopilot.modes[AUTO_TAKEOFF]) return;

  const { waypoints } = autopilot;
  const N = waypoints.length;
  if (N === 0) return;

  const waypointHeading = waypoints.getHeading(
    heading,
    lat,
    long,
    speed,
    declination
  );
  if (waypointHeading) {
    autopilot.setTarget(HEADING_MODE, waypointHeading);
  }
}
