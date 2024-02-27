import { AUTOPILOT_INTERVAL } from "../utils/constants.js";
import { constrain, constrainMap, exceeds } from "../utils/utils.js";
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
const DEFAULT_MAX_dVS = 200;

// Similar to the flyLevel code, we have no features yet, but we'll
// be adding those as we go, so we can quickly and easily compare
// how our code behaves when we turn a feature on or off.
const FEATURES = {
  // initial feature
  TARGET_TO_HOLD: true,
  // additional features
  DAMPEN_CLOSE_TO_ZERO: true,
  // emergency feature!
  EMERGENCY_PROTECTION: true,
};

// Then, our actual "hold altitude" function, which we're going to
// keep as dumb" as the "fly level" code: each time we call it, it
// gets to make a recommendation, without any kind of history tracking
// or future predictions. This keeps the code simple, and allows us
// to hot-reload the code.
export async function altitudeHold(autopilot, flightInformation) {
  // Each plane has different min/max pitch trim values, so
  // let's find out what our current plane's values are:
  const { api, trim, AP_INTERVAL, waypoints } = autopilot;
  const landing = waypoints.isLanding();

  const { data: flightData, model: flightModel } = flightInformation;

  // What are our vertical speed values?
  const { VS, alt, speed, upsideDown } = flightData;
  const { VS: dVS } = flightData.d ?? { VS: 0 };
  const { pitchTrimLimit, climbSpeed, isStubborn } = flightModel;

  // How big should our trim steps be?
  let trimLimit = pitchTrimLimit[0];
  trimLimit = trimLimit === 0 ? 10 : trimLimit;
  let trimStep = trimLimit / 10_000;

  // are we upside down?
  if (upsideDown) {
    trimStep = -2 * trimStep;
  }

  // And what should those parameters be instead, if we want to
  // maintain our specific altitude?
  const maxVS = DEFAULT_MAX_VS;
  const { targetVS, targetAlt, altDiff } = getTargetVS(
    autopilot,
    maxVS,
    alt,
    speed,
    climbSpeed,
    VS,
    dVS
  );
  const diff = targetVS - VS;

  // Thanks kodiak! ...and King Air, I guess
  if (isStubborn) {
    trimStep *= constrainMap(abs(diff), 0, 100, 1, 3);
  }

  // Just like in the flyLevel code, we first determine an update
  // to our trim, and then apply that only once we're done figuring out
  // all the increments and decrements that should involve:
  let update = 0;

  // Set our update to trim towards the correct vertical speed:
  update += constrainMap(diff, -maxVS, maxVS, -trimStep, trimStep);

  // And if we're accelerating too much, counter-act that a little:
  const maxdVS = constrainMap(abs(diff), 0, 100, 0, DEFAULT_MAX_dVS);
  update += constrainMap(dVS, -maxdVS, maxdVS, trimStep, -trimStep);

  // New feature! If we're close to our target, dampen the
  // corrections, so we don't over/undershoot the target too much.
  if (FEATURES.DAMPEN_CLOSE_TO_ZERO) {
    const aDiff = abs(diff);
    if (aDiff < 100) update /= 2;
    if (aDiff < 20) update /= 2;
  }

  // Correct for our update so that we're applying
  // a "partial" update if we're running faster than baseline.
  update *= AP_INTERVAL / AUTOPILOT_INTERVAL;

  // Emergency override for when we're violently pitching.
  // Negative pitch means we're pitching up, positive pitch
  // means we're pitching down (the same goes for dPitch).
  if (FEATURES.EMERGENCY_PROTECTION) {
    // Do we need to intervene?
    const descentThreshold = landing ? 0.75 * DEFAULT_MAX_VS : DEFAULT_MAX_VS;
    const ascentThreshold = landing ? 0.5 * DEFAULT_MAX_VS : DEFAULT_MAX_VS;
    // If we're landing, and our altitude is higher than our target,
    // absolutely do not allow a positive VS. We want to go down, not up.
    const landingViolation = landing && alt > targetAlt && VS > 0;
    const VS_EMERGENCY =
      VS < -descentThreshold || VS > ascentThreshold || landingViolation;

    // Similarly, if we're landing, we don't want wild changes to
    // our vertical speed. We want a glide, not a rollercoaster.
    const thresholdDvs = landing ? DEFAULT_MAX_dVS / 2 : DEFAULT_MAX_dVS;
    const DVS_EMERGENCY = dVS < -thresholdDvs || dVS > thresholdDvs;

    if (VS_EMERGENCY || DVS_EMERGENCY) update = 0;

    const f = 4;
    const fMaxVS = f * maxVS;
    const fMaxdVS = f * maxdVS;
    const fStep = f * trimStep;

    // Are we exceeding our "permissible" vertical speed?
    if (VS_EMERGENCY) {
      console.log(
        `VS emergency! (${VS}/${descentThreshold}/${ascentThreshold})`
      );
      if (landingViolation) {
        // Immediately trim down if we're ascending during
        // landing while we're still above the glide slope:
        update -= fStep / 2;
      } else {
        update += constrainMap(VS, -fMaxVS, fMaxVS, fStep, -fStep);
      }
    }

    // What about the rate of change of our vertical speed?
    if (DVS_EMERGENCY) {
      console.log(`VS delta emergency! (${dVS}/${thresholdDvs})`);
      update += constrainMap(dVS, -fMaxdVS, fMaxdVS, fStep, -fStep);
    }
  }

  trim.pitch += update;
  api.set(`ELEVATOR_TRIM_POSITION`, trim.pitch);
}

// This function determines what our target vertical speed should
// be in order to reach our desired stable flight. For now, this
// function simply sets the target VS to zero, but that's going to
// change almost immediate after we test this code, because we'll
// discover that you can't really "hold an altitude" if you don't
// actually write down what altitude you should be holding =)
function getTargetVS(autopilot, maxVS, alt, speed, climbSpeed, VS, dVS) {
  const { waypoints } = autopilot;
  const landing = waypoints.isLanding();
  let targetVS = DEFAULT_TARGET_VS;
  let targetAlt = undefined;
  let altDiff = undefined;

  // Next feature!
  if (FEATURES.TARGET_TO_HOLD) {
    // Get our hold-altitude from our autopilot mode:
    targetAlt = waypoints.getAltitude(autopilot);
    const plateau = 200;

    if (targetAlt) {
      // And then if we're above that altitude, set a target VS that's negative,
      // and if we're below that altitude, set a target VS that's positive:
      altDiff = targetAlt - alt;
      if (landing) maxVS *= 0.75;
      targetVS = constrainMap(altDiff, -plateau, plateau, -maxVS, maxVS);
    }
  }

  if (FEATURES.EMERGENCY_PROTECTION) {
    // Are we getting dangerously slow during a climb?
    const threshold = climbSpeed + 10;
    if (targetVS > 0 && speed < threshold) {
      console.log(`Speed emergency! (${speed}/${threshold})`);
      targetVS = constrainMap(speed, climbSpeed, threshold, 0, targetVS / 2);
    }
  }

  return { targetVS, targetAlt, altDiff };
}
