import {
  constrainMap,
  project,
  getPointAtDistance,
  getDistanceBetweenPoints,
  getCompassDiff,
} from "../utils/utils.js";
import { FEET_PER_METER } from "../utils/constants.js";

export class AutoTakeoff {
  constructor(autopilot) {
    this.autopilot = autopilot;
    this.api = autopilot.api;
    this.prepped = false;
    this.done = false;
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
    { alt, lat, long, flaps, parkingBrake, trueHeading, tailWheelLock }
  ) {
    const { api } = this;
    console.log(`prep for roll`);

    // Cache our takeoff line: we'll need it for auto-rudder.
    this.heading = trueHeading;
    this.start = getPointAtDistance(lat, long, -1, trueHeading);
    this.end = getPointAtDistance(lat, long, 10, trueHeading);

    // Ensure our barometric altimeter is calibrated
    api.trigger(`BAROMETRIC`);

    // Is the parking brake engaged? If so, let's take that off.
    if (parkingBrake === 1) api.trigger(`PARKING_BRAKES`);

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
    if (isTailDragger && tailWheelLock === 0) {
      api.trigger(`TOGGLE_TAILWHEEL_LOCK`);
    }

    // Force neutral elevator
    await api.set(`ELEVATOR_POSITION`, 0);

    // And we're done with prep
    // this.prepped = true;
  }

  // log for as long as we're not at 100% throttle
  async throttleUp({ engineCount }, { throttle }) {
    if (throttle <= 99) {
      console.log(
        `throttle up ${engineCount} engine${
          engineCount === 1 ? `` : `s`
        } (currently at ${throttle}%)`
      );
    }
  }

  // Check how much we're out wrt the runway center line
  async autoRudder({}, { lat, long, trueHeading }) {
    const { heading, start, end } = this;
    const p = project(start.long, start.lat, end.long, end.lat, long, lat);
    const d =
      getDistanceBetweenPoints(lat, long, p.y, p.x) * 1000 * FEET_PER_METER;
    const hDiff = getCompassDiff(heading, trueHeading);
    console.log(
      `run autorudder: off by ${d}' (heading off by ${hDiff} degrees)`
    );
  }

  // Check if we're at a speed where we should rotate
  async checkRotation({ minRotation, takeoffSpeed }, { speed }) {
    let minRotate = minRotation;
    if (minRotate < 0) minRotate = 1.5 * takeoffSpeed;
    console.log(
      `check rotation: ${speed >= minRotate ? `rotate` : `not yet`}.`
    );
  }

  // Check if the plane's in a state where we can
  // hand things off to the regular autopilot
  async checkHandoff({}, { onGround, VS, altAboveGround }) {
    const handoff = !onGround && VS > 100 && altAboveGround > 50;
    console.log(`ready for handoff? ${handoff}`);
    this.done = this.done || handoff;
  }
}
