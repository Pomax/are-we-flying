import {
  AUTO_TAKEOFF,
  HEADING_MODE,
  LEVEL_FLIGHT,
  FEET_PER_METER,
  TERRAIN_FOLLOW,
  ALTITUDE_HOLD,
  FPS_IN_KNOTS,
} from "./utils/constants.js";
import {
  degrees,
  constrain,
  constrainMap,
  getCompassDiff,
  getPointAtDistance,
  dist,
} from "./utils/utils.js";
import { changeThrottle } from "./utils/controls.js";


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

  /**
   *
   * @param {*} owner
   */
  constructor(autopilot, original) {
    this.autopilot = autopilot;
    this.api = autopilot.api;
    if (original) Object.assign(this, original);
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
    console.log(`[${Date.now()}]`);

    const { api } = this;

    const {
      TOTAL_WEIGHT: totalWeight,
      DESIGN_SPEED_VS1: vs1,
      DESIGN_SPEED_MIN_ROTATION: minRotate,
      NUMBER_OF_ENGINES: engineCount,
      TITLE: title,
    } = await api.get(
      `TOTAL_WEIGHT`,
      `DESIGN_SPEED_VS1`,
      `DESIGN_SPEED_MIN_ROTATION`,
      `NUMBER_OF_ENGINES`,
      `TITLE`
    );

    const {
      onGround,
      speed: currentSpeed,
      lift,
      dLift,
      verticalSpeed: vs,
      dVS,
      latitude: lat,
      longitude: long,
      isTailDragger,
      altitude,
    } = state;
    const heading = degrees(state.heading);
    const trueHeading = degrees(state.trueHeading);
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
      heading
    );

    // Is it time to actually take off?
    await this.checkRotation(
      onGround,
      currentSpeed,
      lift,
      dLift,
      vs,
      dVS,
      totalWeight
    );

    // Is it time to hand off flight to the regular auto pilot?
    const altitudeGained = altitude - this.takeoffAltitude;
    await this.checkHandoff(
      title,
      isTailDragger,
      totalWeight,
      vs,
      dVS,
      altitude,
      altitudeGained
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
    heading
  ) {
    const { api, takeoffCoord: p1, futureCoord: p2 } = this;

    // If we're actually in the air, we want to ease the rudder back to neutral.
    if (!onGround) {
      const { RUDDER_POSITION: rudder } = await api.get(`RUDDER_POSITION`);
      api.set(`RUDDER_POSITION`, rudder / 2);
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

    // Then turn that into an error term that we add to "how far off from heading we are":
    const limit = constrainMap(currentSpeed, 0, minRotate, 12, 4);
    const driftCorrection = constrainMap(drift, -130, 130, -limit, limit);

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

    // FIXME: this goes "wrong" for the Kodiak 100

    api.set(`RUDDER_POSITION`, rudder);
  }

  /**
   * if speed is greater than rotation speed, rotate.
   * (Or if the wheels are off the ground before then!)
   *
   * @param {*} onGround
   * @param {*} currentSpeed
   */
  async checkRotation(onGround, currentSpeed, lift, dLift, vs, totalWeight) {
    const { api, autopilot } = this;

    let {
      DESIGN_SPEED_MIN_ROTATION: minRotate,
      DESIGN_TAKEOFF_SPEED: takeoffSpeed,
    } = await api.get(`DESIGN_SPEED_MIN_ROTATION`, `DESIGN_TAKEOFF_SPEED`);

    // turn feet per second into knots
    minRotate *= FPS_IN_KNOTS;
    takeoffSpeed *= FPS_IN_KNOTS;
    if (minRotate < 0) minRotate = 1.5 * takeoffSpeed;
    const rotateSpeed = minRotate + 5;

    // Are we in a rotation situation?
    if (!onGround || currentSpeed > rotateSpeed) {
      const { ELEVATOR_POSITION: elevator } = await api.get(
        `ELEVATOR_POSITION`
      );

      console.log(`Rotate, elevator: ${elevator}`, onGround, this.liftoff);

      // We're still on the ground: pull back on the stick
      if (this.liftoff === false) {
        console.log(`wheels off the ground, prepare for kick...`);
        this.liftoff = Date.now();
        const pullBack = constrainMap(totalWeight, 3500, 14000, 0.05, 2);
        console.log(`\nKICK: ${pullBack}\n`);
        api.set(`ELEVATOR_POSITION`, pullBack);
      }

      // We're in the air
      else {
        // Do we have a high positive rate?
        if (vs > 1000 && elevator > 0) {
          console.log(`Ease back elevator to level off initial climb`);
          const backoff = constrainMap(
            vs,
            100,
            3000,
            this.easeElevator / 100,
            this.easeElevator / 10
          );
          api.set(`ELEVATOR_POSITION`, elevator - backoff);
        }

        // Or do we not have a positive enough rate yet?
        else if (dLift <= 0.2 && lift <= 300 && vs < 200) {
          console.log(`\ndLift=${dLift}, keep going...\n`);
          let touch = constrainMap(totalWeight, 3500, 14000, 0.02, 0.2);
          touch = constrainMap(dLift, 0, 0.1, touch, 0);
          api.set(`ELEVATOR_POSITION`, elevator + touch);
        }

        if (!autopilot.modes[LEVEL_FLIGHT])
          autopilot.setTarget(LEVEL_FLIGHT, true);
      }
    }
  }

  /**
   * Hand off control to the `regular` autopilot once we have a safe enough positive rate.
   *
   * @param {*} totalWeight
   * @param {*} vs
   */
  async checkHandoff(
    title,
    isTailDragger,
    totalWeight,
    vs,
    dVS,
    altitude,
    altitudeGained
  ) {
    const { api, autopilot } = this;

    if (this.levelOut && dVS < 0) {
      console.log(`\n\n\SWITCH FROM AUTO-TAKEOFF TO AUTOPILOT`);

      // set elevator trim, scaled for the plane's trim limit, so that the
      // autopilot doesn't start in neutral and we don't suddenly pitch down.
      const { ELEVATOR_TRIM_UP_LIMIT: trimLimit } = await api.get(
        `ELEVATOR_TRIM_UP_LIMIT`
      );
      let trim =
        trimLimit * constrainMap(totalWeight, 3000, 6500, 0.0003, 0.003);

      // Special affordances:
      if (title.toLowerCase().includes(`orbx p-750`)) {
        // the amount of trim this plane needs is just absolutely insane
        trim *= 4;
      }

      console.log(`setting AP trim takeover to`, trim);
      await api.set("ELEVATOR_TRIM_POSITION", trim);

      // reset elevator and turn on terrain follow.
      await api.set("ELEVATOR_POSITION", 0);
      autopilot.setTarget(ALTITUDE_HOLD, altitude + 100);
      autopilot.setTarget(TERRAIN_FOLLOW, true);
      autopilot.setTarget(AUTO_TAKEOFF, false);
    }

    const limit = constrainMap(totalWeight, 3000, 6500, 300, 1000);

    if (!this.levelOut && (vs > limit || altitudeGained > 100)) {
      this.levelOut = true;
      console.log(`level out`);
      const { ELEVATOR_POSITION } = await api.get(`ELEVATOR_POSITION`);
      this.easeElevator = ELEVATOR_POSITION;

      api.set(`RUDDER_POSITION`, 0);
      api.trigger(`GEAR_UP`);
      if (isTailDragger) {
        const { TAILWHEEL_LOCK_ON } = await api.get(`TAILWHEEL_LOCK_ON`);
        if (TAILWHEEL_LOCK_ON === 1) api.trigger(`TOGGLE_TAILWHEEL_LOCK`);
      }
    }
  }
}
