import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

import {
  AUTO_TAKEOFF,
  HEADING_MODE,
  LEVEL_FLIGHT,
  FEET_PER_DEGREE,
  ALTITUDE_HOLD,
  TERRAIN_FOLLOW,
  AUTO_THROTTLE,
  FEET_PER_METER,
} from "../utils/constants.js";
import {
  constrain,
  constrainMap,
  getCompassDiff,
  getPointAtDistance,
  dist,
  nf,
  getLineCircleIntersection,
  getHeadingFromTo,
} from "../utils/utils.js";

import { watch } from "../utils/reload-watcher.js";
import { changeThrottle as ct } from "../utils/controls.js";
let changeThrottle = ct;
watch(__dirname, `../utils/controls.js`, (module) => {
  changeThrottle = module.changeThrottle;
});

import { AutoPilot } from "./autopilot.js";

const { abs } = Math;

const FEATURES = {
  ASSYMETRIC_RUDDER: true,
  IGNORE_TINY_RUDDER: true,
  ROTATION_PROTECTION: true,
  PITCH_PROTECTION: true,
};

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
   * @param {*} FlightInformation
   */
  async run({ flightData, flightModel }) {
    const { autopilot } = this;

    const {
      engineCount,
      engineType,
      isAcrobatic,
      isTailDragger,
      minRotation,
      noAileronTrim,
      pitchTrimLimit,
      takeoffSpeed,
      title,
      weight: totalWeight,
    } = flightModel;

    if (!this.trimStep) {
      let trimLimit = pitchTrimLimit[0];
      trimLimit = trimLimit === 0 ? 10 : trimLimit;
      this.trimStep = constrainMap(trimLimit, 5, 20, 0.001, 0.01);
    }

    // variables: these have the wrong unit, so we need to fix them
    let minRotate = minRotation;
    if (minRotate < 0) minRotate = 1.5 * takeoffSpeed;

    // current airplane state values:
    const {
      alt: altitude,
      bank: bankAngle,
      declination,
      heading,
      lat,
      lift,
      long,
      onGround,
      pitch,
      speed: currentSpeed,
      trimPosition: pitchTrim,
      trueHeading,
      VS: vs,
    } = flightData;

    const { pitch: dPitch, heading: dHeading } = flightData.d ?? {
      pitch: 0,
      heading: 0,
    };
    const { lift: dLift, VS: dVS } = flightData.d ?? { lift: 0, VS: 0 };

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
        trueHeading,
        title
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
      minRotate,
      currentSpeed,
      lat,
      long,
      heading,
      trueHeading,
      dHeading,
      bankAngle,
      title,
      totalWeight,
      declination,
      engineCount,
      engineType,
      noAileronTrim
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
      pitch,
      dPitch,
      pitchTrim,
      isTailDragger,
      noAileronTrim,
      engineCount,
      title,
      isAcrobatic
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
    trueHeading,
    title
  ) {
    const { api, autopilot } = this;

    console.log(`Prep for roll`);

    // Make sure there are no previous trim values to interfere with takeoff
    autopilot.resetTrim();

    // Record our initial heading so we can try to stick to that
    if (!this.takeoffHeading) {
      this.takeoffHeading = heading;
      this.takeoffCoord = { lat, long };
      this.startCoord = getPointAtDistance(lat, long, -0.1, trueHeading);
      this.endCoord = getPointAtDistance(lat, long, 0.1, trueHeading);
      autopilot.setTarget(HEADING_MODE, this.takeoffHeading);
    }

    // Ensure our barometric altimeter is calibrated
    api.trigger(`BAROMETRIC`);

    // Is the parking brake engaged? If so, let's take that off.
    const { BRAKE_PARKING_POSITION } = await api.get(`BRAKE_PARKING_POSITION`);
    if (BRAKE_PARKING_POSITION === 1) api.trigger(`PARKING_BRAKES`);

    // Set flaps to take-off (or, 2 notches).
    let flaps = await api.get(`FLAPS_HANDLE_INDEX:1`);
    flaps = flaps[`FLAPS_HANDLE_INDEX:1`];
    api.trigger(`FLAPS_UP`);
    api.set(`FLAPS_HANDLE_INDEX:1`, title.includes("maule-m7") ? 1 : 0);

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

    const newThrottle = await changeThrottle(api, engineCount, 2);
    // console.log(`Throttle up to ${newThrottle | 0}%`);
    if ((newThrottle | 0) === 100) {
      this.maxed = true;
    }
  }

  /**
   * Do a barely passable job of faking an auto-rudder.
   */
  async autoRudder(
    onGround,
    isTailDragger,
    minRotate,
    currentSpeed,
    lat,
    long,
    heading,
    trueHeading,
    dHeading,
    bankAngle,
    title,
    totalWeight,
    declination,
    engineCount,
    engineType,
    noAileronTrim
  ) {
    const { api, startCoord: p1, endCoord: p2 } = this;

    // If we're actually in the air, we want to slowly ease the rudder back to neutral.
    // Unless we're in a plane with aileron trim, in which case we need that rudder to fly level.
    if (!onGround && !noAileronTrim) {
      const { RUDDER_POSITION: rudder } = await api.get(`RUDDER_POSITION`);
      this.rudderEasement ??= rudder / 200;
      if (abs(rudder) > abs(this.rudderEasement)) {
        api.set(`RUDDER_POSITION`, rudder - this.rudderEasement);
      }
      return;
    }

    // Get the difference in "heading we are on now" and "heading
    // required to stay on the center line":
    const diff = (function () {
      const plane = { x: long, y: lat };
      const start = { x: p1.long, y: p1.lat };
      const end = { x: p2.long, y: p2.lat };
      const radius = 1000 / FEET_PER_DEGREE;
      const i = getLineCircleIntersection(plane, start, end, radius);
      const h1 = getHeadingFromTo(lat, long, i.y, i.x);
      const h2 = trueHeading;
      return getCompassDiff(h2, h1);
    })();

    if (isNaN(diff)) {
      return this.abortTakeoff(engineCount);
    }

    // The faster we're moving, the less rudder we want, but we want
    // the effect to fall off as we get closer to our rotation speed.
    const sfMax = 1.0;
    const sfMin = 0.2;
    const sfRatio = currentSpeed / minRotate;
    const speedFactor = constrain(sfMax - sfRatio ** 1, sfMin, sfMax);

    // This is basically a magic constant that we found experimentally,
    // and I don't like the fact that we need it.
    const magic = 1 / 8;

    // Tail draggers need more rudder than tricycles.
    let tailFactor = isTailDragger ? 1 : 0.5;

    // The rudder position is now a product of factors.
    let rudder = diff * speedFactor * tailFactor * magic;

    const rudderMinimum = constrainMap(currentSpeed, 0, 30, 0.001, 0.01);
    // asymmetric rudder, to compensate for propellor torque
    if (
      FEATURES.ASSYMETRIC_RUDDER &&
      engineCount === 1 &&
      engineType !== `jet` &&
      rudder > 0
    ) {
      rudder *= 3;
    }

    if (!FEATURES.IGNORE_TINY_RUDDER) {
      api.set(`RUDDER_POSITION`, rudder);
    } else if (abs(rudder) > rudderMinimum) {
      api.set(`RUDDER_POSITION`, rudder);
    }
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
    pitch,
    dPitch,
    pitchTrim,
    isTailDragger,
    noAileronTrim,
    engineCount,
    title,
    isAcrobatic
  ) {
    const { api, autopilot, trimStep } = this;
    const rotateSpeed = minRotate + 5;

    // Are we in a rotation situation?
    if (!onGround || currentSpeed > rotateSpeed) {
      console.log(`vs: ${vs}, dvs: ${dVs}, pitch: ${pitch}, dPitch: ${dPitch}`);

      // if we're still on the ground, trim up. However, only until we just barely
      // seem to be lifting off, because by the time our code registers that, the
      // trim hasn't fully taken effect yet, and if we keep adding trim, we'll end
      // up launching the plane into a stall.
      if (onGround && (vs < 50 || dVs < 25)) {
        const touch = constrainMap(
          currentSpeed,
          50,
          130,
          trimStep / 4,
          trimStep
        );
        console.log(`on ground, trim up by ${touch}`);
        autopilot.set("ELEVATOR_TRIM_POSITION", pitchTrim + touch);
      }

      // if we're in the air:
      else {
        // Ensure that the wing leveler is turned on
        if (!autopilot.modes[LEVEL_FLIGHT]) {
          autopilot.setTarget(LEVEL_FLIGHT, true);
          console.log(`turn on wing leveler`);
        }

        // Are we high enough up? Switch to autopilot
        if (lift > 100) {
          console.log(`gear up`);
          api.trigger(`GEAR_UP`);
          if (isTailDragger) {
            const { TAILWHEEL_LOCK_ON } = await api.get(`TAILWHEEL_LOCK_ON`);
            if (TAILWHEEL_LOCK_ON === 1) api.trigger(`TOGGLE_TAILWHEEL_LOCK`);
          }
          this.gearIsUp = true;
          this.switchToAutopilot(
            altitude + 500,
            isTailDragger,
            noAileronTrim,
            engineCount
          );
        }

        let intervened = false;

        if (FEATURES.ROTATION_PROTECTION) {
          if (FEATURES.PITCH_PROTECTION) {
            if (dVs > 100 && (pitch < -10 || dPitch < -5)) {
              console.log(`to the moon - let's not?`);
              autopilot.set(
                "ELEVATOR_TRIM_POSITION",
                (pitchTrim -= (-pitch * trimStep) / 20)
              );
              intervened = true;
            } else if (pitch > 0) {
              console.log(`to the ground - let's not?`);
              autopilot.set(
                "ELEVATOR_TRIM_POSITION",
                (pitchTrim += (pitch * trimStep) / 2)
              );
              intervened = true;
            }
          }

          // dVS protection
          if (dVs > 200) {
            console.log(`dVS too large, trim down`);
            let factor = constrainMap(dVs, 200, 1000, 1, 5);

            autopilot.set(
              "ELEVATOR_TRIM_POSITION",
              pitchTrim - (factor * trimStep) / 5
            );
            intervened = true;
          }

          // VS protection
          else if (vs > 1500) {
            console.log(`VS too high, trim down`);
            autopilot.set("ELEVATOR_TRIM_POSITION", pitchTrim - trimStep / 10);
            intervened = true;
          }
        }

        // Are we still trying to get positive rate going?
        if (
          !intervened &&
          dLift <= 0.2 &&
          lift <= 300 &&
          (vs < 25 || dVs < -100)
        ) {
          console.log(`need more positive rate (dlift: ${dLift}), trim up`);
          autopilot.set("ELEVATOR_TRIM_POSITION", pitchTrim + trimStep / 2);
        }
      }
    }
  }

  async switchToAutopilot(
    targetAltitude,
    isTailDragger,
    noAileronTrim,
    engineCount
  ) {
    const { api, autopilot } = this;

    if (!noAileronTrim) {
      console.log(`reset rudder, gear up, unlock tailwheel.`);
      api.set(`RUDDER_POSITION`, 0);
    }

    for (let i = 1; i <= engineCount; i++) {
      api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 90);
    }

    console.log(`switch to autopilot.`);

    // if we have any waypoints with explicit elevation, don't turn on
    // terrain follow mode. Otherwise, terrain-follow is good to go.
    const waypoints = await autopilot.getWaypoints();
    const flightPlan = waypoints.filter((e) => !e.landing);
    const flyExplicitAltitude = flightPlan.some((e) => !!e.alt);
    // console.log(`flightPlan:`, flightPlan);
    // console.log(`flyExplicitAltitude:`, flyExplicitAltitude);

    autopilot.setParameters({
      [AUTO_TAKEOFF]: false,
      [TERRAIN_FOLLOW]: flyExplicitAltitude ? false : 500,
      [AUTO_THROTTLE]: true,
      [ALTITUDE_HOLD]: targetAltitude,
    });
  }

  async abortTakeoff(engineCount) {
    const { api, autopilot } = this;

    for (let i = 1; i <= engineCount; i++) {
      api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
    }

    console.log(`switching off autopilot.`);
    autopilot.setParameters({
      MASTER: false,
      [AUTO_TAKEOFF]: false,
    });
  }
}
