import { AUTO_LANDING } from "../utils/constants.js";
import { constrain, constrainMap, getCompassDiff } from "../utils/utils.js";

const { abs, sign } = Math;
const FEATURES = {
  FLY_SPECIFIC_HEADING: true,
};

export async function flyLevel(autopilot, state) {
  const { trim, api, waypoints } = autopilot;
  const { data: flightData, model: flightModel } = state;

  const { weight, wingArea, isAcrobatic } = flightModel;
  const wpa = weight / wingArea;
  const isTwitchy = wpa < 5 || isAcrobatic;

  // get our turn rate
  const { bank, turnRate, upsideDown, lat, long } = flightData;
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
      updateMaxDeflection(
        autopilot,
        trim,
        howMuch,
        isTwitchy,
        weight,
        aHeadingDiff,
        lat,
        long
      );
    }
  }
  // Otherwise just ease it back down, with a special affordance for the Top Rudder:
  else {
    const howMuch = isTwitchy ? -50 : -10;
    updateMaxDeflection(
      autopilot,
      trim,
      howMuch,
      isTwitchy,
      weight,
      aHeadingDiff,
      lat,
      long
    );
  }

  // Are we flying upside down?
  let offset = 0;
  if (upsideDown) {
    // how much are we deviating from 180?
    const tipAngle = bank < 0 ? bank + 180 : bank - 180;

    // If we're tipping too much, reduce our max stick
    // because we were clearly giving it too much:
    if (abs(tipAngle) > 30)
      updateMaxDeflection(
        autopilot,
        trim,
        -50,
        isTwitchy,
        weight,
        aHeadingDiff,
        lat,
        long
      );

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

  // // Try to force our way onto an approach line if we're landing?
  // if (waypoints.isLanding()) {
  //   const landingOffset = constrainMap(headingDiff, -3, 3, -1000, 1000);
  //   console.log(
  //     `heading diff is ${headingDiff}, adding landing offset ${landingOffset}`
  //   );
  //   offset -= landingOffset;
  // }

  // What's our new aileron position?
  let proportion = constrainMap(turnDiff, -3, 3, -1, 1);
  proportion = sign(proportion) * abs(proportion) ** 0.5;

  const maxStick = -trim.roll;
  const newAileron = proportion * maxStick + offset;

  // Ease us into the new aileron if it's too big of a change.
  const { AILERON_POSITION: current } = await api.get(`AILERON_POSITION`);
  const oldAileron = current * -(2 ** 14);
  const diff = constrain(newAileron - oldAileron, -1000, 1000);
  let setValue = oldAileron + diff;
  api.trigger("AILERON_SET", setValue | 0);
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
function updateMaxDeflection(
  autopilot,
  trim,
  byHowMuch,
  isTwitchy,
  weight,
  aHeadingDiff,
  lat,
  long
) {
  const { waypoints, autoLanding } = autopilot;
  let { roll: value } = trim;
  const order = constrainMap(aHeadingDiff, 0, 10, 12, 13);
  const landing = waypoints.isLanding();
  let maxValue = landing
    ? autoLanding.getMaxDeflection(aHeadingDiff, lat, long)
    : 2 ** (isTwitchy ? order - 1 : order);
  // literally ultra light?
  if (weight < 1000) maxValue = 1000;
  value = constrain(value + byHowMuch, 300, maxValue) | 0;
  if (value !== trim.roll) {
    trim.roll = value;
    const prefix = byHowMuch > 0 ? `In` : `De`;
    console.log(`${prefix}creased aileronMaxStick to ${value}`);
  }
}
