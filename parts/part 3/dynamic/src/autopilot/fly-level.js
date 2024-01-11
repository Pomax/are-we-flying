import { HEADING_MODE } from "../utils/constants.js";
import { radians, constrainMap, getCompassDiff } from "../utils/utils.js";

const { abs } = Math;

// Some initial constants: we want to level the wings, so we
// want a bank angle of zero degrees:
const DEFAULT_TARGET_BANK = 0;

// And we want to make sure not to turn more than 30 degrees (the
// universal "safe bank angle") when we're correcting the plane.
const DEFAULT_MAX_BANK = 30;

// And, importantly, we also don't want our bank to change by
// more than 3 degrees per second, or we might accelerate past
// zero or our max bank angle too fast.
const DEFAULT_MAX_TURN_RATE = 3;

// Now, we have no "additional features" yet, since this is going
// to be our first pass at writing the wing leveler, but we'll be
// adding a bunch of refinements later on, as we revisit this code,
// so we're going to tie those to "feature flags" that we can easily
// turn on or off to see the difference in-flight.
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

  // Get our current bank/roll information:
  const { data: flightData } = state;
  const { bank, speed, heading } = flightData;
  const { bank: dBank } = flightData.d ?? { bank: 0 };

  // Then, since we're running this over and over, how big should
  // our corrections be at most this iteration? The faster we're going,
  // the bigger a correction we're going to allow:
  const step = constrainMap(speed, 50, 150, radians(1), radians(5));

  // Then, let's figure out "how much are we off by". Right now our
  // target bank angle is zero, but eventually that value is going to
  // be a number that may change every iteration.
  const { targetBank } = getTargetBankAndTurnRate(autopilot, heading);
  const diff = targetBank - bank;

  // Then, we determine a trim update, based on how much we're off by.
  // Negative updates will correct us to the left, positive updates
  // will correct us to the right.
  let update = 0;

  // As our main correction, we're looking directly at our bank difference:
  // the more we're banking, the more we correct, although if we're banking
  // more than "max bank", correct based off the max bank value instead.
  // Also, we'll restrict how much that max bank is based on how fast we're
  // going. Because a hard bank at low speeds is a good way to crash a plane.
  const maxBank = constrainMap(speed, 50, 200, 10, DEFAULT_MAX_BANK);
  update -= constrainMap(diff, -maxBank, maxBank, -step, step);

  // With our main correction determined, we may want to "undo" some of that
  // correction in order not to jerk the plane around. We are, after all,
  // technically still in that plane and we'd like to not get sick =)
  const maxDBank = DEFAULT_MAX_TURN_RATE;
  update += constrainMap(
    dBank,
    -4 * maxDBank,
    4 * maxDBank,
    -2 * step,
    2 * step
  );

  // Then add our update to our trim value, and set the trim in MSFS:
  trim.roll += update;
  api.set(`AILERON_TRIM_PCT`, trim.roll);
}

// And our new function:
function getTargetBankAndTurnRate(autopilot, heading) {
  const { modes } = autopilot;

  let targetBank = DEFAULT_TARGET_BANK;
  let maxBank = DEFAULT_MAX_BANK;
  let maxTurnRate = DEFAULT_MAX_TURN_RATE;

  // If there is an autopilot flight heading set (either because the
  // user set one, or because of the previous waypoint logic) then we
  // set a new target bank, somewhere between zero and the maximum
  // bank angle we want to allow, with the target bank closer to zero
  // the closer we already are to our target heading.
  let flightHeading = FEATURES.FLY_SPECIFIC_HEADING && modes[HEADING_MODE];
  if (flightHeading) {
    const hDiff = getCompassDiff(heading, flightHeading);
    targetBank = constrainMap(hDiff, -30, 30, maxBank, -maxBank);
    maxTurnRate = constrainMap(abs(hDiff), 0, 10, 0.02, maxTurnRate);
  }

  return { targetBank, maxTurnRate };
}
