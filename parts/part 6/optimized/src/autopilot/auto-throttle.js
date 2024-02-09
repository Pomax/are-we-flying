import { ALTITUDE_HOLD, AUTO_THROTTLE } from "../utils/constants.js?t=2";
import { constrain, constrainMap } from "../utils/utils.js";

const { abs } = Math;

export function autoThrottle(autopilot, flightInformation) {
  const { modes } = autopilot;

  const { data: flightData, model: flightModel } = flightInformation;
  const { alt, speed } = flightData;
  const { speed: dV } = flightData.d;
  const { engineCount, cruiseSpeed, weight } = flightModel;

  const targetAlt = modes[ALTITUDE_HOLD];
  const targetSpeed = getTargetSpeed(modes, cruiseSpeed);
  const diff = abs(speed - targetSpeed);

  const threshold = constrainMap(diff, 0, 10, 0.01, 0.2);
  const altFactor = constrainMap(targetAlt - alt, 0, 100, 0, 0.25);

  let step = constrainMap(diff, 0, 50, 1, 5);
  step = constrainMap(weight, 1000, 6000, step / 5, step);

  // throttle up situation
  if (targetSpeed - speed > 2) {
    // console.log(`throttle up`);
    if (dV <= threshold) {
      changeThrottle(autopilot.api, engineCount, step, 25, 100);
    }
    // do we need to climb? then throttle up a bit more
    if (alt < targetAlt - 50) {
      // console.log(`climbimg`);
      changeThrottle(autopilot.api, engineCount, altFactor * step, 25, 100);
    }
    // are we speeding up more than desired?
    if (dV > threshold) {
      changeThrottle(autopilot.api, engineCount, step / 4, 25, 100);
    }
  }

  // throttle down situation
  if (speed - targetSpeed > 2) {
    // console.log(`throttle down`);
    if (dV >= -3 * threshold) {
      // console.log(`dV range good, throttling down`);
      changeThrottle(autopilot.api, engineCount, -step, 25, 100);
    }
    // do we need to descend? then throttle down a bit more
    if (alt > targetAlt + 50) {
      // console.log(`descending`);
      changeThrottle(autopilot.api, engineCount, -altFactor * step, 25, 100);
    }
    // Are we slowing down more than desired?
    if (dV < -3 * threshold) {
      // console.log(`dV too low, throttling up`);
      changeThrottle(autopilot.api, engineCount, step / 4, 25, 100);
    }
  }
}

function getTargetSpeed(modes, cruiseSpeed) {
  const ATT = parseFloat(modes[AUTO_THROTTLE]);
  let targetSpeed = isNaN(ATT) ? cruiseSpeed : ATT;
  return targetSpeed;
}

async function changeThrottle(
  api,
  engineCount = 4,
  byHowMuch,
  floor = 0,
  ceiling = 100
) {
  let newThrottle;
  for (let count = 1; count <= engineCount; count++) {
    const simVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:${count}`;
    const throttle = (await api.get(simVar))[simVar];
    if (
      (byHowMuch < 0 && throttle > floor) ||
      (byHowMuch > 0 && throttle < ceiling)
    ) {
      newThrottle = constrain(throttle + byHowMuch, floor, ceiling);
      api.set(simVar, newThrottle);
    }
  }
  const simVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:1`;
  newThrottle = (await api.get(simVar))[simVar];
  return newThrottle;
}
