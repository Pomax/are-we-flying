import { ALTITUDE_HOLD } from "../utils/constants.js";
import { constrain, constrainMap } from "../utils/utils.js";
const { abs, sign } = Math;

// Our default vertical speed target, if we want to hold our current
// altitude, is obviously zero.
const DEFAULT_TARGET_VS = 0;

// Also, we don't want our vertical speed to exceed 1000 feet per
// minute, although depending on what's happening that might change.
const DEFAULT_MAX_VS = 1000;

// And in order to make sure that in trying to reach that target
// from whatever our current vertical speed is, we limit by
// how much the vertical speed's allowed to change per iteration.
const DEFAULT_MAX_dVS = 100;

// Similar to the flyLevel code, we have no features yet, but we'll
// be adding those as we go, so we can quickly and easily compare
// how our code behaves when we turn a feature on or off.
const FEATURES = {
  BOOST_SMALL_CORRECTIONS: true,
  DAMPEN_CLOSE_TO_ZERO: true,
  SKIP_TINY_UPDATES: true,
  LIMIT_TRIM_TO_100: true,
  SMOOTH_RAMP_UP: true,
  TARGET_TO_HOLD: true,
};

// Then, our actual "hold altitude" function, which we're going to
// keep as dumb" as the "fly level" code: each time we call it, it
// gets to make a recommendation, without any kind of history tracking
// or future predictions. This keeps the code simple, and allows us
// to hot-reload the code.
export async function altitudeHold(autopilot, flightInformation) {
  // Each plane has different min/max pitch trim values, so
  // let's find out what our current plane's values are:
  const { api, trim } = autopilot;
  const { data: flightData, model: flightModel } = flightInformation;

  // What are our vertical speed values?
  const { VS, alt } = flightData;
  const { VS: dVS } = flightData.d ?? { VS: 0 };
  const { pitchTrimLimit } = flightModel;

  // How big should our trim steps be?
  let trimLimit = pitchTrimLimit[0];
  trimLimit = trimLimit === 0 ? 10 : trimLimit;
  let trimStep = trimLimit / 10_000;

  // And what should those parameters be instead, if want to maintain our altitude?
  const maxVS = DEFAULT_MAX_VS;
  const { targetVS } = getTargetVS(autopilot, maxVS, alt, VS);
  const diff = targetVS - VS;

  // Just like in the flyLevel code, we first determine an update
  // to our trim, and then apply that only once we're done figuring out
  // all the increments and decrements that should involve:
  let update = 0;

  // Set our update to trim towards the correct vertical speed:
  update += constrainMap(diff, -maxVS, maxVS, -trimStep, trimStep);

  // And if we're accelerating too much, counter-act that a little:
  const maxdVS = constrainMap(abs(diff), 0, 100, 0, DEFAULT_MAX_dVS);
  update -= constrainMap(
    dVS,
    -4 * maxdVS,
    4 * maxdVS,
    -2 * trimStep,
    2 * trimStep
  );

  // New feature! If we're close to our target, dampen the
  // corrections, so we don't over/undershoot the target too much.
  if (FEATURES.DAMPEN_CLOSE_TO_ZERO) {
    const aDiff = abs(diff);
    if (aDiff < 100) update /= 2;
    if (aDiff < 20) update /= 2;
  }

  const updateMagnitude = update / trimStep;

  // "undampen" updates when we're moving in the wrong direction
  if (
    FEATURES.BOOST_SMALL_CORRECTIONS &&
    sign(targetVS) !== sign(VS) &&
    sign(targetVS) !== sign(dVS) &&
    abs(updateMagnitude) < 0.05
  ) {
    update *= 2;
  }

  // Skip tiny updates if we're already moving in the right direction
  if (
    FEATURES.SKIP_TINY_UPDATES &&
    sign(targetVS) === sign(VS) &&
    abs(updateMagnitude) < 0.001
  ) {
    return;
  }

  // Finally, apply the new trim value:
  trim.pitch += update;
  if (FEATURES.LIMIT_TRIM_TO_100) {
    trim.pitch = constrain(trim.pitch, -Math.PI / 20, Math.PI / 20);
  }
  api.set(`ELEVATOR_TRIM_POSITION`, trim.pitch);
}

// This function determines what our target vertical speed should
// be in order to reach our desired stable flight. For now, this
// function simply sets the target VS to zero, but that's going to
// change almost immediate after we test this code, because we'll
// discover that you can't really "hold an altitude" if you don't
// actually write down what altitude you should be holding =)
function getTargetVS(autopilot, maxVS, alt, VS) {
  const { modes } = autopilot;
  let targetVS = DEFAULT_TARGET_VS;
  let targetAlt = undefined;
  let altDiff = undefined;

  // Next feature!
  if (FEATURES.TARGET_TO_HOLD) {
    // Get our hold-altitude from our autopilot mode:
    targetAlt = modes[ALTITUDE_HOLD];
    const plateau = 200;

    if (targetAlt) {
      // And then if we're above that altitude, set a target VS that's negative,
      // and if we're below that altitude, set a target VS that's positive:
      altDiff = targetAlt - alt;
      targetVS = constrainMap(altDiff, -plateau, plateau, -maxVS, maxVS);
    }

    // And third feature!
    if (FEATURES.SMOOTH_RAMP_UP) {
      const direction = sign(altDiff);

      // If we're more than <plateau> feet away from our target, ramp
      // our target up to maxVS, and keep it there.
      if (abs(altDiff) > plateau) {
        // start ramping up our vertical speed until we're at maxVS
        if (abs(VS) < maxVS) {
          const step = direction * plateau;
          targetVS = constrain(VS + step, -maxVS, maxVS);
        } else {
          targetVS = direction * maxVS;
        }
      }

      // And if we're close to the target, start reducing our target
      // speed such that our target VS is zero at our target altitude.
      else {
        targetVS = constrainMap(altDiff, -plateau, plateau, -maxVS, maxVS);
      }
    }
  }

  return { targetVS };
}
