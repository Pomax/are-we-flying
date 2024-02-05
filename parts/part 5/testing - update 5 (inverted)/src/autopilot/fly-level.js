import {
  constrain,
  constrainMap,
  getCompassDiff,
  lerp,
} from "../utils/utils.js";

const { abs, sign } = Math;
const FEATURES = {
  FLY_SPECIFIC_HEADING: true,
};

export async function flyLevel(autopilot, state) {
  const { trim, api } = autopilot;
  const { data: flightData, model: flightModel } = state;

  const { weight, wingArea, isAcrobatic } = flightModel;
  const wpa = weight / wingArea;
  const isTwitchy = wpa < 5 || isAcrobatic;

  // get our turn rate
  const { bank, turnRate, upsideDown } = flightData;
  const aTurnRate = abs(turnRate);

  // get our target heading
  const parameters = Object.assign({ autopilot }, flightModel, flightData);
  const { headingDiff } = getTargetHeading(parameters);
  const aHeadingDiff = abs(headingDiff);

  // so we can get our target turn rate, with a special affordance for the Top Rudder:
  const maxTurn = wpa < 5 ? 2 : 3;
  const targetTurnRate = constrainMap(headingDiff, -20, 20, -maxTurn, maxTurn);
  const turnDiff = targetTurnRate - turnRate;
  const aTurnDiff = abs(turnDiff);

  // Bump up the max stick value if we're not turning fast enough.
  if (aHeadingDiff > 1) {
    const threshold = constrainMap(aTurnDiff, 0, 3, 0, 1);
    const regularTurn = aTurnRate < threshold;
    const hardTurn = aHeadingDiff > 30 && aTurnRate < 2.5;
    const wrongWay = sign(turnRate) !== sign(headingDiff);
    if (regularTurn || hardTurn || wrongWay) {
      const howMuch = isAcrobatic ? 10 : 50;
      updateMaxDeflection(trim, howMuch, isTwitchy);
    }
  }
  // Otherwise just ease it back down, with a special affordance for the Top Rudder:
  else {
    const howMuch = isTwitchy ? -50 : -10;
    updateMaxDeflection(trim, howMuch, isTwitchy);
  }

  // Are we flying upside down?
  let offset = 0;
  if (upsideDown) {
    // how much are we deviating from 180?
    const tipAngle = bank < 0 ? bank + 180 : bank - 180;

    // If we're tipping too much, reduce our max stick
    // because we were clearly giving it too much:
    if (abs(tipAngle) > 30) updateMaxDeflection(trim, -50, isTwitchy);

    // And restrict our bank angle to 30 degrees on either side of 180:
    const s = sign(bank);
    const maxBankAngle = s * constrainMap(aHeadingDiff, 0, 10, 179, 150);
    offset += constrainMap(bank, s * 90, maxBankAngle, s * 2 ** 13, 0);

    // And because this is *such* an unstable way to fly, we need
    // an additional correction for when we're getting blown off
    // course by even the smallest gust or draft:
    if (aHeadingDiff > 2) {
      offset -= constrainMap(headingDiff, -10, 10, -500, 500);
    }
  }

  let proportion = constrainMap(turnDiff, -3, 3, -1, 1);
  proportion = sign(proportion) * abs(proportion);

  const maxStick = -trim.roll;
  const newAileron = proportion * maxStick + offset;
  api.trigger("AILERON_SET", newAileron | 0);
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

// A little helper function that lets us change the maximum stick
// deflection allowed per autopilot iteration.
function updateMaxDeflection(trim, byHowMuch, isTwitchy) {
  let { roll: value } = trim;
  const maxValue = 2 ** (isTwitchy ? 12 : 13);
  value = constrain(value + byHowMuch, 300, maxValue) | 0;
  if (value !== trim.roll) {
    trim.roll = value;
    const prefix = byHowMuch > 0 ? `In` : `De`;
    console.log(`${prefix}creased aileronMaxStick to ${value}`);
  }
}
