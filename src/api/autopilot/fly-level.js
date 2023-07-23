import {
  exceeds,
  degrees,
  radians,
  constrainMap,
  getCompassDiff,
} from "./utils/utils.js";

import { AUTO_TAKEOFF, HEADING_MODE } from "./utils/constants.js";

const { abs } = Math;
const DEFAULT_TARGET_BANK = 0;
const DEFAULT_MAX_TURN_RATE = 3;

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
 *
 * @param {*} autopilot
 * @param {*} state
 */
export async function flyLevel(autopilot, state) {
  const { trim } = autopilot;

  // Our bank/roll information:
  const bank = degrees(state.bankAngle);
  const maxBank = constrainMap(state.speed, 50, 200, 10, 30);
  const dBank = state.dBank;
  const maxdBank = 0.01;

  // How big our corrections are going to be:
  const step = constrainMap(state.speed, 50, 150, radians(1), radians(5)); // kodiak wants 5 instead of 2???!?!?
  const s1 = step;
  const s2 = step / 2;
  const s5 = step / 5;

  // Our "how much are we off" information:
  const turnRate = degrees(state.turnRate);
  const targetData = getTargetBankAndTurnRate(autopilot, state, maxBank);
  const { targetBank, maxTurnRate } = targetData;
  const diff = targetBank - bank;

  // And finally, apply the corrections.
  let update = 0;
  update -= constrainMap(diff, -maxBank, maxBank, -s1, s1);
  update += constrainMap(dBank, -maxdBank, maxdBank, -s2, s2);
  const overshoot = exceeds(turnRate, maxTurnRate);
  if (overshoot !== 0) {
    update -= constrainMap(overshoot, -maxTurnRate, maxTurnRate, -s5, s5);
  }

  if (!isNaN(update)) {
    trim.x += update;

    console.log({
      STAGE: `fly level`,
      bank,
      maxBank,
      targetBank,
      diff,
      dBank,
      overshoot,
      trim: trim.x,
    });

    autopilot.set("AILERON_TRIM_PCT", trim.x);
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
 * @param {*} state
 * @param {*} maxBank
 * @returns
 */
function getTargetBankAndTurnRate(autopilot, state, maxBank) {
  const heading = degrees(state.heading);

  let targetBank = DEFAULT_TARGET_BANK;
  let maxTurnRate = DEFAULT_MAX_TURN_RATE;

  // Are we flying using waypoints?
  updateHeadingFromWaypoint(autopilot, state);

  // If there is an autopilot flight heading set (either because the
  // user set one, or because of the previous waypoint logic) then we
  // set a new target bank, somewhere between zero and the maximum
  // bank angle we want to allow, with the target bank closer to zero
  // the closer we already are to our target heading.
  let flightHeading = autopilot.modes[HEADING_MODE];
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
 * @param {*} autopilot
 * @param {*} state
 * @param {*} waypoint
 * @returns
 */
function updateHeadingFromWaypoint(autopilot, state) {
  if (autopilot.modes[AUTO_TAKEOFF]) return;

  const { waypoints } = autopilot;
  const waypointHeading = waypoints.getHeading(state);
  if (waypointHeading) {
    autopilot.setTarget(HEADING_MODE, waypointHeading);
  }
}
