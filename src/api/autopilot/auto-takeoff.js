import {
  AUTO_TAKEOFF,
  HEADING_MODE,
  LEVEL_FLIGHT,
  FEET_PER_METER,
  ALTITUDE_HOLD,
  FPS_IN_KNOTS,
} from "./utils/constants.js";
import {
  constrain,
  constrainMap,
  getCompassDiff,
  getPointAtDistance,
  dist,
} from "./utils/utils.js";
import { changeThrottle } from "./utils/controls.js";
import { AutoPilot } from "./autopilot.js";

const { abs } = Math;

export const LOAD_TIME = Date.now();

/**
 * Naive magic lies here
 */
export class AutoTakeoff {
  prepped = false;
  takeoffHeading = false;
  takeoffAltitude = false;
  liftoff = false;
  levelOut = false;
  easeElevator = false;
  trimStep = undefined;

  /**
   *
   * @param {AutoPilot} autopilot
   */
  constructor(autopilot, original) {
    this.autopilot = autopilot;
    this.api = autopilot.api;
    if (original) Object.assign(this, original);

    // EXPERIMENTAL FOR AUTO RUDDER
    this.lastDrift = 0;
    this.staticDriftCorrection = 1;
  }

  /**
   * The takeoff equivalent of a game loop:
   *
   *  - prep plane for runway roll
   *  - throttle up to max power
   *  - try to barrel down the runway in a straight line
   *  - try to lift off when we have enough speed
   *  - gear up and hand off flying the plane to the autopilot when we've gained enough altitude.
   *
   * @param {*} state
   */
  async run(state) {
    // EXPERIMENTAL FOR ROTATION
    if (!this.trimStep) {
      let trimLimit = state.pitchTrimLimit[0];
      trimLimit = trimLimit === 0 ? 10 : trimLimit;
      this.trimStep = constrainMap(trimLimit, 5, 20, 0.001, 0.01);
    }

    // constants
    const {
      TOTAL_WEIGHT: totalWeight,
      DESIGN_SPEED_VS1: vs1,
      NUMBER_OF_ENGINES: engineCount,
    } = state;

    // variables: these have the wrong unit, so we need to fix them
    let {
      DESIGN_SPEED_MIN_ROTATION: minRotate,
      DESIGN_TAKEOFF_SPEED: takeoffSpeed,
    } = state
    minRotate *= FPS_IN_KNOTS;
    takeoffSpeed *= FPS_IN_KNOTS;
    if (minRotate < 0) minRotate = 1.5 * takeoffSpeed;

    // current airplane state values:
    const {
      onGround,
      speed: currentSpeed,
      lift,
      dLift,
      verticalSpeed: vs,
      dVS,
      bankAngle,
      altitude: alt,
      latitude: lat,
      longitude: long,
      isTailDragger,
      altitude,
      pitchTrim,
    } = state;

    const heading = state.heading;
    const trueHeading = state.trueHeading;

    // Mystery value: this shouldn't really be used =(
    const vs12 = vs1 ** 2;

    if (!this.takeoffAltitude) {
      this.takeoffAltitude = altitude;
    }

    // Make sure we've set the airplane up for a runway roll.
    if (!this.prepped) {
      return this.prepForRoll(
        isTailDragger,
        engineCount,
        altitude,
        lat,
        long,
        heading,
        trueHeading
      );
    }

    // As long as we've not lifted off, throttle up to max
    if (!this.liftoff) {
      await this.throttleUp(engineCount);
    }

    // Try to keep us going in a straight line.
    this.autoRudder(
      onGround,
      isTailDragger,
      vs12,
      minRotate,
      currentSpeed,
      lat,
      long,
      heading,
      bankAngle
    );

    // Check whether to start (or end) the rotate phase
    await this.checkRotation(
      onGround,
      currentSpeed,
      minRotate,
      altitude,
      lift,
      dLift,
      vs,
      dVS,
      totalWeight,
      pitchTrim,
      isTailDragger
    );
  }

  /**
   * We don't have a database of which plane needs how much flaps for
   * takeoff, so we just... don't set flaps. Use the whole runway,
   * that's what it's for.
   */
  async prepForRoll(
    isTailDragger,
    engineCount,
    altitude,
    lat,
    long,
    heading,
    trueHeading
  ) {
    const { api, autopilot } = this;

    console.log(`Prep for roll`);

    // Make sure there are no previous trim values to interfere with takeoff
    autopilot.resetTrim();

    // Record our initial heading so we can try to stick to that
    if (!this.takeoffHeading) {
      this.takeoffHeading = heading;
      this.takeoffCoord = { lat, long };
      this.futureCoord = getPointAtDistance(lat, long, 2, trueHeading);
      autopilot.setTarget(HEADING_MODE, this.takeoffHeading);
    }

    // Ensure our barometric altimeter is calibrated
    api.trigger(`BAROMETRIC`);

    // Is the parking brake engaged? If so, let's take that off.
    const { BRAKE_PARKING_POSITION } = await api.get(`BRAKE_PARKING_POSITION`);
    if (BRAKE_PARKING_POSITION === 1) api.trigger(`PARKING_BRAKES`);

    // Set flaps to zero.
    let flaps = await api.get(`FLAPS_HANDLE_INDEX:1`);
    flaps = flaps[`FLAPS_HANDLE_INDEX:1`];
    if (flaps !== 0) api.set(`FLAPS_HANDLE_INDEX:1`, 0);

    // Reset all trim values
    api.set(`AILERON_TRIM_PCT`, 0);
    api.set(`ELEVATOR_TRIM_POSITION`, 0);
    api.set(`RUDDER_TRIM_PCT`, 0);

    // Set mixture to altitude-appropriate and props to 90% so we don't cook the engines
    const mixture = constrainMap(altitude, 3000, 8000, 100, 65);
    for (let i = 1; i <= engineCount; i++) {
      api.set(`GENERAL_ENG_MIXTURE_LEVER_POSITION:${i}`, mixture);
      api.set(`GENERAL_ENG_PROPELLER_LEVER_POSITION:${i}`, 90);
    }

    // Lock the tailwheel. If we have one
    if (isTailDragger) {
      const { TAILWHEEL_LOCK_ON } = await api.get(`TAILWHEEL_LOCK_ON`);
      if (TAILWHEEL_LOCK_ON === 0) api.trigger(`TOGGLE_TAILWHEEL_LOCK`);
    }

    // Force neutral elevator
    await api.set(`ELEVATOR_POSITION`, 0);
    this.prepped = true;
  }

  /**
   * Throttle up to 100%.
   *
   * Note that we're explicitly checking for < 100% because many
   * engines let you `overdrive` them for short periods of time,
   * which we have no way of undoing later and then the engines
   * would catch on fire and then we'd fall out of the sky...
   */
  async throttleUp(engineCount) {
    const { api, maxed } = this;
    if (maxed) return;

    const newThrottle = await changeThrottle(api, engineCount, 1);
    console.log(`Throttle up to ${newThrottle | 0}%`);
    if (newThrottle === 100) {
      this.maxed = true;
    }
  }

  /**
   * Do a barely passable job of faking an auto-rudder.
   */
  async autoRudder(
    onGround,
    isTailDragger,
    vs12,
    minRotate,
    currentSpeed,
    lat,
    long,
    heading,
    bankAngle
  ) {
    const { api, takeoffCoord: p1, futureCoord: p2 } = this;

    // If we're actually in the air, we want to ease the rudder back to neutral.
    if (!onGround) {
      const { RUDDER_POSITION: rudder } = await api.get(`RUDDER_POSITION`);
      // // opposite rudder if we're veering.
      // if (abs(bankAngle) > 0.02) {
      //   api.set(`RUDDER_POSITION`, rudder + bankAngle);
      // }
      // // otherwise, ease off the rudder
      // else {
      api.set(`RUDDER_POSITION`, rudder * 0.96);
      // }
      return;
    }

    // Get our airplane's drift with respect to the center line
    const c = { lat, long };
    const abx = p2.long - p1.long;
    const aby = p2.lat - p1.lat;
    const acx = c.long - p1.long;
    const acy = c.lat - p1.lat;
    const coeff = (abx * acx + aby * acy) / (abx * abx + aby * aby);
    const dx = p1.long + abx * coeff;
    const dy = p1.lat + aby * coeff;
    const cross1 = (p2.long - p1.long) * (c.lat - p1.lat);
    const cross2 = (p2.lat - p1.lat) * (c.long - p1.long);
    const left = cross1 - cross2 > 0;
    const distInMeters = 100000 * FEET_PER_METER;
    const drift = (left ? 1 : -1) * dist(long, lat, dx, dy) * distInMeters;

    // are we still drifting in the wrong direction?
    const trackingDiff = abs(this.lastDrift) - abs(drift);
    if (currentSpeed > 1 && trackingDiff > 0) {
      this.staticDriftCorrection += constrainMap(trackingDiff, 0, 10, 0, 1);
    } else {
      if (this.staticDriftCorrection > 1.1) this.staticDriftCorrection -= 0.1;
    }

    // Then turn that into an error term that we add to "how far off from heading we are":
    const limit = constrainMap(currentSpeed, 0, minRotate, 120, 4);
    const driftCorrection =
      constrainMap(drift, -130, 130, -limit, limit) *
      this.staticDriftCorrection;

    // Get our heading diff, with a drift correction worked in.
    const diff = getCompassDiff(heading, this.takeoffHeading + driftCorrection);
    const stallFactor = constrainMap(vs12, 2500, 6000, 0.05, 0.3);
    const speedFactor = constrain(
      1 - (currentSpeed / minRotate) ** 0.5,
      0.2,
      1
    );
    const tailFactor = isTailDragger ? 1 : 0.5;
    const rudder = diff * stallFactor * speedFactor * tailFactor;

    // FIXME: this goes "wrong" for the Kodiak 100, which immediately banks left on take-off
    // FIXME: this does "nothing" for the Cessna 172, unless we add the static drift correction.

    // console.log({
    //   STAGE: `auto-rudder`,
    //   drift,
    //   limit,
    //   driftCorrection,
    //   staticDriftCorrection: this.staticDriftCorrection,
    //   diff,
    //   stallFactor,
    //   speedFactor,
    //   tailFactor,
    //   rudder,
    // });

    this.lastDrift = drift;

    api.set(`RUDDER_POSITION`, rudder);
  }

  /**
   * if speed is greater than rotation speed, rotate.
   * (Or if the wheels are off the ground before then!)
   *
   * @param {*} onGround
   * @param {*} currentSpeed
   */
  async checkRotation(
    onGround,
    currentSpeed,
    minRotate,
    altitude,
    lift,
    dLift,
    vs,
    dVs,
    totalWeight,
    pitchTrim,
    isTailDragger
  ) {
    const { autopilot, trimStep } = this;
    const rotateSpeed = minRotate + 5;

    // Are we in a rotation situation?
    if (!onGround || currentSpeed > rotateSpeed) {
      // if we're still on the ground, trim up
      if (onGround) {
        console.log(`on ground, trim up by ${trimStep}`);
        autopilot.set("ELEVATOR_TRIM_POSITION", pitchTrim + trimStep);
      }

      // if we're in the air:
      else {
        // Are we climbing fast enough?
        if (vs > 1000) {
          console.log(`VS too high, trim down`);
          autopilot.set("ELEVATOR_TRIM_POSITION", pitchTrim - trimStep / 10);
        }

        // Are we high enough up? Switch to autopilot
        if (lift > 300) {
          this.switchToAutopilot(altitude, isTailDragger);
        }

        // Do we not have a positive enough rate yet? Trim more
        else if (dLift <= 0.2 && lift <= 300 && vs < 200) {
          console.log(`need more positive rate (dlift: ${dLift}), trim up`);
          this.trimStep += 0.01;

          autopilot.set("ELEVATOR_TRIM_POSITION", pitchTrim + trimStep / 10);
        }

        // Ensure that the wing leveler is turned on
        if (!autopilot.modes[LEVEL_FLIGHT]) {
          autopilot.setTarget(LEVEL_FLIGHT, true);
          console.log(`turn on wing leveler`);
        }
      }
    }
  }

  async switchToAutopilot(targetAltitude, isTailDragger) {
    const { api, autopilot } = this;

    console.log(`reset rudder, gear up, unlock tailwheel.`);
    api.set(`RUDDER_POSITION`, 0);
    api.trigger(`GEAR_UP`);
    if (isTailDragger) {
      const { TAILWHEEL_LOCK_ON } = await api.get(`TAILWHEEL_LOCK_ON`);
      if (TAILWHEEL_LOCK_ON === 1) api.trigger(`TOGGLE_TAILWHEEL_LOCK`);
    }

    console.log(`switch to autopilot.`);
    autopilot.setParameters({
      [AUTO_TAKEOFF]: false,
      [ALTITUDE_HOLD]: targetAltitude,
    });
  }
}
