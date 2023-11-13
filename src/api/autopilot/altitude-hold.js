import {
  radians,
  constrain,
  constrainMap,
  exceeds,
  nf,
} from "./utils/utils.js";
import { changeThrottle } from "./utils/controls.js";
import {
  ALTITUDE_HOLD,
  AUTO_THROTTLE,
  AUTO_TAKEOFF,
  KNOT_IN_FPS,
  TERRAIN_FOLLOW,
  FPS_IN_KNOTS,
} from "./utils/constants.js";

const { abs, round, sign } = Math;
const DEFAULT_TARGET_VS = 0;
const DEFAULT_MAX_dVS = 100;
const DEFAULT_MAX_VS = 1000;

// Test constants
const EMERGENCY_PROTECTION = true;
const DAMPEN_CLOSE_TO_ZERO = true;
const TARGET_TO_HOLD = true;
const SMOOTH_RAMP_UP = true;
const STALL_PROTECTION = true;

// The elevator trim uses a super weird unit, where +/- 100% maps
// to "pi divided by 10", i.e. +/- 0.31415[...], so we need to
// have steps that make sense in radians: our small step roughly
// maps to a 0.002% step, and our large step maps to roughly 0.2%
const SMALL_TRIM = radians(0.001);
const LARGE_TRIM = radians(0.035);

export const LOAD_TIME = Date.now();

export async function altitudeHold(autopilot, state) {
  // How big should our trim steps be?
  const { trim } = autopilot;
  let trimLimit = state.pitchTrimLimit[0];
  trimLimit = trimLimit === 0 ? 10 : trimLimit;
  const small = constrainMap(trimLimit, 5, 20, SMALL_TRIM, LARGE_TRIM);
  const { speed } = state;
  let trimStep = constrainMap(speed, 50, 200, 5, 20) * small;

  // Quick check: are we pitching *way* out of control?
  const { dPitch } = state;
  const dPitchLimit = 2;
  const pitchExcess = exceeds(dPitch, dPitchLimit);
  if (pitchExcess !== 0) {
    console.log(`--bad, excess: ${pitchExcess}`);
    const MF = constrainMap(speed, 50, 200, 20, 100);
    trim.y += constrainMap(pitchExcess, -MF, MF, -MF * trimStep, MF * trimStep);
    if (EMERGENCY_PROTECTION) {
      return autopilot.set("ELEVATOR_TRIM_POSITION", trim.y);
    }
  }

  // What are our VS parameters?
  const { verticalSpeed: VS, dVS } = state;
  const maxVS = constrainMap(
    speed,
    30,
    100,
    DEFAULT_MAX_VS / 10,
    DEFAULT_MAX_VS
  );
  let { targetVS } = TARGET_TO_HOLD
    ? await getTargetVS(autopilot, state, maxVS)
    : { targetVS: DEFAULT_TARGET_VS };
  const diff = targetVS - VS;

  // Nudge us towards the correct vertical speed
  let update = 0;
  update += constrainMap(diff, -maxVS, maxVS, -trimStep, trimStep);

  // If we accelerating too much, stop doing that.
  const maxdVS = constrainMap(abs(diff), 0, 100, 0, DEFAULT_MAX_dVS);
  update -= constrainMap(dVS, -maxdVS, maxdVS, -trimStep / 2, trimStep / 2);

  // Do some console stats
  console.log(
    `dPitch = ${nf(dPitch)}, maxVS: ${nf(maxVS)}, targetVS: ${nf(
      targetVS
    )}, VS: ${nf(VS)}, dVS: ${nf(dVS)}`
  );

  if (DAMPEN_CLOSE_TO_ZERO) {
    // Scale the effect of our nudge so that the closer we are to our
    // target, the less we actually adjust the trim. This is essentially
    // a "dampening" to prevent oscillating, where we over-correct, then
    // over-correct the other way in response, then over-correct in response
    // to THAT, and so on and so on.
    const aDiff = abs(diff);
    // if (aDiff < 100) {update /= 2;
    // if (aDiff < 20) update /= 2;
    if (aDiff < 200) {
      update = constrainMap(aDiff, 5, 200, update / 10, update);
    }
  }

  if (!isNaN(update)) {
    trim.y += update;

    // // We can't trim past +/- 100% of the trim range.
    // if ((trim.y * 10) / Math.PI < -100) trim.y = -Math.PI / 20;
    // if ((trim.y * 10) / Math.PI > 100) trim.y = Math.PI / 20;
    trim.y = constrain(trim.y, -Math.PI / 20, Math.PI / 20);

    autopilot.set("ELEVATOR_TRIM_POSITION", trim.y);
  }
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
  const { altitude: currentAltitude, verticalSpeed: VS, speed } = state;
  let targetVS = DEFAULT_TARGET_VS;
  let altDiff = undefined;

  // Are we flying using waypoints?
  updateAltitudeFromWaypoint(autopilot, state);

  // Are we supposed to fly a specific altitude?
  const targetAltitude = autopilot.modes[ALTITUDE_HOLD];
  if (targetAltitude) {
    altDiff = targetAltitude - currentAltitude;

    // positive = we need +VS, negative = we need -VS
    const direction = sign(altDiff);
    const plateau = 200;

    if (SMOOTH_RAMP_UP) {
      // If we're more than 200 feet away from our target, ramp
      // our target up to maxVS, and keep it there.
      if (abs(altDiff) > plateau) {
        // start ramping up our vertical speed until we're at maxVS
        if (abs(VS) < maxVS) {
          // if we haven't reached maxVS yet, slowly ramp up by 10fpm each iteration
          const step = direction * plateau;
          targetVS = constrain(VS + step, -maxVS, maxVS);
        } else {
          // otherwise our target is simply max VS
          targetVS = direction * maxVS;
        }
      }

      // if we're close to the target, start reducing our target speed
      // such that our target VS is zero at our target altitude.
      else {
        targetVS = constrainMap(altDiff, -plateau, plateau, -maxVS, maxVS);
      }
    }

    // if we're not smooth-ramping, we just target maxVs
    else {
      targetVS = constrainMap(altDiff, -plateau, plateau, -maxVS, maxVS);
    }

    // If we are, then we also want to boost our ability to control
    // vertical speed, by using a (naive) auto-throttle procedure.
    if (autopilot.modes[AUTO_THROTTLE]) {
      targetVS = await autoThrottle(state, autopilot.api, altDiff, targetVS);
    }
  }

  if (STALL_PROTECTION) {
    // And of course: if we're close to our stall speed, and we need to
    // climb, *CLIMB LESS FAST*. A simple rule, but really important.
    if (targetVS > 0) {
      let { DESIGN_SPEED_VS1: ds_vs1, DESIGN_SPEED_CLIMB: ds_c } =
        await autopilot.api.get(`DESIGN_SPEED_CLIMB`, `DESIGN_SPEED_VS1`);
      // We don't want feet per second, we want knots:
      const cruiseSpeed = ds_c * FPS_IN_KNOTS;
      const stallSpeed = ds_vs1 * FPS_IN_KNOTS;
      targetVS = constrainMap(
        speed,
        stallSpeed,
        cruiseSpeed,
        targetVS / 2,
        targetVS
      );
    }
  }

  return { targetVS, altDiff };
}

const ATT_PROPERTIES = [
  `DESIGN_SPEED_CLIMB`,
  `DESIGN_SPEED_VC`,
  `NUMBER_OF_ENGINES`,
  `OVERSPEED_WARNING`,
];

/**
 * Check our air speed: if we're descending we can easily end up over-speeding and
 * damaging the plane, whereas if we're flying up, we need max throttle, and in
 * level flight we want to cruise at "our rated cruise speed".
 *
 * @param {*} state
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
  } = await api.get(...ATT_PROPERTIES);

  // we want these values in knots, not feet per second
  const cruiseSpeed = round(vc / KNOT_IN_FPS);
  const climbSpeed = round(sc / KNOT_IN_FPS);
  const throttleStep = 0.2;
  const tinyStep = throttleStep / 10;
  const ALT_LIMIT = 200;
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

  // If we're not, and we need to descend, throttle (mostly) down to maintain a safe speed.
  else if (altDiff < -ALT_LIMIT) {
    // console.log(`altDiff < -${ALT_LIMIT}`);
    if (speed > cruiseSpeed + BRACKET) {
      // console.log(`throttle down from ${speed} to cruise speed (${cruiseSpeed})`);
      change(-adjustment / 2);
    } else if (speed < cruiseSpeed - BRACKET) {
      // console.log(`throttle up from ${speed} to cruise speed (${cruiseSpeed})`);
      change(adjustment / 4);
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
  // Ignore this instruction if we're in the middle of taking of
  if (autopilot.modes[AUTO_TAKEOFF]) return;

  // Or if we're in terrain-follow more, which trumps waypoints.
  if (autopilot.modes[TERRAIN_FOLLOW]) return;

  // In fact, do we even have any waypoints to work with?
  const { waypoints } = autopilot;
  if (!waypoints.hasActive()) return;

  // We do, find the altitude we should be flying.
  const waypointAltitude = waypoints.getAltitude(state);
  if (waypointAltitude) {
    autopilot.setTarget(ALTITUDE_HOLD, waypointAltitude);
  }
}
