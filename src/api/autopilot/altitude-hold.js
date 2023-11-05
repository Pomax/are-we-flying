import { radians, constrainMap, exceeds } from "./utils/utils.js";
import { changeThrottle } from "./utils/controls.js";
import {
  ALTITUDE_HOLD,
  AUTO_THROTTLE,
  AUTO_TAKEOFF,
  KNOT_IN_FPS,
  TERRAIN_FOLLOW,
} from "./utils/constants.js";
import { State } from "./utils/ap-state.js";

const { abs, round } = Math;
const DEFAULT_TARGET_VS = 0;
const DEFAULT_MAX_dVS = 100;
const SMALL_TRIM = radians(0.001);
const LARGE_TRIM = radians(0.035);

export async function altitudeHold(autopilot, state) {
  // How big should our trim steps be?
  const { trim } = autopilot;
  let trimLimit = state.pitchTrimLimit[0];
  trimLimit = trimLimit === 0 ? 10 : trimLimit;
  const small = constrainMap(trimLimit, 5, 20, SMALL_TRIM, LARGE_TRIM);
  const trimStep = 10 * small;

  // What are our VS parameters?
  const { verticalSpeed: VS, dVS } = state;
  const maxVS = 1000;
  const targetVS = await getTargetVS(autopilot, state, maxVS);
  const diff = targetVS - VS;

  // Nudge us towards the correct vertical speed
  let update = 0;
  update += constrainMap(diff, -maxVS, maxVS, -trimStep, trimStep);

  // If we accelerating too much, stop doing that.
  const maxdVS = constrainMap(abs(diff), 0, 100, 0, DEFAULT_MAX_dVS);
  const dVSovershoot = exceeds(dVS, maxdVS);
  update -= constrainMap(dVSovershoot, -maxdVS, maxdVS, -trimStep, trimStep);

  // Scale the effect of our nudge so that the close we are to our
  // target, the less we actually adjust the trim. This is essentially
  // a "dampening" to prevent oscillating, where we over-correct, then
  // over-correct the other way in response, then over-correct in response
  // to THAT, and so on and so on.
  if (abs(diff) < 100) update /= 2;
  if (abs(diff) < 20) update /= 2;

  if (!isNaN(update)) {
    const proximityFactor = constrainMap(abs(diff), 0, 100, 0.1, 1); // EXPERIMENTAL
    trim.y += update * proximityFactor;
  }

  // We can't trim past +/- 100% of the trim range.
  if ((trim.y * 10) / Math.PI < -100) trim.y = -Math.PI / 20;
  if ((trim.y * 10) / Math.PI > 100) trim.y = Math.PI / 20;
  // console.log(trim.y);

  autopilot.set("ELEVATOR_TRIM_POSITION", trim.y);
}

/**
 * Check to see if we need to set a non-zero vertical speed based
 * pn whether or not the user turned on Altitude Hold mode with a
 * specific altitude set.
 *
 * And if they have, add in auto-throttling so that out climbs and
 * descents are controlled by known safe speeds (hopefully).
 * @param {*} autopilot
 * @param {*} state
 * @param {*} maxVS
 * @returns
 */
async function getTargetVS(autopilot, state, maxVS) {
  let targetVS = DEFAULT_TARGET_VS;

  // Are we flying using waypoints?
  updateAltitudeFromWaypoint(autopilot, state);

  // Are we supposed to fly a specific altitude?
  const targetAltitude = autopilot.modes[ALTITUDE_HOLD];
  if (targetAltitude) {
    const altDiff = targetAltitude - state.altitude;
    targetVS = constrainMap(altDiff, -200, 200, -maxVS, maxVS);

    // If we are, then we also want to boost our ability to control
    // vertical speed, by using a (naive) auto-throttle procedure.
    if (autopilot.modes[AUTO_THROTTLE]) {
      targetVS = await autoThrottle(state, autopilot.api, altDiff, targetVS);
    }
  }

  // Safety: if we're close to our stall speed, and we need to climb,
  // CLIMB LESS FAST. Simple rule, but really important.
  if (targetVS > 0) {
    const { DESIGN_SPEED_CLIMB: dsc, DESIGN_SPEED_VS1: dsvs1 } = state;
    targetVS = constrainMap(state.speed, dsvs1, dsc, targetVS / 2, targetVS);
  }

  return targetVS;
}

/**
 * Check our air speed: if we're descending we can easily end up over-speeding and
 * damaging the plane, whereas if we're flying up, we need max throttle, and in
 * level flight we want to cruise at "our rated cruise speed".
 *
 * @param {State} state
 * @param {*} api
 * @param {*} altDiff
 */
async function autoThrottle(state, api, altDiff, targetVS) {
  const { verticalSpeed: VS } = state;
  const speed = round(state.speed);

  const {
    DESIGN_SPEED_CLIMB: sc,
    DESIGN_SPEED_VC: vc,
    NUMBER_OF_ENGINES: engineCount,
    OVERSPEED_WARNING: overSpeed,
  } = state;

  // we want these values in knots, not feet per second
  const cruiseSpeed = round(vc / KNOT_IN_FPS);
  const climbSpeed = round(sc / KNOT_IN_FPS);
  const throttleStep = 0.2;
  const tinyStep = throttleStep / 10;
  const ALT_LIMIT = 50;
  const BRACKET = 2;

  const adjustment = constrainMap(
    abs(altDiff),
    0,
    ALT_LIMIT,
    tinyStep,
    throttleStep
  );

  const change = (v) => changeThrottle(api, engineCount, v);

  // Are we at/near cruise altitude with a VS that's stable enough that we can throttle?
  if (abs(altDiff) < ALT_LIMIT) {
    // console.log(`at/near cruise altitude`);
    if (speed < cruiseSpeed - BRACKET && VS < 15) {
      // console.log(`throttle up from ${speed} to cruise speed (${cruiseSpeed})`);
      change(
        constrainMap(cruiseSpeed - speed, 0, 10, adjustment, throttleStep)
      );
    }
    if (speed > cruiseSpeed + BRACKET && VS > -15) {
      // console.log(`throttle down from ${speed} to cruise speed (${cruiseSpeed})`);
      change(
        -constrainMap(speed - cruiseSpeed, 0, 10, adjustment, throttleStep)
      );
    }
  }

  // If we're not, and we need to climb, throttle the plane up to optimal climb speed.
  else if (altDiff > ALT_LIMIT) {
    // console.log(`altDiff > ${ALT_LIMIT}`);
    if (speed < climbSpeed) {
      // console.log(`throttle up from ${speed} to climb speed (${climbSpeed})`);
      change(adjustment);
    } else if (VS < 0.8 * targetVS) {
      // console.log(`throttle up to increase VS from ${VS} to ${targetVS}`);
      change(adjustment);
    }
  }

  // If we're not, and we need to descend, throttle (mostly down) to maintain a safe speed.
  else if (altDiff < -ALT_LIMIT) {
    // console.log(`altDiff < -${ALT_LIMIT}`);
    if (speed > cruiseSpeed + BRACKET) {
      // console.log(`throttle down from ${speed} to cruise speed (${cruiseSpeed})`);
      change(-adjustment);
    } else if (speed < cruiseSpeed - BRACKET) {
      // console.log(`throttle up from ${speed} to cruise speed (${cruiseSpeed})`);
      change(adjustment / 2);
    }
    // Also, as this represents a potentially dangerous situation, we should be aiming for a slower descent.
    return constrainMap(speed, climbSpeed - 20, climbSpeed, 0, targetVS);
  }

  // If the over-speed warning is going off, drastically reduce speed
  // (although over-speeding is mostly a jumbo jet issue).
  if (overSpeed === 1) {
    // console.log(`!!! over-speed !!!`);
    change(-5 * throttleStep);
  }

  return targetVS;
}

/**
 * Are we supposed to fly towards a specific waypoint, and are
 * we not in terrain follow mode? Then we'll need to get our
 * altitude information from the waypoints themselves.
 *
 * @param {*} autopilot
 * @param {*} state
 * @param {*} waypoint
 * @returns
 */
function updateAltitudeFromWaypoint(autopilot, state) {
  if (autopilot.modes[AUTO_TAKEOFF]) return;
  if (autopilot.modes[TERRAIN_FOLLOW]) return;

  const { waypoints } = autopilot;
  const waypointAltitude = waypoints.getAltitude(state);
  if (waypointAltitude) {
    autopilot.setTarget(ALTITUDE_HOLD, waypointAltitude);
  }
}
