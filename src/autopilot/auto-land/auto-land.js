import { setPitch, performAirportCalculations } from "./helpers.js";

import {
  radians,
  constrainMap,
  getCompassDiff,
  getHeadingFromTo,
  getDistanceBetweenPoints,
  getLineCircleIntersection,
  map,
  nf,
  constrain,
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

const { abs, round, ceil, tan, min, max } = Math;

// Stages of our autolander - we can't use Symbols because we need
// something that can still compare as "true" after a hot-reload.
export const GETTING_TO_APPROACH = `autoland: GETTING_TO_APPROACH`;
export const FLYING_APPROACH = `autoland: FLYING_APPROACH`;
export const GET_TO_RUNWAY = `autoland: GET_TO_RUNWAY`;
export const INITIATE_STALL = `autoland: INITIATE_STALL`;
export const STALL_LANDING = `autoland: STALL_LANDING`;
export const TOUCH_DOWN = `autoland: TOUCH_DOWN`;
export const ROLLING = `autoland: ROLLING`;
export const LANDING_COMPLETE = `autoland: LANDING_COMPLETE`;

const FEATURES = {
  PITCH_PROTECTION: true,
};

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
    console.log(`SWITCHING STAGE FROM ${this.currentStage}`);
    if (this.currentStage === GETTING_TO_APPROACH)
      this.currentStage = FLYING_APPROACH;
    else if (this.currentStage === FLYING_APPROACH)
      this.currentStage = GET_TO_RUNWAY;
    else if (this.currentStage === GET_TO_RUNWAY)
      this.currentStage = INITIATE_STALL;
    else if (this.currentStage === INITIATE_STALL)
      this.currentStage = STALL_LANDING;
    else if (this.currentStage === STALL_LANDING)
      this.currentStage = TOUCH_DOWN;
    else if (this.currentStage === TOUCH_DOWN) this.currentStage = ROLLING;
    else if (this.currentStage === ROLLING)
      this.currentStage = LANDING_COMPLETE;
    else {
      this.reset();
      throw new Error(`Could not transition to the next stage`);
    }
    console.log(`NEW STAGE IS ${this.currentStage}`);
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
    this.reset();
  }

  reset() {
    this.stageManager.reset();
    this.landing = false;
    this.brake = 0;
  }

  /**
   *
   * @param {*} flightInformation
   * @returns
   */
  async land(flightInformation, ICAO = undefined, WAYPOINTS = true) {
    this.flightInformation = flightInformation;
    this.stageManager.reset();
    this.landing = true;

    console.log(`running land()`);

    // don't run the rest of the code if we already have a landing planned.
    const waypoints = await this.autopilot.getWaypoints();
    if (waypoints.some((w) => w.landing)) {
      console.log(`already have landing waypoints`);
      return;
    }

    const { data: flightData, model: flightModel } = flightInformation;
    const { title } = flightModel;
    const { lat, long } = flightData;
    const waterLanding = title.includes(`float`) || title.includes(`amphi`);
    // Do we need to find a landing relative to the plane,
    // or relative to the last waypoint in a flight path?
    const reference = [lat, long];
    if (waypoints.length) {
      const last = waypoints.at(-1);
      reference[0] = last.lat;
      reference[1] = last.long;
    }
    // Get the nearest airport, figure out its critical points, and find an approach:
    const airport = await this.findAirport(...reference, waterLanding);
    performAirportCalculations(this.flightInformation, airport);
    await this.setupApproach(flightData, airport, WAYPOINTS);
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
        a.runways.some((r) => r.surface?.startsWith(`water `))
      );
    } else {
      list = list.filter((a) =>
        a.runways.some((r) => !r.surface?.startsWith(`water`))
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
  async setupApproach(
    { lat, long, heading: planeHeading },
    airport,
    WAYPOINTS = true
  ) {
    const candidates = [];
    airport.runways.forEach((runway) => {
      const approach = runway.approach[0];
      const { offsets } = approach;
      offsets.forEach((offset, oidx) => {
        const tip = approach.tips[oidx];
        const distance = getDistanceBetweenPoints(lat, long, ...offset);
        candidates.push({
          runway,
          approach,
          offset,
          tip,
          distance,
        });
      });
    });
    candidates.sort((a, b) => a.distance - b.distance);
    const nearest = (this.approach = candidates[0]);

    if (WAYPOINTS) {
      const { runway, approach, offset, tip, idx } = nearest;
      const { heading } = runway;
      const { anchor, stable, marking } = approach;
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
      const swap = abs(getCompassDiff(heading, planeHeading)) < 90;

      const start = runway.start;
      this.autopilot.addWaypoint(
        ...start,
        round(runwayAlt + (swap ? rise : 0)),
        true
      );

      const end = runway.end;
      this.autopilot.addWaypoint(
        ...end,
        round(runwayAlt + (swap ? 0 : rise)),
        true
      );
    }

    return nearest;
  }

  /**
   *
   */
  async run() {
    const { api, autopilot, flightInformation, stageManager } = this;
    const { trim, modes } = autopilot;

    const currentWaypoint = autopilot.waypoints.currentWaypoint;
    if (!currentWaypoint || !currentWaypoint.landing) {
      return;
    }

    // All the values we're going to need:
    const { data: flightData, model: flightModel } = flightInformation;
    const {
      bank,
      elevator,
      gearSpeedExceeded,
      isGearDown,
      lat,
      lift,
      long,
      onGround,
      pitch,
      speed,
    } = flightData;
    const { pitch: dPitch } = flightData.d;
    const {
      climbSpeed,
      engineCount,
      hasRetractibleGear,
      isTailDragger,
      vs0,
      weight,
    } = flightModel;
    const pitchFlightInformation = { elevator, pitch, dPitch };
    const approachSpeed = climbSpeed + 20;
    const waypoints = (await autopilot.getWaypoints()).filter((w) => w.landing);
    const remainingWaypoints = waypoints.filter((w) => !w.completed).length;
    const approachPoints = waypoints.slice(-4).reverse();
    const [end, start, M, anchor] = approachPoints;

    // At what point do we cut the throttle and just glide?
    const lowerLimit = constrainMap(weight, 3000, 6000, 0, 0.3);
    const upperLimit = constrainMap(weight, 3000, 6000, 0.3, 0.5);
    const dropDistance = constrainMap(speed, 80, 150, lowerLimit, upperLimit);

    // What stage are we in?
    console.log(
      `\n  ==================================================================\n`,
      `  ${stageManager.currentStage}, track has ${remainingWaypoints} waypoints left`,
      `\n  ==================================================================\n`
    );

    // ============================

    if (stageManager.currentStage === GETTING_TO_APPROACH) {
      if (remainingWaypoints === 4) {
        autopilot.setParameters({
          // explicitly set auto-throttle to target the approach speed.
          [AUTO_THROTTLE]: approachSpeed,
          // and turn off terrain follow, if it's on.
          [TERRAIN_FOLLOW]: false,
        });
        stageManager.nextStage();
      }
    }

    // ============================

    if (stageManager.currentStage === FLYING_APPROACH) {
      // Determine what altitude we should be at while approaching the runway.
      const alt1 = anchor.alt; // feet
      const alt2 = M.alt; // feet

      // Distances in km
      const trackLeft = getDistanceBetweenPoints(lat, long, M.lat, M.long);
      const trackTotal = getDistanceBetweenPoints(
        anchor.lat,
        anchor.long,
        M.lat,
        M.long
      );
      console.log(`distance to M: ${trackLeft}km`);

      // We want to be at a stable approach distance by the time we're 1km out.
      let targetAlt = alt2;
      const ratio = trackLeft / trackTotal;
      targetAlt = ratio * alt1 + (1 - ratio) * alt2;

      // Set our target altitude, but only if it's lower than we're
      // already at. We don't want to oscillate around the glide slope.
      autopilot.setParameters({
        [ALTITUDE_HOLD]: max(min(targetAlt, modes[ALTITUDE_HOLD]), alt2),
      });

      // gear down once we're flying the approach straight
      // enough and our speed allows for it.
      if (
        trackLeft / trackTotal < 0.5 &&
        hasRetractibleGear &&
        !gearSpeedExceeded &&
        !isGearDown &&
        abs(bank) < 3
      ) {
        console.log(`Gear down and trim and throttle to compensate`);
        api.trigger(`GEAR_DOWN`);
      }

      // transition when we pass M
      const de = getDistanceBetweenPoints(lat, long, end.lat, end.long);
      const dM = getDistanceBetweenPoints(M.lat, M.long, end.lat, end.long);
      console.log(de, dM, de < dM);
      if (de < dM) {
        // Just in case this didn't kick in earlier:
        api.trigger(`GEAR_DOWN`);
        autopilot.setParameters({ [AUTO_THROTTLE]: climbSpeed + 10 });
        for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 2);
        stageManager.nextStage();
      }
    }

    // ============================

    if (stageManager.currentStage === GET_TO_RUNWAY) {
      console.log(`drop distance = ${dropDistance}`);

      const dM = getDistanceBetweenPoints(M.lat, M.long, end.lat, end.long);
      const de = getDistanceBetweenPoints(lat, long, end.lat, end.long);
      const runway = getDistanceBetweenPoints(
        start.lat,
        start.long,
        end.lat,
        end.long
      );

      const altM = M.alt;
      const altS = start.alt + constrainMap(speed, 40, 80, 5, 30);
      const targetAlt = constrainMap(
        (de - runway) / (dM - runway),
        0,
        1,
        altS,
        altM
      );

      autopilot.setParameters({
        [ALTITUDE_HOLD]: targetAlt,
      });

      // ready to drop?
      if (de <= runway + dropDistance) {
        console.log(`Drop`);
        await autopilot.setParameters({
          [AUTO_THROTTLE]: false,
        });
        stageManager.nextStage();
      }
    }

    // ============================

    if (stageManager.currentStage === INITIATE_STALL) {
      console.log(`Cut the throttle`);
      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }
      // if (FEATURES.PITCH_PROTECTION) {
      //   console.log(`Disable ALT mode in order to glide`);
      //   autopilot.setParameters({
      //     [ALTITUDE_HOLD]: false,
      //   });
      // }
      stageManager.nextStage();
    }

    // ============================

    if (stageManager.currentStage === STALL_LANDING) {
      // prevent peripherals from interfering
      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }

      // if (FEATURES.PITCH_PROTECTION) {
      // Make sure the aircraft isn't angled such that we're nose-diving into the runway - neutral pitch
      setPitch(this.api, -2, pitchFlightInformation);
      // }

      if (lift < 20) {
        console.log(`Sort-Of-Flare`);
        stageManager.nextStage();
      }
    }

    // ============================

    if (stageManager.currentStage === TOUCH_DOWN) {
      // if (FEATURES.PITCH_PROTECTION) {
      // Make sure the aircraft isn't angled such that we're nose-diving into the runway - nose up a little
      setPitch(this.api, -2, pitchFlightInformation);
      // }

      if (onGround) {
        console.log(`Touchdown`);
        console.log(`Setting throttle to whatever is the lowest it'll go...`);
        for (let i = 1; i <= engineCount; i++) {
          await api.trigger(`THROTTLE${i}_AXIS_SET_EX1`, -32000);
        }
        console.log(`Also deploying speed brakes, if we have them`);
        await api.trigger(`SPOILERS_ON`);
        if (isTailDragger) {
          console.log(`Flaps back up so we don't nose-over`);
          for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 0);
        }
        if (isTailDragger) {
          console.log(`compensate with elevator`);
          api.trigger(`ELEVATOR_SET`, -1000);
        }
        stageManager.nextStage();
      }
    }

    // ============================

    if (stageManager.currentStage === ROLLING) {
      if (onGround) {
        // increase brakes while we're rolling
        console.log(`Rolling and braking: ${this.brake}% brakes`);
        this.brake = Math.min(this.brake + 5, isTailDragger ? 70 : 100);

        this.setBrakes(api, this.brake);

        // and pull back on the elevator if we're in a for tail
        //draggers so that we don't end up in a nose-over.
        if (isTailDragger && this.brake > 50) {
          const elevator = constrainMap(this.brake, 0, 100, 0, -4000) | 0;
          api.trigger(`ELEVATOR_SET`, elevator);
        }

        if (speed < vs0 && !isTailDragger) {
          console.log(`Full flaps to aid in braking`);
          for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 10);
        }

        if (speed < 5) stageManager.nextStage();

        await autorudder(
          api,
          { x: long, y: lat },
          { x: start.long, y: start.lat },
          { x: end.long, y: end.lat },
          flightData,
          flightModel
        );
      }

      // If we're bouncing, make sure that doesn't nose-dive us into the runway
      else {
        // TEST TEST TEST TEST TEST TEST - do we only need this for the top rudder? O_o
        if (FEATURES.PITCH_PROTECTION) {
          // Make sure the aircraft isn't angled such that we're nose-diving into the runway.
          this.currel ??=
            16384 * (await this.api.get(`ELEVATOR_POSITION`)).ELEVATOR_POSITION;
          const step = -100 * (pitch + 2);
          console.log(
            `[SECONDARY] pitch check: current=${nf(
              pitch
            )}, target=0, elevator=${this.currel}, next=${this.currel + step}`
          );
          this.currel += step;
          this.api.trigger(`ELEVATOR_SET`, this.currel | 0);
        }
        // TEST TEST TEST TEST TEST TEST - do we only need this for the top rudder? O_o
      }
    }

    // ============================

    if (stageManager.currentStage === LANDING_COMPLETE) {
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
  const speedFactor = constrainMap(speed, 80, 0, 0.25, 0.05);

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
