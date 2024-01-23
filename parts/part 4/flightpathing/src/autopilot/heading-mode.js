import { HEADING_MODE } from "../utils/constants.js";
import { constrain, constrainMap, getCompassDiff } from "../utils/utils.js";

const { abs, sign } = Math;

const FEATURES = {
  FLY_SPECIFIC_HEADING: true,
};

// Then, our actual "fly level" function, which  we're going to keep very "dumb":
// each time we call it, it gets to make a recommendation, without any kind of
// history tracking or future predictions. This keeps the code simple, and allows
// us to hot-reload the code without ever messing up some kind of "data tracking".
export async function flyLevel(autopilot, flightInformation) {
  // in order to make this work, we'll extend the autopilot with a "trim vector"
  // that lets us update pitch, roll, and yaw trim values on an ongoing basis.
  const { trim, api } = autopilot;
  const { data: flightData, model: flightModel } = flightInformation;
  const { isAcrobatic, isStubborn } = flightModel;
  const { speed, turnRate, bank } = flightData;
  const parameters = Object.assign({ autopilot }, flightModel, flightData);
  let { targetHeading, headingDiff } = getTargetHeading(parameters);

  console.log(
    `--- flying on stick, heading diff = ${headingDiff}, bias = ${trim.aileronOffset}, turn rate = ${turnRate}`
  );

  // Use trim vector as a deflection bias instead
  if (abs(turnRate) < 0.1) {
    trim.aileronOffset -= constrainMap(headingDiff, -3, 3, -10, 10);
  }
  const offset = trim.aileronOffset;
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

  // We may want to base this value on flight model properties:
  let maxStick = -16384 / constrainMap(speed, 100, 200, 5, 8);

  // For acrobatic planes, we need much smaller corrections.
  if (isAcrobatic) {
    maxStick /= constrainMap(abs(headingDiff), 0, 10, 10, 5);
  }

  // Thanks kodiak! ...and King Air, I guess
  if (isStubborn) {
    maxStick *= constrainMap(abs(headingDiff), 0, 10, 1, 3);
  }

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
