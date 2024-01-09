import { ALTITUDE_HOLD, AUTO_THROTTLE } from "../utils/constants.js";
import { changeThrottle } from "../utils/controls.js";
import { constrainMap, nf } from "../utils/utils.js";

const { abs } = Math;

export function autoThrottle(
  autopilot,
  { data: flightData, model: flightModel }
) {
  const { modes } = autopilot;
  const { alt, speed } = flightData;
  const { speed: dV } = flightData.d;
  const { engineCount, isAcrobatic } = flightModel;
  const targetAlt = modes[ALTITUDE_HOLD];
  const targetSpeed = getTargetSpeed(modes, flightModel);
  const diff = abs(speed - targetSpeed);
  const threshold = constrainMap(diff, 0, 10, 0.01, 0.2);
  const altFactor = constrainMap(targetAlt - alt, 0, 100, 0, 0.25);
  const f = isAcrobatic ? 1 / 5 : 1;
  const step = constrainMap(diff, 0, 50, f * 1, f * 5);

  console.log(
    `[autothrottle] speed: ${nf(speed)}, target speed: ${nf(
      targetSpeed
    )}, dV: ${nf(dV)}, threshold: ${nf(threshold)}, step: ${nf(
      step
    )}, altitude: ${nf(alt)}, target altitude: ${nf(targetAlt)}`
  );

  // throttle up situation
  if (targetSpeed - speed > 2) {
    console.log(`throttle up`);
    if (dV <= threshold) {
      changeThrottle(autopilot.api, engineCount, step, 25, 100);
    }
    // do we need to climb? then throttle up a bit more
    if (alt < targetAlt - 50) {
      console.log(`climbimg`);
      changeThrottle(autopilot.api, engineCount, altFactor * step, 25, 100);
    }
    // are we speeding up more than desired?
    if (!isAcrobatic && dV > threshold) {
      changeThrottle(autopilot.api, engineCount, step / 4, 25, 100);
    }
  }

  // throttle down situation
  if (speed - targetSpeed > 2) {
    console.log(`throttle down`);
    if (dV >= -3 * threshold) {
      console.log(`dV range good, throttling down`);
      changeThrottle(autopilot.api, engineCount, -step, 25, 100);
    }
    // do we need to descend? then throttle down a bit more
    if (alt > targetAlt + 50) {
      console.log(`descending`);
      changeThrottle(autopilot.api, engineCount, -altFactor * step, 25, 100);
    }
    // Are we slowing down more than desired?
    if (!isAcrobatic && dV < -3 * threshold) {
      console.log(`dV too low, throttling up`);
      changeThrottle(autopilot.api, engineCount, step / 4, 25, 100);
    }
  }
}

function getTargetSpeed(modes, flightModel) {
  const { cruiseSpeed } = flightModel;
  const ATT = parseFloat(modes[AUTO_THROTTLE]);
  let targetSpeed = isNaN(ATT) ? cruiseSpeed : ATT;
  return targetSpeed;
}
