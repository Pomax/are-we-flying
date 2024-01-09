import { radians, constrain, constrainMap, nf } from "../utils/utils.js";
import {
  ALTITUDE_HOLD,
  AUTO_THROTTLE,
  AUTO_TAKEOFF,
  KNOT_IN_FPS,
  TERRAIN_FOLLOW,
  FPS_IN_KNOTS,
  AUTO_LAND,
} from "../utils/constants.js";

const { abs, round, sign } = Math;

const DEFAULT_TARGET_VS = 0;
const DEFAULT_MAX_dVS = 100;
const DEFAULT_MAX_VS = 1000;

// FIXME: TODO: elevator should work a little more aggressively, so we don't crash on auto-land

// Test constants
const FEATURES = {
  EMERGENCY_PROTECTION: false,
  COUNTER_SPEED_PROTECTION: true,
  DROP_PROTECTION: true,
  DAMPEN_CLOSE_TO_ZERO: true,
  TARGET_TO_HOLD: true,
  SMOOTH_RAMP_UP: true,
  STALL_PROTECTION: false, // Do we... still need this? Now that we have smooth ramping?
  SKIP_TINY_UPDATES: true,
  BOOST_SMALL_CORRECTIONS: true,
};

// how much above/below the current VS we want to peg target speeds
const PLATEAU = 200;

// The elevator trim uses a super weird unit, where +/- 100% maps
// to "pi divided by 10", i.e. +/- 0.31415[...], so we need to
// have steps that make sense in radians: our small step roughly
// maps to a 0.002% step, and our large step maps to roughly 0.2%
const SMALL_TRIM = radians(0.001);
const LARGE_TRIM = radians(0.035);

// if we're in autolanding mode, we want a tracking value
let previousTargetVS = false;

export const LOAD_TIME = Date.now();

// =================================================================================================================================

/**
 * TODO: add stick-based alternative to trim
 * @param {*} autopilot
 * @param {*} param1
 * @returns
 */
export async function altitudeHold(
  autopilot,
  { data: flightData, model: flightModel },
  useStickInstead = false
) {
  // The local and state values we'll be working with:
  const { glide, modes, trim } = autopilot;

  // ========================
  // START OF INLINE FUNCTION
  // ========================
  async function updateTrim(update) {
    // A helper function that lets us update the trim vector
    // and then set the plane's trim based on the new value,
    // while making sure we never trim more than 1% per tick.
    const directUpdate = modes[AUTO_LAND];
    const { ELEVATOR_TRIM_POSITION: currentPosition } = await autopilot.get(
      "ELEVATOR_TRIM_POSITION"
    );

    // are we gliding, and are we trimming down?
    if (directUpdate && glide && update < 0) {
      // trim by less than we normally would, so we don't drop too fast.
      update /= 3;
    }

    // if we're autolanding, correct by as much as needed to get the job done.
    if (directUpdate) {
      trim.pitch = trim.pitch + update;
    }

    // if not, limit by how much we can change per tick
    else {
      const percent = (v) => (1000 * v) / Math.PI;
      const position = (v) => (Math.PI * v) / 1000;
      const current = percent(currentPosition);
      const lower = current - constrainMap(speed, 100, 200, 5, 1);
      const higher = current + constrainMap(speed, 100, 200, 5, 1);
      const lowPos = position(lower);
      const highPos = position(higher);
      trim.pitch = constrain(trim.pitch + update, lowPos, highPos);
    }
    autopilot.set("ELEVATOR_TRIM_POSITION", trim.pitch);
  }
  // ======================
  // END OF INLINE FUNCTION
  // ======================

  // are we allowed to trim?
  if (trim.pitchLocked) return;

  // TODO: trim more is the gear is down on a retractible-gear plane

  const { VS, speed, pitch, alt } = flightData;
  const { VS: dVS, pitch: dPitch } = flightData.d ?? { VS: 0, pitch: 0 };

  // How big should our trim steps be?
  const { pitchTrimLimit, isAcrobatic } = flightModel;
  let trimLimit = pitchTrimLimit[0];
  trimLimit = trimLimit === 0 ? 10 : trimLimit;
  const small = constrainMap(trimLimit, 5, 20, SMALL_TRIM, LARGE_TRIM);
  // the more we pitch down, the bigger the trim step needs to be so we can level out faster
  const upperLimit = constrainMap(pitch, 0, 10, 10, 100);
  let trimStep = constrainMap(speed, 50, 200, 5, upperLimit) * small;

  // console.log(`upperLimit: ${upperLimit}, trimStep: ${trimStep}`);

  // Are we "trimming" on the stick?
  let elevator = 0;
  if (useStickInstead) {
    console.log(`ALT on stick`);
    autopilot.set("ELEVATOR_TRIM_POSITION", 0);
    // FIXME: TODO: what's this value based on?
    trimStep = 5;
    // The following value is in the range [-1, 1]
    elevator = (await autopilot.get(`ELEVATOR_POSITION`)).ELEVATOR_POSITION;
    console.log(`elevator: ${elevator}`);
  }

  // acrobatic planes need considerably smaller corrections than regular planes
  else if (isAcrobatic) trimStep /= 5;

  // What are our VS parameters?
  let maxVS = (isAcrobatic ? 2 : 1) * DEFAULT_MAX_VS;
  maxVS = constrainMap(speed, 30, 100, maxVS / 10, maxVS);
  let { targetVS, altDiff, direction } = await getTargetVS(
    autopilot,
    flightData,
    flightModel,
    maxVS
  );

  // Restrict the target to always be within reason with respect
  // to VS, unless VS itself was unreasonable already, of course.
  targetVS = constrain(
    //constrain(
    targetVS,
    -maxVS,
    maxVS
  );

  const diff = targetVS - VS;

  // Do some console stats
  // console.log(
  //   `pitch = ${nf(pitch)}, dPitch = ${nf(dPitch)}, maxVS: ${nf(
  //     maxVS
  //   )}, targetVS: ${nf(targetVS)}, VS: ${nf(VS)}, dVS: ${nf(dVS)}, diff: ${nf(
  //     diff
  //   )}, speed: ${nf(speed)}`
  // );

  // Nudge us towards the correct vertical speed
  let update = 0;
  update += constrainMap(diff, -maxVS, maxVS, -trimStep, trimStep);

  // If we accelerating too much, stop doing that.
  const maxdVS = constrainMap(abs(diff), 0, 100, 0, DEFAULT_MAX_dVS);
  update -= constrainMap(dVS, -maxdVS, maxdVS, -trimStep / 2, trimStep / 2);

  // And, try to keep us within reasonable pitch-change thresholds
  update += constrainMap(dPitch, -1, 1, -trimStep / 4, trimStep / 4);

  if (FEATURES.DAMPEN_CLOSE_TO_ZERO) {
    // Scale the effect of our nudge so that the closer we are to our
    // target, the less we actually adjust the trim. This is essentially
    // a "dampening" to prevent oscillating, where we over-correct, then
    // over-correct the other way in response, then over-correct in response
    // to THAT, and so on and so on.
    const aDiff = abs(diff);
    // if (aDiff < 100) update /= 2;
    // if (aDiff < 20) update /= 2;
    if (aDiff < 100) {
      if (aDiff < 50) {
        update = constrainMap(aDiff, 5, 50, update / 10, update / 2);
      } else {
        update = constrainMap(aDiff, 50, 100, update / 2, update);
      }
    }
  }

  if (!isNaN(update)) {
    const updateMagnitude = update / trimStep;

    // Skip tiny updates if we're already moving in the right direction
    if (FEATURES.SKIP_TINY_UPDATES) {
      if (sign(targetVS) === sign(VS) && abs(updateMagnitude) < 0.001) return;
    }

    // Boost small updates if we're moving in the wrong direction
    if (FEATURES.BOOST_SMALL_CORRECTIONS) {
      if (sign(targetVS) !== sign(VS) && abs(updateMagnitude) < 0.01)
        update *= 2;
    }

    if (useStickInstead) {
      // add the update, scaled to [-1, 1]
      const newValue = elevator + update / 100;
      // then trigger an aileron set action, scaled to the sim's [-16k, 16k] range
      autopilot.trigger("ELEVATOR_SET", (-16000 * newValue) | 0);
    } else {
      updateTrim(update);
    }
  }
}

// =================================================================================================================================

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
async function getTargetVS(autopilot, flightData, flightModel, maxVS) {
  if (!FEATURES.TARGET_TO_HOLD) {
    return {
      targetVS: DEFAULT_TARGET_VS,
    };
  }

  const { isAcrobatic } = flightModel;
  const { alt: currentAltitude, VS, speed } = flightData;
  let targetVS = DEFAULT_TARGET_VS;
  let direction = undefined;
  let altDiff = undefined;
  const PLATEAU = 200;

  // Are we flying using waypoints?
  updateAltitudeFromWaypoint(autopilot);

  // Are we supposed to fly a specific altitude?
  const targetAltitude = autopilot.modes[ALTITUDE_HOLD];
  if (targetAltitude) {
    altDiff = targetAltitude - currentAltitude;

    // positive = we need +VS, negative = we need -VS
    direction = sign(altDiff);

    if (FEATURES.SMOOTH_RAMP_UP) {
      // If we're more than 200 feet away from our target, ramp
      // our target up to maxVS, and keep it there.
      if (abs(altDiff) > PLATEAU) {
        // start ramping up our vertical speed until we're at maxVS
        if (abs(VS) < maxVS) {
          // if we haven't reached maxVS yet, slowly ramp up by 10fpm each iteration
          const step = direction * PLATEAU;
          targetVS = constrain(VS + step, -maxVS, maxVS);
        } else {
          // otherwise our target is simply max VS
          targetVS = direction * maxVS;
        }

        // FIXME: we can probably improve things here to make sure we don't hang
        //        around in the "drifting away from the target" territory.
      }

      // Else, if we're close to the target, start reducing our target
      // speed such that our target VS is zero at our target altitude.
      else {
        targetVS = constrainMap(altDiff, -PLATEAU, PLATEAU, -maxVS, maxVS);
      }
    }

    // if we're not smooth-ramping, we just target maxVs
    else {
      targetVS = constrainMap(altDiff, -PLATEAU, PLATEAU, -maxVS, maxVS);
    }
  }

  return { targetVS, altDiff, direction };
}

// =================================================================================================================================

/**
 * Are we supposed to fly towards a specific waypoint, and are
 * we not in terrain follow mode? Then we'll need to get our
 * altitude information from the waypoints themselves.
 *
 * @param {*} autopilot
 * @param {*} waypoint
 * @returns
 */
function updateAltitudeFromWaypoint(autopilot) {
  // Ignore this instruction if we're in the middle of taking of
  if (autopilot.modes[AUTO_TAKEOFF]) return;

  // Or if we're in terrain-follow more, which trumps waypoints.
  if (autopilot.modes[TERRAIN_FOLLOW]) return;

  // Or if we're flying an auto-landing
  if (autopilot.modes[AUTO_LAND]) return;

  // In fact, do we even have any waypoints to work with?
  const { waypoints } = autopilot;
  if (!waypoints.hasActive()) return;

  // We do, find the altitude we should be flying.
  const waypointAltitude = waypoints.getAltitude();
  if (waypointAltitude) {
    autopilot.setTarget(ALTITUDE_HOLD, waypointAltitude);
  }
}
