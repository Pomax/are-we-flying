import { HEADING_MODE } from "../utils/constants.js";
import { radians, constrainMap, getCompassDiff } from "../utils/utils.js";

const { abs, sign } = Math;

// Some initial constants: we want to level the wings, so we
// want a bank angle of zero degrees:
const DEFAULT_TARGET_BANK = 0;

// And we want to make sure not to turn more than 30 degrees (the
// universal "safe bank angle") when we're correcting the plane.
const DEFAULT_MAX_BANK = 30;

// And, importantly, we also don't want our bank to change by
// more than 3 degrees per second, or we might accelerate past
// zero or our max bank angle too fast.
const DEFAULT_MAX_D_BANK = 3;

// Now, we have no "additional features" yet, since this is going
// to be our first pass at writing the wing leveler, but we'll be
// adding a bunch of refinements later on, as we revisit this code,
// so we're going to tie those to "feature flags" that we can easily
// turn on or off to see the difference in-flight.
const FEATURES = {
  // initial feature
  FLY_SPECIFIC_HEADING: true,
  // additional features
  DAMPEN_CLOSE_TO_ZERO: true,
  SNAP_TO_HEADING: true,
};

// "snap to heading" settings
const BUMP_FACTOR = 1.8;

// Then, our actual "fly level" function, which  we're going to keep very "dumb":
// each time we call it, it gets to make a recommendation, without any kind of
// history tracking or future predictions. This keeps the code simple, and allows
// us to hot-reload the code without ever messing up some kind of "data tracking".
export async function flyLevel(autopilot, state) {
  // in order to make this work, we'll extend the autopilot with a "trim vector"
  // that lets us update pitch, roll, and yaw trim values on an ongoing basis.
  const { trim, api } = autopilot;
  const { data: flightData, model: flightModel } = state;

  // Get our current bank/roll information:
  const { aileronTrim, bank, speed, heading, turnRate } = flightData;
  const { bank: dBank } = flightData.d ?? { bank: 0 };

  // And our model data
  const { hasAileronTrim, weight, isAcrobatic } = flightModel;
  const useStickInstead = hasAileronTrim === false;

  // Then, since we're running this over and over, how big should
  // our corrections be at most this iteration? The faster we're going,
  // the bigger a correction we're going to allow:
  let step = constrainMap(speed, 20, 150, radians(0.1), radians(5));

  // Are we "trimming" on the stick?
  let aileron = 0;
  if (useStickInstead) {
    step = constrainMap(weight, 1000, 6000, 1, 3);
    aileron = flightData.aileron / 100; // make sure aileron is in the range [-1,1]
  }

  // Then, let's figure out "how much are we off by". Right now our
  // target bank angle is zero, but eventually that value is going to
  // be a number that may change every iteration.
  const maxBank = constrainMap(speed, 50, 200, 10, DEFAULT_MAX_BANK);
  const { targetBank, maxDBank, targetHeading, headingDiff } =
    getTargetBankAndTurnRate(autopilot, heading, maxBank, isAcrobatic);
  const aHeadingDiff = abs(headingDiff);
  const diff = targetBank - bank;

  if (isAcrobatic) {
    step = constrainMap(aHeadingDiff, 0, 10, step / 5, step / 20);
  }

  // Then, we determine a trim update, based on how much we're off by.
  // Negative updates will correct us to the left, positive updates
  // will correct us to the right.
  let update = 0;

  // As our main correction, we're looking directly at our bank difference:
  // the more we're banking, the more we correct, although if we're banking
  // more than "max bank", correct based off the max bank value instead.
  // Also, we'll restrict how much that max bank is based on how fast we're
  // going. Because a hard bank at low speeds is a good way to crash a plane.
  let bankDiff = constrainMap(diff, -maxBank, maxBank, -step, step);

  // boost the heck out of "slowing down" as we reach our target heading.
  if (FEATURES.SNAP_TO_HEADING) {
    if (aHeadingDiff > 0.5 && aHeadingDiff < 5) {
      const bump = BUMP_FACTOR;
      bankDiff *= bump;
      if (aHeadingDiff < 2) {
        bankDiff *= bump;
        if (aHeadingDiff < 1) {
          bankDiff *= bump;
        }
      }
    }
  }

  update -= bankDiff;

  // With our main correction determined, we may want to
  // "undo" some of that correction in order not to jerk
  // the plane around. We are, after all, technically still
  // in that plane and we'd like to not get sick =)
  update += constrainMap(dBank, -maxDBank, maxDBank, -step / 2, step / 2);

  // New feature! If we're close to our target, dampen the
  // corrections, so we don't over/undershoot the target too much.
  if (FEATURES.DAMPEN_CLOSE_TO_ZERO) {
    const aDiff = abs(diff);
    if (aDiff < 2) update /= 2;
  }

  // console.log({
  //   aileronTrim,
  //   speed,
  //   heading,
  //   targetHeading,
  //   headingDiff,
  //   bank,
  //   maxBank,
  //   dBank,
  //   maxDBank,
  //   targetBank,
  //   diff,
  //   turnRate,
  //   step,
  //   update,
  // });

  // If we're banking too hard, counter trim by "a lot".
  if (FEATURES.EMERGENCY_PROTECTION) {
    if (bank < -maxBank || bank > maxBank) {
      console.log(`Bank emergency!`);
      const cap = 10 * maxBank;
      const emergencyStep = radians(maxBank);
      update = constrainMap(bank, -cap, cap, -emergencyStep, emergencyStep);
    }
  }

  if (useStickInstead) {
    // add the update, scaled to [-1, 1], then trigger an aileron set
    // action, scaled to the sim's [-16k, 16k] range
    const position = aileron + update / 100;
    api.trigger("AILERON_SET", (-16384 * position) | 0);
  } else {
    trim.roll += update;
    api.set("AILERON_TRIM_PCT", trim.roll);
  }
}

// And our new function:
function getTargetBankAndTurnRate(autopilot, heading, maxBank, isAcrobatic) {
  const { modes } = autopilot;

  let targetBank = DEFAULT_TARGET_BANK;
  let maxDBank = DEFAULT_MAX_D_BANK;

  // If there is an autopilot flight heading set (either because the
  // user set one, or because of the previous waypoint logic) then we
  // set a new target bank, somewhere between zero and the maximum
  // bank angle we want to allow, with the target bank closer to zero
  // the closer we already are to our target heading.
  let targetHeading = FEATURES.FLY_SPECIFIC_HEADING && modes[HEADING_MODE];

  let headingDiff;
  if (targetHeading) {
    headingDiff = getCompassDiff(heading, targetHeading);
    if (!isAcrobatic) headingDiff /= 2;
    targetBank = constrainMap(headingDiff, -30, 30, maxBank, -maxBank);
    maxDBank = constrainMap(abs(headingDiff), 0, 10, 0, maxDBank);
  }

  return { targetBank, maxDBank, targetHeading, headingDiff };
}
