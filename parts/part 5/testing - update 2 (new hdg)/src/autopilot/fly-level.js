import { radians, constrainMap, getCompassDiff } from "../utils/utils.js";

const { abs, sign } = Math;

// Some initial constants: we want to level the wings, so we
// want a bank angle of zero degrees:
const DEFAULT_TARGET_BANK = 0;

// First off, the counter-steering that we've got going on will
// effectively ensure we never actually get the speed we list here.
// As such, we can bump this from 30 to 40, to increase the max
// bank that planes exhibit:
const DEFAULT_MAX_BANK = 40;

// Next, in order to allow planes to change their rate of turn
// faster, we bump this up from 3 to 5. This might introduce some
// oscillation when we get hit from the side by a good old gust
// of wind, but we'll take "being wibbly" over "being dead":
const DEFAULT_MAX_D_BANK = 5;

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
  const parameters = Object.assign({}, flightModel, flightData);

  // Get our current bank/roll information:
  const { bank, speed, turnRate } = flightData;
  const { bank: dBank } = flightData.d ?? { bank: 0 };

  // And our model data
  const { hasAileronTrim, weight, isAcrobatic, vs1, cruiseSpeed } = flightModel;
  const useStickInstead = hasAileronTrim === false;

  // If we're near stall speed, any amount of turn may kill us...
  // And if we're near cruise speed, we can turn quite a bit:
  let step = constrainMap(speed, vs1, cruiseSpeed, radians(0.1), radians(5));

  // Then, let's figure out "how much are we off by". Right now our
  // target bank angle is zero, but eventually that value is going to
  // be a number that may change every iteration.
  const maxBank = constrainMap(speed, 50, 200, 10, DEFAULT_MAX_BANK);
  const { targetBank, maxDBank, targetHeading, headingDiff } =
    getTargetBankAndTurnRate(autopilot, maxBank, parameters);
  const aHeadingDiff = abs(headingDiff);
  const diff = targetBank - bank;

  // Then, if we're flying on the stick, we target a turn rate that lets
  // cover the heading difference at a resonable speed.
  if (useStickInstead) {
    const targetTurnRate = constrainMap(headingDiff, -20, 20, -3, 3);
    const turnDiff = targetTurnRate - turnRate;
    // But we do need to boost stick changes the closer to zero
    // we get, because otherwise ramp-up and ramp-down takes too long:
    let proportion = constrainMap(turnDiff, -3, 3, -1, 1);
    proportion = sign(proportion) * abs(proportion);
    // And we may want to base the "max stick deflection" value on
    // flight model properties, but for now this will do:
    const maxStick = -16384 / 5;
    const newAileron = proportion * maxStick;
    // "eary exit" when we're flying on stick.
    return api.trigger("AILERON_SET", newAileron | 0);
  }

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
  let bankDiff = constrainMap(diff, -maxBank, maxBank, -2 * step, 2 * step);

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
function getTargetBankAndTurnRate(
  autopilot,
  maxBank,
  { heading, isAcrobatic, lat, long, declination, speed, vs1, cruiseSpeed }
) {
  let targetBank = DEFAULT_TARGET_BANK;
  let maxDBank = DEFAULT_MAX_D_BANK;

  if (!FEATURES.FLY_SPECIFIC_HEADING) {
    return { targetBank, maxDBank, heading, headingDiff: 0 };
  }

  let targetHeading = autopilot.waypoints.getHeading({
    autopilot,
    heading,
    lat,
    long,
    declination,
    speed,
    vs1,
    cruiseSpeed,
  });

  let headingDiff;
  if (targetHeading) {
    headingDiff = getCompassDiff(heading, targetHeading);
    if (!isAcrobatic) headingDiff /= 2;
    targetBank = constrainMap(headingDiff, -30, 30, maxBank, -maxBank);
    // And then let's not restrict our rate of bank until we're 2 degrees,
    // from our target heading, rather than 10 degrees. And let's also make
    // sure to allow for *some* change in rate of bank at 0.
    maxDBank = constrainMap(abs(headingDiff), 0, 2, maxDBank / 10, maxDBank);
  }

  return { targetBank, maxDBank, targetHeading, headingDiff };
}
