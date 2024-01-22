import { HEADING_MODE } from "../utils/constants.js";
import { constrainMap, getCompassDiff } from "../utils/utils.js";

const { abs, sign } = Math;

const FEATURES = {
  FLY_SPECIFIC_HEADING: true,
};

// Then, our actual "fly level" function, which  we're going to keep very "dumb":
// each time we call it, it gets to make a recommendation, without any kind of
// history tracking or future predictions. This keeps the code simple, and allows
// us to hot-reload the code without ever messing up some kind of "data tracking".
export async function flyLevel(autopilot, state) {
  // in order to make this work, we'll extend the autopilot with a "trim vector"
  // that lets us update pitch, roll, and yaw trim values on an ongoing basis.
  const { trim, api } = autopilot;
  const { data: flightData, model: flightModel } = state;
  const { vs1, cruiseSpeed } = flightModel;
  const { lat, long, declination, speed, heading, turnRate } = flightData;
  const parameters = {
    autopilot,
    heading,
    lat,
    long,
    declination,
    speed,
    vs1,
    cruiseSpeed,
  };
  let { headingDiff } = getTargetHeading(parameters);

  console.log(
    `--- flying on stick, heading diff = ${headingDiff}, bias = ${trim.roll}`
  );

  // Use trim vector as a deflection bias instead
  if (abs(headingDiff) < 5) {
    trim.roll -= constrainMap(headingDiff, -3, 3, -10, 10);
  }
  const offset = trim.roll;
  const targetTurnRate = constrainMap(headingDiff, -20, 20, -3, 3);
  const turnDiff = targetTurnRate - turnRate;

  // Boost how much the stick changes near zero (sqrt boost), but dampen
  // the overall stick deflection the closer we are to our target heading.
  let proportion = constrainMap(turnDiff, -3, 3, -1, 1);
  proportion = sign(proportion) * abs(proportion) ** 0.5;
  proportion = constrainMap(
    abs(headingDiff),
    0,
    20,
    proportion / 10,
    proportion
  );

  // We may want to base this value on flight model properties:
  const maxStick = -16384 / constrainMap(speed, 100, 200, 5, 8);
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
    console.log(targetHeading, headingDiff);
    const half = headingDiff / 2;
    headingDiff = constrainMap(speed, vs1, cruiseSpeed, half, headingDiff);
  }
  return { targetHeading, headingDiff };
}
