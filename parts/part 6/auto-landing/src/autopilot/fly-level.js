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
  const { trim, api, waypoints } = autopilot;
  const { data: flightData, model: flightModel } = state;

  const { weight, wingArea, isAcrobatic } = flightModel;
  const wpa = weight / wingArea;
  const isTwitchy = wpa < 5 || isAcrobatic;

  // get our turn rate
  const { bank, turnRate, upsideDown, lat, long, d } = flightData;
  const { heading: dHeading } = d || { heading: 0 };
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

  const params = { isTwitchy, weight, aHeadingDiff, lat, long };

  // Bump up the max stick value if we're not turning fast enough.
  if (aHeadingDiff > 1) {
    const threshold = constrainMap(aTurnDiff, 0, 6, 0, 2);
    const regularTurn = aTurnRate < threshold;
    const hardTurn = aHeadingDiff > 30 && aTurnRate < 2.5;
    const wrongWay = sign(turnRate) !== sign(headingDiff);
    if (regularTurn || hardTurn || wrongWay) {
      updateMaxDeflection(
        autopilot,
        trim,
        isAcrobatic ? 10 : regularTurn ? 20 : 50,
        params
      );
    }
  }
  // while at the same time always decreasing the max deflection
  // by a tiny amount every tick.
  updateMaxDeflection(autopilot, trim, -10, params);

  // Are we flying upside down?
  let offset = 0;
  if (upsideDown) {
    // how much are we deviating from 180?
    const tipAngle = bank < 0 ? bank + 180 : bank - 180;

    // If we're tipping too much, reduce our max stick
    // because we were clearly giving it too much:
    if (abs(tipAngle) > 30) updateMaxDeflection(autopilot, trim, -50, params);

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

  // Use linear feedback, except when we're flying almost straight,
  // in which case we want to boost the handling so that we get
  // back on our "intended line" faster than if we were to just
  // slowly creep back towards it. We do this by raising our proportion
  // value, which will be in [-1, 1], by some power lower than 1
  // (which boosts the curve centered on zero) based on the difference
  // in intended heading and current plane heading
  let maxStick = -trim.roll;
  let proportion = constrainMap(turnDiff, -3, 3, -1, 1);
  const power = constrain(aHeadingDiff, 0.3, 1);
  proportion = sign(proportion) * abs(proportion) ** power;

  // Are we turning out of control?
  const emergency = abs(dHeading) > 10 && sign(dHeading) === sign(headingDiff);
  if (emergency) {
    proportion = proportion / 10;
    updateMaxDeflection(autopilot, trim, -250, params);
  }

  const newAileron = proportion * maxStick + offset;
  const { AILERON_POSITION: current } = await api.get(`AILERON_POSITION`);
  const oldAileron = current * -(2 ** 14);
  const diff = constrain(newAileron - oldAileron, -1000, 1000);

  // FIXME: TODO: this feels super weird in-game, it's a constant left-and-right
  const setValue = oldAileron + diff;
  const newValue = lerp(0.25, oldAileron, setValue);
  api.trigger("AILERON_SET", newValue | 0);
}

// And our updated heading function
function getTargetHeading(parameters) {
  const { autopilot, heading, flightHeading, speed, vs1, cruiseSpeed } =
    parameters;
  const { waypoints } = autopilot;

  // console.log({ heading, flightHeading });

  let targetHeading = waypoints.isLanding ? flightHeading : heading;
  let uncappedHeadingDiff = 0;
  if (FEATURES.FLY_SPECIFIC_HEADING) {
    targetHeading = waypoints.getHeading(parameters);
    uncappedHeadingDiff = getCompassDiff(heading, targetHeading);
    const half = uncappedHeadingDiff / 2;
    uncappedHeadingDiff = constrainMap(
      speed,
      vs1,
      cruiseSpeed,
      half,
      uncappedHeadingDiff
    );
  }
  // Make sure that our heading difference is never reported as more than
  // 30 degrees, even if it *is* more, so we don't yank the yoke.
  const headingDiff = constrain(uncappedHeadingDiff, -60, 60);
  return { targetHeading, headingDiff, uncappedHeadingDiff };
}

// A little helper function that lets us change the maximum stick
// deflection allowed per autopilot iteration.
function updateMaxDeflection(
  autopilot,
  trim,
  byHowMuch,
  { isTwitchy, weight, aHeadingDiff, lat, long }
) {
  let { roll: value } = trim;
  const order = constrainMap(aHeadingDiff, 0, 10, 12, 13);
  let maxValue = 2 ** (isTwitchy ? order - 1 : order);
  // literally ultra light?
  if (weight < 1000) maxValue = 1000;
  value = constrain(value + byHowMuch, 300, maxValue) | 0;
  if (value !== trim.roll) {
    trim.roll = value;
    const prefix = byHowMuch > 0 ? `In` : `De`;
    console.log(`${prefix}creased aileronMaxStick to ${value}`);
  }
}
