import { performAirportCalculations } from "./helpers.js";

import {
  constrain,
  constrainMap,
  getCompassDiff,
  getHeadingFromTo,
  getDistanceBetweenPoints,
  getLineCircleIntersection,
  map,
} from "../../utils/utils.js";
import {
  ALTITUDE_HOLD,
  AUTO_LAND,
  AUTO_THROTTLE,
  FEET_PER_DEGREE,
  HEADING_MODE,
  LEVEL_FLIGHT,
} from "../../utils/constants.js";
import { changeThrottle } from "../../utils/controls.js";

const { abs } = Math;

// Stages of our autolander - we can't use Symbols because we need
// something that can still compare as "true" after a hot-reload.
const GETTING_TO_APPROACH = `autoland: getting onto the approach`;
const FLYING_APPROACH = `autoland: flying the approach`;
const GET_TO_RUNWAY = `autoland: getting to the runway start`;
const INITIATE_STALL = `autoland: initiating stall`;
const STALL_LANDING = `autoland: riding out the stall`;
const ROLLING = `autoland: rolling down the runway`;
const LANDING_COMPLETE = `autoland: landing complete`;

/**
 *
 */
class StageManager {
  constructor() {
    this.reset();
  }
  reset() {
    this.currentStage = GETTING_TO_APPROACH;
  }
  nextStage() {
    if (this.currentStage === GETTING_TO_APPROACH)
      return (this.currentStage = FLYING_APPROACH);
    if (this.currentStage === FLYING_APPROACH)
      return (this.currentStage = GET_TO_RUNWAY);
    if (this.currentStage === GET_TO_RUNWAY)
      return (this.currentStage = INITIATE_STALL);
    if (this.currentStage === INITIATE_STALL)
      return (this.currentStage = STALL_LANDING);
    if (this.currentStage === STALL_LANDING)
      return (this.currentStage = ROLLING);
    if (this.currentStage === ROLLING)
      return (this.currentStage = LANDING_COMPLETE);
    console.error(`Could not transition to the next stage`);
    console.trace();
  }
}

/**
 *
 */
class AutoLand {
  static from(other) {
    if (!other) return;
    const instance = new AutoLand(other.api, other.autopilot);
    instance.flightInformation = other.flightInformation;
    instance.approach = other.approach;
    instance.landing = other.landing;
    instance.stageManager = other.stageManager;
    return instance;
  }

  constructor(api, autopilot) {
    this.api = api;
    this.autopilot = autopilot;
    this.stageManager = new StageManager();
    this.landing = false;
  }

  /**
   *
   * @param {*} flightInformation
   * @returns
   */
  async land(flightInformation, Add_WAYPOINTS = true) {
    this.landing = true;
    this.stageManager.reset();
    this.flightInformation = flightInformation;
    const { flightData, flightModel } = flightInformation;
    const { title } = flightModel;
    const { lat, long } = flightData;
    const waterLanding = title.includes(`float`) || title.includes(`amphi`);
    const airport = await this.findAirport(lat, long, waterLanding);
    performAirportCalculations(this.flightInformation, airport);
    this.approach = await this.setupApproach(
      flightData,
      airport,
      Add_WAYPOINTS
    );
    return airport;
  }

  /**
   *
   * @param {*} lat
   * @param {*} long
   * @param {*} waterLanding
   * @returns
   */
  async findAirport(lat, long, waterLanding) {
    const { NEARBY_AIRPORTS: list } = await this.api.get(`NEARBY_AIRPORTS`);
    return list[0];
  }

  /**
   *
   * @param {*} param0
   * @param {*} airport
   * @returns
   */
  async setupApproach({ lat, long, alt }, airport, Add_WAYPOINTS) {
    const candidates = [];
    airport.runways.forEach((runway) => {
      runway.approach.forEach((approach, idx) => {
        approach.offsets.forEach((offset, oidx) => {
          candidates.push({
            runway,
            idx,
            anchor: approach.anchor,
            offset,
            tip: approach.tips[oidx],
            distance: getDistanceBetweenPoints(lat, long, ...offset),
          });
        });
      });
    });
    candidates.sort((a, b) => a.distance - b.distance);

    const nearest = candidates[0];

    if (Add_WAYPOINTS) {
      const { runway, anchor, offset, tip, idx } = nearest;
      const altitude = runway.altitude | 0;
      this.autopilot.addWaypoint(...tip, undefined, true);
      this.autopilot.addWaypoint(...offset, undefined, true);
      this.autopilot.addWaypoint(
        ...anchor,
        Math.max(altitude + 1000, alt),
        true
      );
      this.autopilot.addWaypoint(
        ...runway.coordinates[1 - idx],
        altitude,
        true
      );
      this.autopilot.addWaypoint(...runway.coordinates[idx], altitude, true);
    }

    return (this.approach = nearest);
  }

  /**
   *
   */
  async run() {
    const { api, autopilot, flightInformation, stageManager } = this;
    const { flightData, flightModel } = flightInformation;
    const { lat, long, speed, alt, onGround, trueHeading, groundAlt } =
      flightData;
    const { climbSpeed, engineCount, v1, minRotation, isTailDragger } =
      flightModel;
    const waypoints = (await autopilot.getWaypoints()).filter((w) => w.landing);
    const remainingWaypoints = waypoints.filter((w) => !w.completed).length;
    const approachPoints = waypoints.slice(-3).reverse();
    const [end, start, anchor] = approachPoints;
    const stage = stageManager.currentStage;

    // What stage are we in?
    console.log(
      `==================================================================\n`,
      `${stage}, track has ${remainingWaypoints} waypoints left`,
      `\n==================================================================`
    );

    // ============================

    if (stage === GETTING_TO_APPROACH) {
      if (remainingWaypoints < 4) {
        stageManager.nextStage();
      }
    }

    // ============================

    if (stage === FLYING_APPROACH) {
      // Determine what altitude we should be at while approaching the runway.
      const approachAlt = 100; // feet
      const alt1 = anchor.alt; // feet
      const alt2 = start.alt + approachAlt; // feet

      // Distances in km
      const trackTotal = getDistanceBetweenPoints(
        anchor.lat,
        anchor.long,
        start.lat,
        start.long
      );
      const trackLeft = getDistanceBetweenPoints(
        lat,
        long,
        start.lat,
        start.long
      );
      console.log(`distance to runway: ${trackLeft}km`);

      // We want to be at a stable approach distance by the time we're 1km out.
      let targetAlt = alt2;
      const ratio = (trackLeft - 1) / (trackTotal - 1);
      targetAlt = ratio * alt1 + (1 - ratio) * alt2;

      // Set our target altitude, but only if it's lower than we're
      // already at. We don't want to oscillat around the glide slope.
      autopilot.setTarget(
        ALTITUDE_HOLD,
        Math.min(targetAlt, autopilot.modes[ALTITUDE_HOLD])
      );

      // Also try to target climb speed, which is basically the best we can do
      // in terms of a known speed from which we can *probably* stall a landing.
      if (speed < climbSpeed) {
        console.log(`throttle up`);
        changeThrottle(api, engineCount, +1);
      } else if (speed > climbSpeed + 2) {
        console.log(`throttle down`);
        changeThrottle(api, engineCount, -0.5);
      }

      if (trackLeft <= 1) {
        console.log(`Gear down`);
        api.trigger(`GEAR_DOWN`);
        stageManager.nextStage();
      }
    }

    // ============================

    if (stage === GET_TO_RUNWAY) {
      const d = getDistanceBetweenPoints(lat, long, end.lat, end.long);
      const runway = getDistanceBetweenPoints(
        start.lat,
        start.long,
        end.lat,
        end.long
      );
      const overRunway = d <= runway;

      console.log(`>>>> get to runway data`, d, runway, overRunway);

      // slowly drop to 20 feet?
      autopilot.setTarget(ALTITUDE_HOLD, groundAlt + 20);

      console.log(`>>>> speeds?`, speed, climbSpeed, climbSpeed - 10);

      if (speed > climbSpeed - 10) {
        console.log(`please throttle down`);
        changeThrottle(api, engineCount, -2);
      }

      if (overRunway) {
        stageManager.nextStage();
      }
    }

    // ============================

    if (stage === INITIATE_STALL) {
      console.log(`Cut the throttle`);
      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }
      stageManager.nextStage();
    }

    // ============================

    if (stage === STALL_LANDING) {
      if (onGround || alt <= groundAlt + 5) {
        console.log(`Touchdown`);
        stageManager.nextStage();
      }
      console.log(`dropping...`);
      autopilot.setTarget(ALTITUDE_HOLD, groundAlt + 5);
      // keep cutting the throttle
      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }
    }

    // ============================

    if (stage === ROLLING) {
      autopilot.setParameters({
        [LEVEL_FLIGHT]: false,
        [ALTITUDE_HOLD]: false,
        [HEADING_MODE]: false,
        [AUTO_THROTTLE]: false,
      });

      await autorudder(
        api,
        { x: long, y: lat },
        { x: start.long, y: start.lat },
        { x: end.long, y: end.lat },
        flightData,
        flightModel
      );

      // start braking
      this.brake += 0.1;
      this.setBrakes(api, this.brake);

      // and start pulling back on the elevator
      const elevator = constrainMap(this.brake, 0, 50, 0, 16384) | 0;
      api.trigger("ELEVATOR_SET", elevator);

      // keep cutting the throttle
      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }

      console.log(`speed on the ground:`, speed);
      if (speed < 5) stageManager.nextStage();
    }

    // ============================

    if (stage === LANDING_COMPLETE) {
      console.log(`aaaaand we're done`);
      this.setBrakes(api, 0);
      api.trigger(`ENGINE_AUTO_SHUTDOWN`);
      this.done();
    }

    // ============================
  }

  done() {
    this.landing = false;
    this.autopilot.setParameters({
      MASTER: false,
      [AUTO_LAND]: false,
    });
  }

  setBrakes(api, percentage) {
    const value = map(percentage, 0, 100, -16383, 16383) | 0;
    api.trigger(`AXIS_LEFT_BRAKE_SET`, value);
    api.trigger(`AXIS_RIGHT_BRAKE_SET`, value);
  }
}

export { AutoLand };

// FIXME: taken from auto-takeoff

async function autorudder(api, plane, start, end, flightData, flightModel) {
  const { lat, long, speed, trueHeading } = flightData;
  const { isTailDragger, minRotation } = flightModel;

  // Get the difference in "heading we are on now" and "heading
  // required to stay on the center line":
  const diff = (function () {
    const r = 1000 / FEET_PER_DEGREE;
    const i = getLineCircleIntersection(plane, start, end, r);
    const h1 = getHeadingFromTo(lat, long, i.y, i.x);
    const h2 = trueHeading;
    return getCompassDiff(h2, h1);
  })();

  if (isNaN(diff)) {
    return console.log(`line check failed:`, plane, start, end, r);
  }

  // The faster we're moving, the less rudder we want, but we want
  // the effect to fall off as we get closer to our rotation speed.
  const sfMax = 1.0;
  const sfMin = 0.2;
  const sfRatio = speed / minRotation;
  const speedFactor = constrain(sfMax - sfRatio ** 1, sfMin, sfMax);

  // This is basically a magic constant that we found experimentally,
  // and I don't like the fact that we need it.
  const magic = 1 / 8;

  // Tail draggers need more rudder than tricycles.
  let tailFactor = isTailDragger ? 1 : 0.5;

  // The rudder position is now a product of factors.
  let rudder = diff * speedFactor * tailFactor * magic;
  const rudderMinimum = constrainMap(speed, 0, 30, 0.001, 0.01);
  if (abs(rudder) > rudderMinimum) api.set(`RUDDER_POSITION`, rudder);
}
