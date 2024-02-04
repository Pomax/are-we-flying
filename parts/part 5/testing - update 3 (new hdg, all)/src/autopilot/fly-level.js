import { constrainMap, getCompassDiff, lerp } from "../utils/utils.js";

const { abs, sign } = Math;
const FEATURES = {
  FLY_SPECIFIC_HEADING: true,
};

const USE_RATIO = true;

export async function flyLevel(autopilot, state) {
  const { api } = autopilot;
  const { data: flightData, model: flightModel } = state;
  const { aileron, turnRate } = flightData;
  const currentAileron = (aileron / 100) * -16384;
  const parameters = Object.assign({ autopilot }, flightModel, flightData);
  const { headingDiff } = getTargetHeading(parameters);

  const targetTurnRate = constrainMap(headingDiff, -20, 20, -3, 3);
  const turnDiff = targetTurnRate - turnRate;

  let proportion = constrainMap(turnDiff, -3, 3, -1, 1);
  proportion = sign(proportion) * abs(proportion);

  const maxStick = -16384 / 5;
  const newAileron = proportion * maxStick;

  const aileronDiff = abs(currentAileron - newAileron);
  const ratio = constrainMap(aileronDiff, 0, abs(maxStick), 1, 0) ** 0.5;
  const mixed = lerp(USE_RATIO ? ratio : 0, currentAileron, newAileron);

  api.trigger("AILERON_SET", mixed | 0);
}

// And our updated heading function
function getTargetHeading(parameters) {
  const { autopilot, heading, speed, vs1, cruiseSpeed } = parameters;
  let targetHeading = heading;
  let headingDiff = 0;
  if (FEATURES.FLY_SPECIFIC_HEADING) {
    targetHeading = autopilot.waypoints.getHeading(parameters);
    headingDiff = getCompassDiff(heading, targetHeading);
    const half = headingDiff / 2;
    headingDiff = constrainMap(speed, vs1, cruiseSpeed, half, headingDiff);
  }
  return { targetHeading, headingDiff };
}
