import { HEADING_MODE } from "../utils/constants.js";
import { constrain, constrainMap, getCompassDiff } from "../utils/utils.js";

const { abs, sign } = Math;

const FEATURES = {
  FLY_SPECIFIC_HEADING: true,
};

/**
 * A little function that lets us change the maximum stick
 * deflection allowed per autopilot iteration, such that it
 * can never dip below 300, and never exceed 3500.
 */
function correctAileronTrim(trim, byHowMuch) {
  const prefix = byHowMuch > 0 ? `In` : `De`;
  let { aileronMaxStick: value } = trim;
  value = constrain(value + byHowMuch, 300, 3500);
  if (value !== trim.aileronMaxStick) {
    trim.aileronMaxStick = value;
    console.log(`${prefix}creased aileronMaxStick to ${value}`);
  }
}

// Then, our actual "fly level" function, which  we're going to keep very "dumb":
// each time we call it, it gets to make a recommendation, without any kind of
// history tracking or future predictions. This keeps the code simple, and allows
// us to hot-reload the code without ever messing up some kind of "data tracking".
export async function flyLevel(autopilot, flightInformation) {
  // in order to make this work, we'll extend the autopilot with a "trim vector"
  // that lets us update pitch, roll, and yaw trim values on an ongoing basis.
  const { trim, api } = autopilot;
  const { data: flightData, model: flightModel } = flightInformation;
  const { isAcrobatic, isStubborn, weight, wingArea } = flightModel;
  const { speed, turnRate, bank, upsideDown } = flightData;
  const parameters = Object.assign({ autopilot }, flightModel, flightData);
  let { headingDiff } = getTargetHeading(parameters);

  // Use trim vector as a deflection bias instead
  if (abs(turnRate) < 0.1) {
    trim.aileronOffset -= constrainMap(headingDiff, -3, 3, -10, 10);
  }
  let offset = trim.aileronOffset;
  const targetTurnRate = constrainMap(headingDiff, -20, 20, -3, 3);
  const turnDiff = targetTurnRate - turnRate;

  // Boost how much effect a stick change near zero has (sqrt boost):
  let proportion = constrainMap(turnDiff, -3, 3, -1, 1);
  proportion = sign(proportion) * abs(proportion) ** 0.5;

  // While at the same time making sure to dampen corrections near
  // zero. Note that this *compresses* the boost curve, rather than
  // undoing it. (And also note that we boost and dampen based on
  // two different control variables, of course)
  if (abs(headingDiff) < 2) {
    const reduced = proportion / constrain(abs(bank), 1, 10);
    proportion = constrainMap(abs(headingDiff), 0, 2, reduced, proportion);
  }

  // Figure out what our max stick value needs to be for this plane
  // to turn "well enough". We start with a base value, and bump that
  // up if it looks like it's insufficient for heading mode.
  let shift = -trim.aileronMaxStick;
  let maxStick = constrainMap(speed, 100, 200, shift, shift / 1.5);
  const aTurnDiff = abs(turnDiff);
  const aTurnRate = abs(turnRate);
  const aHeadingDiff = abs(headingDiff);

  // Bump up the max stick value if we're not turning fast enough.
  if (aHeadingDiff > 1) {
    const threshold = constrainMap(aTurnDiff, 0, 3, 0, 1);
    if (aTurnRate < threshold || sign(turnRate) !== sign(headingDiff)) {
      correctAileronTrim(trim, isAcrobatic ? 5 : 50);
    }
  } else {
    if (aTurnDiff < 0.5) {
      correctAileronTrim(trim, isAcrobatic ? -5 : -10);
    }
  }

  let tipAngle = bank;
  if (upsideDown) tipAngle = tipAngle < 0 ? tipAngle + 180 : tipAngle - 180;

  if (isAcrobatic) {
    // It's easy to adjust the max stick value to be too much for stunt
    // planes, so we want to monitor our bank angle, and if it's over
    // 30 degrees, aggressively reduce the max stick value.
    if (abs(tipAngle) > 30) {
      correctAileronTrim(trim, -100);
      offset -= tipAngle;
    }

    // Also, if we're flying straight, reduce the max stick
    if (aTurnRate < 0.5 && aHeadingDiff < 1) correctAileronTrim(trim, -5);

    if (upsideDown) {
      // When we're upside down, we need to do a little bit more work to
      // prevent the plane from wanting to right itself when we perform
      // a turn (whether that turn is intentional, or caused by gust/drafts)
      let correction = 0;
      // restrict our bank angle to 30 degrees on either side of 180:
      const s = sign(bank);
      const maxBank = s * constrainMap(abs(headingDiff), 0, 10, 179, 150);

      // Check which direction we need to correct in. We use the fairly
      // naive, but effective enough, logic that if we're sideways then
      // we're about to no longer be upside down, so that needs a huge
      // correction, and if we're flying straight, we don't need any.
      correction = constrainMap(bank, s * 90, maxBank, s * 10_000, 0);
      offset += correction;

      // And because this is *such* an unstable way to fly, we need
      // an additional correction for when we're getting blown off
      // course by even the smallest gust or draft:
      if (abs(headingDiff) > 1) {
        correction = constrainMap(headingDiff, -10, 10, -maxStick, maxStick);
        offset += correction;
      }
    }
  }

  // Some planes respond better to the stick than others, so we
  // bump the amount up by a factor that's based on how much
  // "wing area to weight" the plane has. The smaller the wing,
  // and the heavier the plane, the more we'll want to move the
  // stick in order to effect the right(ish) turn rates.
  const wpa = weight / wingArea;
  let maxFactor = constrainMap(wpa, 4, 20, 1, 3);

  // Just make sure we do that based on how much we need to turn:
  maxStick *= constrainMap(abs(headingDiff), 0, 10, 1, maxFactor);

  // Special ultra-light affordance!
  if (wpa < 5) maxStick /= 4;

  const newAileron = offset + proportion * maxStick;
  return api.trigger("AILERON_SET", newAileron | 0);
}

// And our updated heading function
function getTargetHeading(parameters) {
  const { autopilot, heading, speed, vs1, cruiseSpeed } = parameters;
  let targetHeading = heading;
  let headingDiff = 0;
  if (FEATURES.FLY_SPECIFIC_HEADING) {
    // Check waypoints:
    targetHeading = autopilot.waypoints.getHeading(parameters);
    // If that fails, check AP heading mode:
    if (!targetHeading) targetHeading = autopilot.modes[HEADING_MODE];
    // If *that* fails, use current heading:
    if (!targetHeading) targetHeading = heading;
    headingDiff = getCompassDiff(heading, targetHeading);
    const half = headingDiff / 2;
    headingDiff = constrainMap(speed, vs1, cruiseSpeed, half, headingDiff);
  }
  return { targetHeading, headingDiff };
}
