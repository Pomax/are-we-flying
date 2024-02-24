import {
  getHeadingFromTo,
  getDistanceBetweenPoints,
  getPointAtDistance,
  getCompassDiff,
  constrainMap,
  project,
  map,
  constrain,
} from "../utils/utils.js";
import {
  FEET_PER_METER,
  KM_PER_NM,
  ENV_PATH,
  AUTO_THROTTLE,
  ALTITUDE_HOLD,
  TERRAIN_FOLLOW,
  LEVEL_FLIGHT,
  HEADING_MODE,
  //GLIDE_SLOPE_DURATION, // minutes
  //GLIDE_SLOPE_MAX_VS // feet per minute
} from "../utils/constants.js";

// Let's formally declare our distances (in flight minutes)
const APPROACH_LINE_DURATION = 2;
const GLIDE_SLOPE_DURATION = 3;
const SHORT_FINAL_DURATION = 1;

import { watch } from "../utils/reload-watcher.js";

import dotenv from "dotenv";
dotenv.config({ path: ENV_PATH });
const { DATA_FOLDER } = process.env;

const __dirname = import.meta.dirname;
let alos;
let { ALOSInterface } = await watch(
  __dirname,
  `../elevation/alos-interface.js`,
  (lib) => {
    ALOSInterface = lib.ALOSInterface;
    if (alos) {
      Object.setPrototypeOf(alos, ALOSInterface.prototype);
    }
  }
);
alos = new ALOSInterface(DATA_FOLDER);

import { loadAirportDB } from "msfs-simconnect-api-wrapper";
const airports = loadAirportDB();

const { abs, sign, tan, min, max, floor, ceil } = Math;
let prev_hDiff = 0;

const GETTING_ONTO_APPROACH = `GETTING_ONTO_APPROACH`;
const THROTTLE_TO_CLIMB_SPEED = `THROTTLE_TO_CLIMB_SPEED`;
const FLYING_THE_GLIDE_SLOPE = `FLYING_THE_GLIDE_SLOPE`;
const RIDE_OUT_SHORT_FINAL = `RIDE_OUT_SHORT_FINAL`;
const GET_TO_RUNWAY_START = `GET_TO_RUNWAY_START`;
const LANDING_ON_RUNWAY = `LANDING_ON_RUNWAY`;
const ROLLING_AND_BRAKING = `ROLLING_AND_BRAKING`;
const END_OF_LANDING = `END_OF_LANDING`;

const LANDING_STEPS = [
  GETTING_ONTO_APPROACH,
  THROTTLE_TO_CLIMB_SPEED,
  FLYING_THE_GLIDE_SLOPE,
  RIDE_OUT_SHORT_FINAL,
  GET_TO_RUNWAY_START,
  LANDING_ON_RUNWAY,
  ROLLING_AND_BRAKING,
  END_OF_LANDING,
];

/**
 * We'll define a simple sequencer that we can use
 * to step through the various stages of our landing.
 */
class Sequence {
  constructor(api) {
    this.api = api;
    this.reset();
  }
  reset(steps = LANDING_STEPS) {
    this.steps = steps.slice();
    this.nextStage();
  }
  nextStage() {
    this.step = this.steps.shift();
    return this.step;
  }
  setStage(step) {
    const { steps } = this;
    if (steps.includes(step)) {
      this.step = step;
      while (steps[0] !== step) steps.shift();
      return true;
    }
  }
}

/**
 * And our autolanding class.
 */
export class AutoLanding {
  constructor(autopilot, lat, long, flightModel) {
    console.log(`autolanding:`, lat, long);
    this.autopilot = autopilot;
    this.reset(autopilot, lat, long, flightModel);
  }

  /**
   * ...
   */
  reset(autopilot, lat, long, flightModel) {
    console.log(`resetting autolanding`);
    prev_hDiff = 0;
    this.done = false;
    this.stage = new Sequence(autopilot);
    this.target = false;

    // Do we already have a landing mapped?
    this.approachData = autopilot.waypoints.getLanding();
    if (this.approachData) return;

    // If not, find a nearby approach:
    const { vs1, climbSpeed, cruiseSpeed, isFloatPlane } = flightModel;
    const approachData = (this.approachData = determineLanding(
      lat,
      long,
      vs1,
      climbSpeed,
      cruiseSpeed,
      isFloatPlane
    ));

    // Then, if we have an approach, add the relevant waypoints to our flight
    // waypoints (This will set up a flight plan if we didn't have one).
    if (approachData) {
      const { waypoints } = autopilot;
      const { approach } = approachData;
      const points = approach.points.slice();
      const [last] = points;
      points.reverse();
      const landingWaypoint = true;
      points.forEach((p, i) => {
        const [lat, long, alt] = p;
        points[i] = waypoints.add(lat, long, alt, p === last, landingWaypoint);
      });
      approach.points = points.reverse();
      waypoints.setLanding(approachData);
    }
  }

  /**
   * If we're landing, we want to restrict how much the plane is allowed
   * to deflect the aileron, based on how far off the center line we are:
   * if we're lined up, we don't get to correct a lot, but if we're 50
   * meters away, allow for a generous amount of aileron to get us back.
   */
  getMaxDeflection(aHeadingDiff, lat, long) {
    return constrainMap(aHeadingDiff, 0, 1, 2000, 6000);
  }

  /**
   * ...
   */
  async run(flightInformation) {
    // console.log(`tick`, this.stage.step);

    if (!flightInformation) return;
    const { model: flightModel, data: flightData } = flightInformation;
    if (!flightModel || !flightData) return;

    const {
      hasRetractibleGear,
      isTailDragger,
      engineCount,
      climbSpeed,
      vs0,
      vs1,
    } = flightModel;

    const {
      alt,
      altAboveGround,
      bank,
      gearSpeedExceeded,
      isGearDown,
      lat,
      long,
      onGround,
      speed,
    } = flightData;

    const { approachData, autopilot, stage } = this;
    const { points } = approachData.approach;
    const [p5, p4, p3, p2, p1, pA, f1, f2] = points;
    const { api, waypoints } = autopilot;
    let { currentWaypoint: target } = waypoints;
    this.target = target;
    const { step } = stage;

    if (!target) {
      target = p5;
    } else if (!points.includes(target)) return;

    // console.log(`target = ${target.id}`);

    if (step === GETTING_ONTO_APPROACH) {
      console.log(step, target.id, pA.id, p1.id);

      const onTerrainFollow = !!autopilot.modes[TERRAIN_FOLLOW];

      if (f2 && target === f2) {
        const d = getDistanceBetweenPoints(lat, long, f2.lat, f2.long);
        if (d > 5) return;
        autopilot.setParameters({
          [TERRAIN_FOLLOW]: d > 1 && onTerrainFollow,
          [ALTITUDE_HOLD]: p2.alt,
        });
      }

      if (f1 && target === f1) {
        const d = getDistanceBetweenPoints(lat, long, f1.lat, f1.long);
        if (d > 5) return;
        autopilot.setParameters({
          [TERRAIN_FOLLOW]: d > 1 && onTerrainFollow,
          [ALTITUDE_HOLD]: p2.alt,
        });
      }

      if (target === pA || target === p1) {
        console.log(`approach reached`);
        autopilot.setParameters({
          [ALTITUDE_HOLD]: p2.alt,
          [AUTO_THROTTLE]: climbSpeed + 20,
          [TERRAIN_FOLLOW]: false,
        });
        stage.nextStage();
      }
    }

    if (step === THROTTLE_TO_CLIMB_SPEED) {
      console.log(step, target.id, p2.id);

      if (target === p2) {
        console.log(`glide slope reached`);
        autopilot.setParameters({ [ALTITUDE_HOLD]: p3.alt });
        api.trigger(`LANDING_LIGHTS_ON`);
        stage.nextStage();
      }
    }

    if (step === FLYING_THE_GLIDE_SLOPE) {
      console.log(step, target.id, p4.id);
      // Ease the plane down the glide slope
      const d1 = getDistanceBetweenPoints(lat, long, p3.lat, p3.long);
      const d2 = getDistanceBetweenPoints(p2.lat, p2.long, p3.lat, p3.long);
      const lerpAlt = constrainMap(d1 / d2, 0, 1, p3.alt, p2.alt);
      autopilot.setParameters({
        [ALTITUDE_HOLD]: lerpAlt,
      });

      // Drop gears when it's safe to do so
      if (d1 / d2 < 0.5 && abs(bank) < 3) {
        if (hasRetractibleGear && !gearSpeedExceeded && !isGearDown) {
          console.log(`gear down`);
          api.trigger(`GEAR_DOWN`);
          console.log(`touch of flaps`);
          for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 2);
        }
      }

      // And transition to short final when we're close enough
      if (target === p3) {
        console.log(`short final reached`);
        // force gears and flaps, in case something was stuck
        api.trigger(`GEAR_DOWN`);
        for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 2);
        stage.nextStage();
      }
    }

    if (step === RIDE_OUT_SHORT_FINAL) {
      console.log(step);

      const d1 = getDistanceBetweenPoints(lat, long, p4.lat, p4.long);
      const d2 = getDistanceBetweenPoints(p3.lat, p3.long, p4.lat, p4.long);
      const ratio = constrain(d1 / d2, 0, 1);
      const lerpAlt = constrainMap(ratio, 0, 1, p4.alt, p3.alt);

      autopilot.setParameters({
        [AUTO_THROTTLE]: min(climbSpeed, 100),
        [ALTITUDE_HOLD]: lerpAlt,
      });

      const d5 = getDistanceBetweenPoints(lat, long, p5.lat, p5.long);
      const d45 = getDistanceBetweenPoints(p4.lat, p4.long, p5.lat, p5.long);

      if (d5 < d45 || target === p5) {
        console.log(`runway reached`);
        stage.nextStage();
      }
    }

    if (step === GET_TO_RUNWAY_START) {
      console.log(step);

      console.log(`cut engines`);
      autopilot.setParameters({ [AUTO_THROTTLE]: false });
      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }

      console.log(`drop to runway altitude`);
      autopilot.setParameters({ [ALTITUDE_HOLD]: false });

      stage.nextStage();
    }

    if (step === LANDING_ON_RUNWAY) {
      console.log(step);

      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }

      if (!onGround) {
        // Try to keep the plane pitched up.
        setPitch(api, -2, flightInformation);
      }

      //
      else {
        autopilot.setParameters({
          [LEVEL_FLIGHT]: false,
          [HEADING_MODE]: false,
          [ALTITUDE_HOLD]: false,
        });

        console.log(`restore flaps`);
        for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 0);

        console.log(`full reverse (if available)`);
        for (let i = 1; i <= engineCount; i++) {
          await api.trigger(`THROTTLE${i}_AXIS_SET_EX1`, -32000);
        }
        console.log(`speed brakes (if available)`);
        await api.trigger(`SPOILERS_ON`);

        console.log(`start braking`);
        this.brake = 0;
        stage.nextStage();
      }
    }

    if (step === ROLLING_AND_BRAKING) {
      console.log(step);

      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }

      if (!onGround) {
        // Keep trying to keep the plane pitched up, because
        // the plane might be bouncing on the runway.
        setPitch(api, -2, flightInformation);
      }

      if (isTailDragger) {
        // pull back on the elevator so we don't nose-over
        for (let i = 1; i <= engineCount; i++) {
          await api.trigger(`THROTTLE${i}_AXIS_SET_EX1`, -32000);
        }
      }

      // Stay on the runway...
      autoRudder(api, p5, flightData);

      // increase brakes while we're rolling
      this.brake = Math.min(this.brake + 5, isTailDragger ? 70 : 100);
      setBrakes(api, this.brake);

      if (isTailDragger && this.brake > 50) {
        // and pull back on the elevator if we're in a for tail
        // draggers so that we don't end up in a nose-over.
        const elevator = constrainMap(this.brake, 0, 100, 0, -4000) | 0;
        api.trigger(`ELEVATOR_SET`, elevator);
      }

      if (speed < vs0 && !isTailDragger) {
        console.log(`add flaps to brake even more`);
        for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 10);
      }

      // TODO: maybe add "roll to the end of the runway"?
      if (speed < 5) {
        console.log(`cutoff speed reached`);
        stage.nextStage();
      }
    }

    if (step === END_OF_LANDING) {
      console.log(step);

      console.log(`set parking brakes`);
      setBrakes(api, 0);
      api.trigger(`PARKING_BRAKES`);

      console.log(`neutral stick`);
      for (let i = 1; i <= engineCount; i++) {
        api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }

      console.log(`reset flaps`);
      for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 0);

      console.log(`disengage speed brakes`);
      api.trigger(`SPOILERS_OFF`);

      console.log(`AP off`);
      autopilot.setParameters({
        MASTER: false,
        [LEVEL_FLIGHT]: false,
        [HEADING_MODE]: false,
        [ALTITUDE_HOLD]: false,
      });

      console.log(`shut down engines`);
      api.trigger(`ENGINE_AUTO_SHUTDOWN`);
      this.done = true;
    }
  }
}

/**
 * ...
 */
function setBrakes(api, percentage) {
  const value = map(percentage, 0, 100, -16383, 16383) | 0;
  api.trigger(`AXIS_LEFT_BRAKE_SET`, value);
  api.trigger(`AXIS_RIGHT_BRAKE_SET`, value);
}

/**
 * ...
 */
function autoRudder(
  api,
  target,
  { onGround, lat, long, trueHeading, rudder },
  cMax = 0.05
) {
  if (!onGround) return;
  const targetHeading = getHeadingFromTo(lat, long, target.lat, target.long);
  let hDiff = getCompassDiff(trueHeading, targetHeading);
  const dHeading = hDiff - prev_hDiff;
  prev_hDiff = hDiff;

  let update = 0;
  update += constrainMap(hDiff, -30, 30, -cMax / 2, cMax / 2);
  update += constrainMap(dHeading, -1, 1, -cMax, cMax);

  const newRudder = rudder / 100 + update;
  api.set(`RUDDER_POSITION`, newRudder);
}

/**
 * ...
 */
function determineLanding(
  lat,
  long,
  vs1,
  climbSpeed,
  cruiseSpeed,
  waterLanding
) {
  // Get the shortlist of 10 airports near us that we can land at.
  let shortList = airports
    .filter((a) => {
      if (waterLanding) return a; // float planes *can* land on real runways
      else return a.runways.some((r) => r.surface.includes(`water`) === false);
    })
    .map((a) => {
      a.distance = getDistanceBetweenPoints(lat, long, a.latitude, a.longitude);
      return a;
    })
    .sort((a, b) => a.distance - b.distance)
    .filter((a) => a.distance < 25 * KM_PER_NM);

  // And do a quick clone so we don't overwrite the airport DB
  // when we do our calculations (which will involve updating
  // elevations at points that might be runway points)
  shortList = JSON.parse(JSON.stringify(shortList));
  console.log(`Checking ${shortList.length} airports`);

  // Then for each of these airports, determine their approach(es) or rule them out.
  shortList.forEach((airport) => {
    airport.runways.forEach((runway) => {
      calculateRunwayApproaches(lat, long, climbSpeed, cruiseSpeed, runway);
    });
  });

  // Then figure out which approach will be our best/safest option
  const approachData = findAndBindBestApproach(shortList);

  // If that's none of them: sucks to be us! O_O
  if (!approachData) {
    console.error(`There is nowhere to land!`);
    return false;
  }

  console.log(approachData);

  // Otherwise, this is the approach we'll be flying.
  return approachData;
}

/**
 * ...
 */
function calculateRunwayApproaches(lat, long, climbSpeed, cruiseSpeed, runway) {
  const { start: a, end: b } = runway;
  const glideSpeed = climbSpeed + 20;

  runway.approach.forEach((approach, idx) => {
    // Where do we touch down?
    const start = idx === 0 ? a : b;

    // We now know our runway target altitude:
    const runwayAlt = floor(start[2]);

    // And so we know everything we need for p4:
    const p4 = [start[0], start[1], runwayAlt + 20];

    // And of course, the runway end, and thus p5:
    const end = start === a ? b : a;
    const p5 = [end[0], end[1], runwayAlt];

    // Next: what's our heading *away from the runway*? Because we're going
    // to be placing points in the opposite direction of the approach heading.
    const heading = getHeadingFromTo(end[0], end[1], start[0], start[1]);

    // With all that done, let's first assume this approach will work.
    approach.works = true;
    // And then let's calculate the distances we talked about:
    const flightMinute = (v) => (v * KM_PER_NM) / 60;
    const d12 = APPROACH_LINE_DURATION * flightMinute(cruiseSpeed);
    const d23 = GLIDE_SLOPE_DURATION * flightMinute(glideSpeed);
    const d34 = SHORT_FINAL_DURATION * flightMinute(climbSpeed);

    // And now we can calculate p1, p2, and p3:
    const getPoint = (distance) =>
      getPointAtDistance(start[0], start[1], distance, heading);

    const d1 = d12 + d23 + d34;
    const { lat: p1t, long: p1g } = getPoint(d1);
    const p1 = [p1t, p1g, runwayAlt + 1400];

    const d2 = d23 + d34;
    const { lat: p2t, long: p2g } = getPoint(d2);
    const p2 = [p2t, p2g, runwayAlt + 1400];

    const d3 = d34;
    const { lat: p3t, long: p3g } = getPoint(d3);
    const p3 = [p3t, p3g, runwayAlt + 200];

    // And we're done!
    const points = [p5, p4, p3, p2, p1];

    // Calculate our pA point:
    const dA1 = 0.75 * d12;
    const dA = d1 + dA1;
    const { lat: pAt, long: pAg } = getPoint(dA);
    const pA = [pAt, pAg, p2[2]];
    points.push(pA);

    // And then check whether we need offset points:
    let f1, f2;
    const offsetDistance = dA1;
    const aHeading = getHeadingFromTo(pAt, pAg, lat, long);
    const hDiff = getCompassDiff(heading, aHeading);

    if (hDiff < -90 || hDiff > 90) {
      // set up our first offset
      const sgn = sign(hDiff);
      const { lat: f1Lat, long: f1Long } = getPointAtDistance(
        pAt,
        pAg,
        offsetDistance,
        heading + sgn * 90
      );
      f1 = [f1Lat, f1Long, p2[2]];
      points.push(f1);

      // Do we also need a second offset?
      const p = project(start[1], start[0], end[1], end[0], long, lat);
      const distanceToApproach = getDistanceBetweenPoints(lat, long, p.y, p.x);
      if (abs(distanceToApproach) < offsetDistance) {
        const { lat: f2t, long: f2g } = getPointAtDistance(
          f1Lat,
          f1Long,
          offsetDistance,
          (heading + 180) % 360
        );
        f2 = [f2t, f2g, p2[2]];
        points.push(f2);
      }
    }

    // What is going to be the distance to this approach?
    approach.points = points;
    approach.target = f2 ? f2 : f1 ? f1 : pA;
    approach.distance = getDistanceBetweenPoints(
      lat,
      long,
      approach.target[0],
      approach.target[1]
    );

    // We're going to do this the simple way: we're simply going to
    // sample along our path at 100m intervals, and if ALOS says
    // there's an unsafe elevation at any sample point, the approach
    // is bad. But we'll ignore the runway and short final. Those
    // basically *have* to work for a runway to even be a runway.
    approach.works = (function verifyApproach() {
      const points = approach.points.slice(2);
      for (let i = 0, e = points.length - 1; i < e; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const h = getHeadingFromTo(p1[0], p1[1], p2[0], p2[1]);
        const total = getDistanceBetweenPoints(p1[0], p1[1], p2[0], p2[1]);
        for (let d = 0; d <= total; d += 0.1) {
          const p = getPointAtDistance(p1[0], p1[1], d, h);
          const r = d / total;
          const alt = (1 - r) * p1[2] + r * p2[2];
          const found = alos.lookup(p.lat, p.long) * FEET_PER_METER;
          if (found > alt) return false;
        }
      }
      return true;
    })();
  });
}

/**
 * Find the airport, runway, and approach with the longest
 * runway, to give ourselves the best possible chance of success.
 */
function findAndBindBestApproach(airports) {
  const flatList = [];

  airports.forEach((airport) =>
    airport.runways.forEach((runway) =>
      runway.approach.forEach((approach) => {
        if (approach.works) {
          flatList.push({
            airport,
            runway,
            approach,
          });
        }
      })
    )
  );

  return flatList.sort((a, b) => b.runway.length - a.runway.length)[0];
}

/**
 * Fiddle with the elevator to try to effect a specific pitch
 */
function setPitch(api, targetPitch, { model: flightModel, data: flightData }) {
  let { elevator, pitch, dPitch } = flightData;
  let { weight } = flightModel;
  elevator = -(elevator / 100) * 2 ** 14;
  const diff = targetPitch - pitch;
  const maxValue = constrainMap(weight, 2000, 6000, 0, 1500);
  let correction = constrainMap(diff, -5, 5, -maxValue, maxValue);
  if (sign(dPitch) === sign(diff)) correction /= 3;
  let next = elevator + correction;
  console.log(`pitch check:`, {
    pitch,
    dPitch,
    targetPitch,
    diff,
    elevator,
    correction,
    next,
  });
  api.trigger(`ELEVATOR_SET`, next | 0);
}
