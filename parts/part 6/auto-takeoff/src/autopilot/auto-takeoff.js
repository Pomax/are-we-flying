import {
  constrain,
  constrainMap,
  project,
  getPointAtDistance,
  getDistanceBetweenPoints,
  getCompassDiff,
  getHeadingFromTo,
} from "../utils/utils.js";
import {
  AUTO_THROTTLE,
  LEVEL_FLIGHT,
  ALTITUDE_HOLD,
  HEADING_MODE,
  TERRAIN_FOLLOW,
  AUTO_TAKEOFF,
} from "../utils/constants.js";

const { abs } = Math;
const MIN_VS = 500;

export class AutoTakeoff {
  constructor(autopilot) {
    this.autopilot = autopilot;
    this.api = autopilot.api;
    this.prepped = false;
    this.headings = [];
    this.tailCompensation = 0;
    this.done = false;
    this.hDiff = 0;
  }

  async run(flightInformation) {
    if (this.done) return;
    const { model: flightModel, data: flightData } = flightInformation;

    // prep the plane for roll
    if (!this.prepped) return this.prepForRoll(flightModel, flightData);

    // Throttle up (if we can)
    this.throttleUp(flightModel, flightData);

    // And try to keep us rolling in a straight line:
    this.autoRudder(flightModel, flightData);

    // Is it time to actually take off?
    this.checkRotation(flightModel, flightData);

    // Is it time to hand off flight to the regular auto pilot?
    this.checkHandoff(flightModel, flightData);
  }

  // We'll look at the implementations for all of these in a bit

  // what are our preroll settings?
  async prepForRoll(
    { isTailDragger, engineCount },
    {
      alt,
      lat,
      long,
      flaps,
      parkingBrake,
      heading,
      trueHeading,
      tailWheelLock,
      wheelsOnGround,
    }
  ) {
    const { api } = this;
    console.log(`prep for roll`);

    // Cache our takeoff line: we'll need it for auto-rudder.
    this.heading = trueHeading;
    this.headings.push(trueHeading);
    this.start = getPointAtDistance(lat, long, -1, trueHeading);
    this.end = getPointAtDistance(lat, long, 10, trueHeading);
    this.wheelsOnGround = wheelsOnGround;
    // set the heading bug
    api.set(`AUTOPILOT_HEADING_LOCK_DIR`, heading);

    // Ensure our barometric altimeter is calibrated
    api.trigger(`BAROMETRIC`);

    // Is the parking brake engaged? If so, let's take that off.
    if (parkingBrake) api.trigger(`PARKING_BRAKES`);

    // We don't have a database of which plane needs how much flaps for takeoff,
    // so we/ just... don't set flaps. It makes take-off take a bit longer, but
    // then again: use the whole runway, that's what it's for.
    if (flaps !== 0) api.set(`FLAPS_HANDLE_INDEX:1`, 0);

    // Reset all trim values before takeoff.
    api.set(`AILERON_TRIM_PCT`, 0);
    api.set(`ELEVATOR_TRIM_POSITION`, 0);
    api.set(`RUDDER_TRIM_PCT`, 0);

    // Set mixture to something altitude-appropriate and set props to 90%,
    // mostly because we have no way to ask MSFS what the "safe" value for
    // props is, and we don't want the engines to burn out.
    const mixture = constrainMap(alt, 3000, 8000, 100, 65);
    for (let i = 1; i <= engineCount; i++) {
      api.set(`GENERAL_ENG_MIXTURE_LEVER_POSITION:${i}`, mixture);
      api.set(`GENERAL_ENG_PROPELLER_LEVER_POSITION:${i}`, 90);
    }

    // Lock the tailwheel. If we have one, of course.
    if (isTailDragger && tailWheelLock) {
      api.trigger(`TOGGLE_TAILWHEEL_LOCK`);
    }

    // Force neutral elevator, aileron, and rudder
    await api.set(`ELEVATOR_POSITION`, 0);
    await api.set(`AILERON_POSITION`, 0);
    await api.set(`RUDDER_POSITION`, 0);

    // And we're done with prep
    this.prepped = true;
  }

  // throttle up for as long as we're not at 100% throttle
  async throttleUp({ engineCount }, { throttle }) {
    if (throttle > 99) return;
    const { api } = this;
    console.log(`throttle: ${throttle}`);
    const throttleVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION`;
    for (let count = 1; count <= engineCount; count++)
      api.set(`${throttleVar}:${count}`, throttle + 1);
  }

  // Check how much we're out wrt the runway center line
  async autoRudder({ weight }, { lat, long, trueHeading, rudder, speed }) {
    const { end: target, api } = this;

    const targetHeading = getHeadingFromTo(lat, long, target.lat, target.long);
    const prev_hDiff = this.hDiff;
    let hDiff = (this.hDiff = getCompassDiff(trueHeading, targetHeading));
    const dHeading = hDiff - prev_hDiff;

    let update = 0;
    const cMax = 0.1; // constrainMap(speed, 0, vs1, 0.1, 0.0);
    update += constrainMap(hDiff, -30, 30, -cMax / 2, cMax / 2);
    update += constrainMap(dHeading, -1, 1, -cMax, cMax);

    const newRudder = rudder / 100 + update;
    api.set(`RUDDER_POSITION`, newRudder);
  }

  // Check if we're at a speed where we should rotate
  async checkRotation(
    { minRotation, takeoffSpeed },
    { onGround, declination, elevator, speed, VS }
  ) {
    const { api, autopilot } = this;

    let minRotate = minRotation;
    if (minRotate < 0) minRotate = 1.5 * takeoffSpeed;
    const rotate = speed >= minRotate * 1.25;

    if (rotate && VS < MIN_VS) {
      const correction = constrainMap(abs(VS), 0, MIN_VS, 0.01, 0);
      const newElevator = elevator / 100 + correction;
      api.set(`ELEVATOR_POSITION`, newElevator);
    }
    if (VS > 1000) {
      const newElevator = elevator / 100 - 0.015;
      api.set(`ELEVATOR_POSITION`, newElevator);
    }

    if (!onGround) {
      autopilot.setParameters({
        [LEVEL_FLIGHT]: true,
        [HEADING_MODE]: this.heading - declination,
      });
    }
  }

  // Check if the plane's in a state where we can
  // hand things off to the regular autopilot
  async checkHandoff(
    { engineCount },
    { alt, onGround, VS, altAboveGround, declination }
  ) {
    const handoff = !onGround && VS > MIN_VS && altAboveGround > 50;
    if (handoff) {
      this.done = true;
      const { api, autopilot } = this;

      // Gear up, if we have retractible gear...
      api.trigger(`GEAR_UP`);

      // Then ease back the throttle to "not maxed out"...
      for (let i = 1; i <= engineCount; i++) {
        api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 90);
      }

      // And switch to the regular autopilot.
      autopilot.setParameters({
        MASTER: true,
        [AUTO_THROTTLE]: true,
        [LEVEL_FLIGHT]: true,
        [ALTITUDE_HOLD]: alt + 500,
        [HEADING_MODE]: this.heading - declination,
        [TERRAIN_FOLLOW]: true,
        [AUTO_TAKEOFF]: false,
      });
    }
  }
}
