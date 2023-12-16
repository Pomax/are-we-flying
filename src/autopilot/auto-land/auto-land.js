import { performAirportCalculations } from "./helpers.js";

import {
  radians,
  constrainMap,
  getCompassDiff,
  getHeadingFromTo,
  getDistanceBetweenPoints,
  getLineCircleIntersection,
  map,
  nf,
} from "../../utils/utils.js";
import {
  ALTITUDE_HOLD,
  AUTO_LAND,
  AUTO_THROTTLE,
  FEET_PER_DEGREE,
  FEET_PER_METER,
  HEADING_MODE,
  KM_PER_NM,
  LEVEL_FLIGHT,
  TERRAIN_FOLLOW,
} from "../../utils/constants.js";
import { changeThrottle } from "../../utils/controls.js";

const { abs, round, ceil, tan } = Math;

// Stages of our autolander - we can't use Symbols because we need
// something that can still compare as "true" after a hot-reload.
export const GETTING_TO_APPROACH = `autoland: getting onto the approach`;
export const FLYING_APPROACH = `autoland: flying the approach`;
export const GET_TO_RUNWAY = `autoland: getting to the runway start`;
export const INITIATE_STALL = `autoland: initiating stall`;
export const STALL_LANDING = `autoland: riding out the stall`;
export const GET_TO_GROUND = `autoland: get the plane on the ground`;
export const ROLLING = `autoland: rolling down the runway`;
export const LANDING_COMPLETE = `autoland: landing complete`;

/**
 *
 */
class StageManager {
  constructor(api) {
    this.api = api;
    this.reset();
  }
  reset() {
    this.currentStage = GETTING_TO_APPROACH;
  }
  nextStage() {
    // this.api?.trigger(`PAUSE_ON`);
    if (this.currentStage === GETTING_TO_APPROACH)
      return (this.currentStage = FLYING_APPROACH);
    if (this.currentStage === FLYING_APPROACH)
      return (this.currentStage = GET_TO_RUNWAY);
    if (this.currentStage === GET_TO_RUNWAY)
      return (this.currentStage = INITIATE_STALL);
    if (this.currentStage === INITIATE_STALL)
      return (this.currentStage = STALL_LANDING);
    if (this.currentStage === STALL_LANDING)
      return (this.currentStage = GET_TO_GROUND);
    if (this.currentStage === GET_TO_GROUND)
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
    this.stageManager = new StageManager(api);
    this.landing = false;
    this.brake = 0;
  }

  /**
   *
   * @param {*} flightInformation
   * @returns
   */
  async land(flightInformation, WAYPOINTS = true) {
    this.flightInformation = flightInformation;
    const { flightData, flightModel } = flightInformation;
    const { title } = flightModel;
    const { lat, long } = flightData;
    const waterLanding = title.includes(`float`) || title.includes(`amphi`);
    // Do we need to find a landing relative to the plane,
    // or relative to the last waypoint in a flight path?
    const reference = [lat, long];
    const waypoints = this.autopilot.getWaypoints();
    if (waypoints.length) {
      const last = waypoints.at(-1);
      reference[0] = last.lat;
      reference[1] = last.long;
    }
    // Get the nearest airport, figure out its critical points, and find an approach:
    const airport = await this.findAirport(...reference, waterLanding);
    performAirportCalculations(this.flightInformation, airport);
    this.approach = await this.setupApproach(flightData, airport, WAYPOINTS);
    // And we're done. Mark ourselves as having a landing now.
    this.landing = true;
    this.stageManager.reset();
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
    let { NEARBY_AIRPORTS: list } = await this.api.get(`NEARBY_AIRPORTS`);
    // find a plane-appropriate landing
    if (waterLanding) {
      list = list.filter((a) =>
        a.runways.some((r) => r.surface.startsWith(`water `))
      );
    } else {
      list = list.filter((a) =>
        a.runways.some((r) => !r.surface.startsWith(`water`))
      );
    }
    // then figure out which one is actually nearest to our reference point
    list.forEach(
      (a) =>
        (a.d = getDistanceBetweenPoints(lat, long, a.latitude, a.longitude))
    );
    list.sort((a, b) => a.d - b.d);
    // and then return the closest one
    const airport = list[0];
    delete airport.d;
    return airport;
  }

  /**
   *
   * @param {*} param0
   * @param {*} airport
   * @returns
   */
  async setupApproach({ lat, long }, airport, WAYPOINTS = true) {
    const candidates = [];
    airport.runways.forEach((runway) => {
      runway.approach.forEach((approach, idx) => {
        approach.offsets.forEach((offset, oidx) => {
          const { anchor, stable } = approach;
          const tip = approach.tips[oidx];
          const distance = getDistanceBetweenPoints(lat, long, ...offset);
          candidates.push({ runway, idx, anchor, stable, offset, tip, distance });
        });
      });
    });
    candidates.sort((a, b) => a.distance - b.distance);
    const nearest = (this.approach = candidates[0]);

    if (WAYPOINTS) {
      const { runway, anchor, stable, offset, tip, idx } = nearest;
      const runwayAlt = runway.altitude;

      // Depending on where the reference is in relation to the
      // approach anchor, we may need either one or two extra
      // waypoints to get the plane cleanly onto the approach.
      this.autopilot.addWaypoint(...tip, undefined, true);
      this.autopilot.addWaypoint(...offset, undefined, true);

      const approachAlt = ceil(runwayAlt + 1000);
      this.autopilot.addWaypoint(...anchor, approachAlt, true);

      const stableAlt = ceil(runwayAlt + 100);
      this.autopilot.addWaypoint(...stable, stableAlt, true);

      // Get the slope across the runway, which tells us how much
      // the start and end are higher or lower than the runway's
      // center coordinate.
      const slope = runway.slopeTrue;
      const d = runway.length * FEET_PER_METER;
      const rise = tan(radians(slope)) * d;

      // TODO: we do need to figure out whether we're approaching the
      //       runway "the right way" or not, since our "start" and "end"
      //       are not necessarily the official start and end.
      //       look at runway heading vs. approach marking?
      const start = runway.coordinates[1 - idx];
      this.autopilot.addWaypoint(...start, round(runwayAlt), true);

      const end = runway.coordinates[idx];
      this.autopilot.addWaypoint(...end, round(runwayAlt + rise), true);
    }

    return nearest;
  }

  /**
   *
   */
  async run() {
    // All the values we're going to need:
    const { api, autopilot, flightInformation, stageManager } = this;
    const { trim, modes } = autopilot;
    const { flightData, flightModel } = flightInformation;
    const {
      alt,
      altAboveGround,
      bank,
      gearSpeedExceeded,
      isGearDown,
      lat,
      lift,
      long,
      onGround,
      speed,
      VS,
    } = flightData;
    const { VS: dVS } = flightData.d;
    const { climbSpeed, engineCount, isTailDragger, hasRetractibleGear } =
      flightModel;
    const approachSpeed = climbSpeed + 20;
    const waypoints = (await autopilot.getWaypoints()).filter((w) => w.landing);
    const remainingWaypoints = waypoints.filter((w) => !w.completed).length;
    const approachPoints = waypoints.slice(-3).reverse();
    const [end, start, anchor] = approachPoints;
    const stage = stageManager.currentStage;
    const altitudeSafety = 100;
    const dropDistance = constrainMap(speed, 80, 150, 0, 1); // in km

    if (!autopilot.waypoints.currentWaypoint.landing) return;

    // What stage are we in?
    console.log(
      `\n  ==================================================================\n`,
      `  ${stage}, track has ${remainingWaypoints} waypoints left`,
      `\n  ==================================================================\n`
    );

    // ============================

    if (stage === GETTING_TO_APPROACH) {
      if (remainingWaypoints < 4) {
        autopilot.setParameters({
          // explicitly set autothrottle to target the approach speed.
          [AUTO_THROTTLE]: approachSpeed,
          // and turn off terrain follow, if it's on.
          [TERRAIN_FOLLOW]: false,
        });
        stageManager.nextStage();
      }
    }

    // ============================

    if (stage === FLYING_APPROACH) {
      // Determine what altitude we should be at while approaching the runway.
      const alt1 = anchor.alt; // feet
      const alt2 = start.alt + altitudeSafety; // feet

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
      // already at. We don't want to oscillate around the glide slope.
      autopilot.setParameters({
        [ALTITUDE_HOLD]: Math.min(targetAlt, modes[ALTITUDE_HOLD]),
      });

      // gear down once we're flying the approach straight
      // enough and our speed allows for it.
      if (
        hasRetractibleGear &&
        !gearSpeedExceeded &&
        !isGearDown &&
        abs(bank) < 3
      ) {
        console.log(`Gear down and trim and throttle to compensate`);
        api.trigger(`GEAR_DOWN`);
      }

      if (altAboveGround <= start.alt + altitudeSafety) {
        autopilot.setParameters({
          [ALTITUDE_HOLD]: start.alt + 30,
          [AUTO_THROTTLE]: climbSpeed + 10,
        });
        stageManager.nextStage();
      }
    }

    // ============================

    if (stage === GET_TO_RUNWAY) {
      console.log(`drop distance = ${dropDistance}`);
      const de = getDistanceBetweenPoints(lat, long, end.lat, end.long);
      const runway = getDistanceBetweenPoints(
        start.lat,
        start.long,
        end.lat,
        end.long
      );

      const altDiff = alt - start.alt; // in feet
      const NM = (de - runway) / KM_PER_NM;
      const time = (NM / speed) * 60; // in minutes
      const idealVS = -altDiff / time; // in feet per minute

      // DON'T FLY INTO THE FUCKING GROUND YOU STUPID PLANES
      const vsLimit = constrainMap(de - runway, 0, 1, 0, -400);
      console.log(
        `checking VS: vsLimit=${nf(vsLimit)}, VS=${nf(
          VS
        )}, lift=${lift}, alt=${altDiff}, dist=${NM}, ideal=${idealVS}`
      );
      if (VS < vsLimit) {
        console.log(`VS TOO LOW, INTERVENING`);
        // trim up
        trim.pitchLock = true;
        trim.pitch += 0.001;
        api.set("ELEVATOR_TRIM_POSITION", trim.pitch);
        // and add power if we need to
        if (speed < modes[AUTO_THROTTLE]) {
          console.log(`SPEED TOO LOW, INTERVENING`);
          changeThrottle(api, engineCount, 20);
        }
      } else {
        trim.pitchLock = false;
      }

      // ready to drop?
      if (de <= runway + dropDistance) {
        stageManager.nextStage();
      }
    }

    // ============================

    if (stage === INITIATE_STALL) {
      console.log(`Cut the throttle`);
      await autopilot.setParameters({
        [AUTO_THROTTLE]: false,
      });
      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }
      stageManager.nextStage();
    }

    // ============================

    if (stage === STALL_LANDING) {
      // keep cutting those engines, just in case of timing issues
      console.log(`Keep cutting the throttle`);
      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }

      const de = getDistanceBetweenPoints(lat, long, end.lat, end.long);
      const runway = getDistanceBetweenPoints(
        start.lat,
        start.long,
        end.lat,
        end.long
      );

      console.log(
        `dropping... (speed:${nf(speed)}, alt: ${nf(
          alt
        )}, distance to runway: ${nf(runway - de)})`
      );
      if (alt <= start.alt + 10 || de < runway) {
        autopilot.setParameters({
          [AUTO_THROTTLE]: false,
          [ALTITUDE_HOLD]: start.alt - 1000,
        });
        // in fact, bump the trim to help force that.
        trim.pitch -= (2 * Math.PI) / 1000;
        api.set("ELEVATOR_TRIM_POSITION", trim.pitch);
        trim.pitchLock = true;
        stageManager.nextStage();
      }
    }

    // ============================

    if (stage === GET_TO_GROUND) {
      if (onGround) {
        console.log(`Touchdown`);
        console.log(`Setting throttle to whatever is the lowest it'll go...`);
        for (let i = 1; i <= engineCount; i++) {
          await api.trigger(`THROTTLE${i}_AXIS_SET_EX1`, -32000);
        }
        console.log(`Also, deploying speed brakes, if we have them`);
        await api.trigger(`SPOILERS_ON`);

        if (isTailDragger) {
          console.log(`flaps back up so we don't nose-over`);
          for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 0);
        }
        stageManager.nextStage();
      }

      // TODO: base this on dVS? Just FUCKING STOP CRASHING

      // Do we need to flare?
      if (isTailDragger && lift < 20 && !this.flared) {
        console.log(`FLARE, alt: ${alt}, lift: ${lift}`);
        const elevator = (await autopilot.get(`ELEVATOR_POSITION`))
          .ELEVATOR_POSITION;
        const newValue = elevator + 0.05;
        autopilot.trigger("ELEVATOR_SET", (-16384 * newValue) | 0);
        this.flared = true;
      }
    }

    // ============================

    if (stage === ROLLING) {
      if (onGround) {
        // increase brakes while we're rolling
        console.log(`rolling brakes: ${this.brake}`);
        this.brake = Math.min(this.brake + 5, 100);
        this.setBrakes(api, this.brake);

        // and pull back on the elevator if we're in a for tail
        //draggers so that we don't end up in a nose-over.
        if (isTailDragger && this.brake > 50) {
          const elevator = constrainMap(this.brake, 0, 100, 0, -4000) | 0;
          api.trigger("ELEVATOR_SET", elevator);
        }

        console.log(`speed on the ground:`, speed);
        if (speed < 5) stageManager.nextStage();
      }

      await autorudder(
        api,
        { x: long, y: lat },
        { x: start.long, y: start.lat },
        { x: end.long, y: end.lat },
        flightData,
        flightModel
      );
    }

    // ============================

    if (stage === LANDING_COMPLETE) {
      console.log(`aaaaand we're done`);
      this.setBrakes(api, 0);
      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }
      for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 0);
      trim.pitchLock = false;
      await api.trigger(`SPOILERS_OFF`);
      api.trigger(`ENGINE_AUTO_SHUTDOWN`);
      api.trigger(`PARKING_BRAKES`);
      this.done();
    }

    // ============================
  }

  done() {
    this.landing = false;
    this.brake = 0;
    this.autopilot.setParameters({
      MASTER: false,
      [ALTITUDE_HOLD]: false,
      [LEVEL_FLIGHT]: false,
      [AUTO_THROTTLE]: false,
      [HEADING_MODE]: false,
      [AUTO_LAND]: false,
    });
  }

  setBrakes(api, percentage) {
    const value = map(percentage, 0, 100, -16383, 16383) | 0;
    api.trigger(`AXIS_LEFT_BRAKE_SET`, value);
    api.trigger(`AXIS_RIGHT_BRAKE_SET`, value);
  }

  restrictTargetVS() {
    const stage = this.stageManager.currentStage;
    if (stage === FLYING_APPROACH) return true;
    if (stage === GET_TO_RUNWAY) return true;
    if (stage === STALL_LANDING) return true;
    if (stage === INITIATE_STALL) return true;
    return false;
  }
}

export { AutoLand };

// FIXME: taken from auto-takeoff

async function autorudder(api, plane, start, end, flightData, flightModel) {
  const { lat, long, speed, trueHeading, onGround } = flightData;
  const { isTailDragger, minRotation } = flightModel;

  if (!onGround) return;

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

  // On landing, we don't actually want "more rudder the slower we
  // go", we're already coming in straight so we just want gentle
  // rudder the entire rollout.
  const speedFactor = constrainMap(speed, 100, 0, 0.25, 0.01);

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
