import {
  constrain,
  constrainMap,
  getCompassDiff,
  getDistanceBetweenPoints,
  getHeadingFromTo,
  getPointAtDistance,
  map,
  project,
} from "../utils/utils.js";

import {
  ALTITUDE_HOLD,
  APPROACH_LINE_DURATION,
  AUTO_LANDING,
  AUTO_THROTTLE,
  CUT_THE_ENGINES,
  END_OF_LANDING,
  FEET_PER_METER,
  FLY_THE_GLIDE_SLOPE,
  GET_ONTO_THE_APPROACH,
  GLIDE_SLOPE_DURATION,
  HEADING_MODE,
  KM_PER_NM,
  LAND_ON_THE_RUNWAY,
  LANDING_STEPS,
  LEVEL_FLIGHT,
  RIDE_OUT_SHORT_FINAL,
  ROLL_AND_BRAKE,
  SHORT_FINAL_DURATION,
  TERRAIN_FOLLOW,
  THROTTLE_TO_GLIDE_SPEED,
} from "../utils/constants.js";

import { alos } from "../elevation/alos-instance.js";
import { loadAirportDB } from "msfs-simconnect-api-wrapper";
const airports = loadAirportDB();

const { abs, sign, min, floor } = Math;
import { Sequence } from "../utils/sequence.js";

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
    this.autoRudderPrevHDiff = 0;
    this.done = false;
    this.stage = new Sequence(autopilot, LANDING_STEPS);
    this.target = false;

    // Do we already have a landing mapped?
    this.approachData = autopilot.waypoints.getLanding();
    if (this.approachData) return;

    // If not, find a nearby approach:
    const { climbSpeed, cruiseSpeed, isFloatPlane } = flightModel;
    const approachData = (this.approachData = determineLanding(
      lat,
      long,
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
      const last = points.at(-1);
      points.forEach((p, i) => {
        points[i] = waypoints.add(...p, p === last, true);
      });
      approach.points.reverse();
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
    return;
  }

  /**
   * ...
   */
  async run(flightInformation) {
    // console.log(`tick`, this.stage.step);

    if (!flightInformation) return;
    const { model: flightModel, data: flightData } = flightInformation;
    if (!flightModel || !flightData) return;

    const { hasRetractibleGear, isTailDragger, engineCount, climbSpeed, vs0 } =
      flightModel;

    const glideSpeed = climbSpeed + 20;

    const { bank, gearSpeedExceeded, isGearDown, lat, long, onGround, speed } =
      flightData;

    const { autopilot, stage } = this;
    const { api, waypoints } = autopilot;
    const points = waypoints.getLandingPoints();
    const [p5, p4, p3, p2, p1, pA, f1, f2] = points;
    let { currentWaypoint: target } = waypoints;
    this.target = target;
    const { step } = stage;

    if (!target) {
      target = p5;
    } else if (!target.landing) return;

    // console.log(
    //   target.id,
    //   target === p1,
    //   target === p2,
    //   target === p3,
    //   target === p4,
    //   target === p5
    // );

    if (step === GET_ONTO_THE_APPROACH) {
      console.log(step, target.id, pA.id, p1.id);

      if (f2 && target === f2) {
        const d = getDistanceBetweenPoints(lat, long, f2.lat, f2.long);
        if (d > 5) return;
        autopilot.setParameters({
          [TERRAIN_FOLLOW]: false,
          [ALTITUDE_HOLD]: p2.alt,
        });
      }

      if (f1 && target === f1) {
        const d = getDistanceBetweenPoints(lat, long, f1.lat, f1.long);
        if (d > 5) return;
        autopilot.setParameters({
          [TERRAIN_FOLLOW]: false,
          [ALTITUDE_HOLD]: p2.alt,
        });
      }

      if (target === p1) {
        console.log(`approach reached`);
        autopilot.setParameters({
          [TERRAIN_FOLLOW]: false,
          [ALTITUDE_HOLD]: p2.alt,
          [AUTO_THROTTLE]: glideSpeed,
        });
        stage.nextStage();
      }
    }

    if (step === THROTTLE_TO_GLIDE_SPEED) {
      console.log(step, target.id, p2.id, glideSpeed);

      if (target === p2) {
        console.log(`glide slope reached`);
        // Really the only meaningful thing we do is turning on our landing lights:
        api.trigger(`LANDING_LIGHTS_ON`);
        // And then it's on to the next stage.
        stage.nextStage();
      }
    }

    if (step === FLY_THE_GLIDE_SLOPE) {
      console.log(step, target.id, p4.id, glideSpeed);
      // In order to descend along the glide slope, we calculate how far
      // along we are as a ratio of the distance we need to cover, and
      // then use that to determine the altitude we "should" be flying
      // at that point:
      const d1 = getDistanceBetweenPoints(lat, long, p2.lat, p2.long);
      const d2 = getDistanceBetweenPoints(p2.lat, p2.long, p3.lat, p3.long);
      const ratio = constrain(d1 / d2, 0, 1);
      const lerpAlt = constrainMap(ratio, 0, 1, p2.alt, p3.alt);
      autopilot.setParameters({
        [ALTITUDE_HOLD]: lerpAlt,
        [AUTO_THROTTLE]: glideSpeed,
      });

      // While we're on the glide slope, we need to do some prep work
      // in the form of lowering our landing gear and adding a touch
      // of flaps when it's safe to do so.
      if (ratio > 0.5 && abs(bank) < 3) {
        if (hasRetractibleGear && !gearSpeedExceeded && !isGearDown) {
          console.log(`gear down`);
          api.trigger(`GEAR_DOWN`);
          console.log(`touch of flaps`);
          for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 2);
        }
      }

      // Then, transition to short final when we're at P3:
      if (ratio >= 1) {
        console.log(`short final reached`);
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
        [ALTITUDE_HOLD]: lerpAlt,
        [AUTO_THROTTLE]: glideSpeed,
      });

      const d5 = getDistanceBetweenPoints(lat, long, p5.lat, p5.long);
      const d45 = getDistanceBetweenPoints(p4.lat, p4.long, p5.lat, p5.long);

      if (d5 < d45 || target === p5) {
        console.log(`runway reached`);
        stage.nextStage();
      }
    }

    if (step === CUT_THE_ENGINES) {
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

    if (step === LAND_ON_THE_RUNWAY) {
      console.log(step);

      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }

      // Try to keep the plane pitched up.
      setPitch(api, -2.5, flightInformation);

      if (onGround) {
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

    if (step === ROLL_AND_BRAKE) {
      console.log(step);

      autopilot.setParameters({ [LEVEL_FLIGHT]: !onGround });

      // Still try to keep the plane pitched up.
      setPitch(api, -2.5, flightInformation);

      // And keep the throttle as far back as possible
      for (let i = 1; i <= engineCount; i++) {
        await api.trigger(`THROTTLE${i}_AXIS_SET_EX1`, -32000);
      }

      // Stay on the runway...
      const prevDiff = this.autoRudderPrevHDiff;
      this.autoRudderPrevHDiff = autoRudder(api, p5, flightData, prevDiff);

      // increase brakes while we're rolling
      this.brake = Math.min(this.brake + 5, isTailDragger ? 70 : 100);
      setBrakes(api, this.brake);

      if (isTailDragger) {
        // and pull back on the elevator if we're in a for tail
        // draggers so that we don't end up in a nose-over.
        const elevator = constrainMap(this.brake, 0, 100, -1000, -6000) | 0;
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
        [ALTITUDE_HOLD]: false,
        [AUTO_LANDING]: false,
        [HEADING_MODE]: false,
        [LEVEL_FLIGHT]: false,
      });

      console.log(`shut down engines`);
      api.trigger(`ENGINE_AUTO_SHUTDOWN`);
      this.done = true;
    }

    // Based on whether we return true or not, the autopilot will be running
    // at the higher polling interval
    const shortFinal = step === RIDE_OUT_SHORT_FINAL;
    const aboveRunway = step === ROLL_AND_BRAKE && speed > vs0;
    return shortFinal || aboveRunway;
  }
}

/**
 * ...
 */
function determineLanding(lat, long, climbSpeed, cruiseSpeed, waterLanding) {
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
    const points = [p1, p2, p3, p4, p5];

    // Calculate our pA point:
    const dA1 = 0.75 * d12;
    const dA = d1 + dA1;
    const { lat: pAt, long: pAg } = getPoint(dA);
    const pA = [pAt, pAg, p2[2]];
    points.unshift(pA);

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
      points.unshift(f1);

      // Do we also need a second offset?
      const p = project(start[1], start[0], pA[1], pA[0], long, lat);
      const distanceToApproach = getDistanceBetweenPoints(lat, long, p.y, p.x);
      if (abs(distanceToApproach) < offsetDistance) {
        const { lat: f2t, long: f2g } = getPointAtDistance(
          f1Lat,
          f1Long,
          offsetDistance,
          (heading + 180) % 360
        );
        f2 = [f2t, f2g, p2[2]];
        points.unshift(f2);
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
      const points = approach.points.slice();
      for (let i = 0, e = points.length - 3; i < e; i++) {
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
 * ...
 */
function setBrakes(api, percentage) {
  const value = map(percentage, 0, 100, -16383, 16383) | 0;
  api.trigger(`AXIS_LEFT_BRAKE_SET`, value);
  api.trigger(`AXIS_RIGHT_BRAKE_SET`, value);
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
  let next = elevator + correction;

  // console.log(`pitch check:`, {
  //   pitch,
  //   dPitch,
  //   targetPitch,
  //   diff,
  //   elevator,
  //   correction,
  //   next,
  // });

  api.trigger(`ELEVATOR_SET`, next | 0);
}

/**
 * ...
 */
function autoRudder(
  api,
  target,
  { onGround, lat, long, trueHeading, rudder },
  prevDiff,
  cMax = 0.05
) {
  if (!onGround) return;
  const targetHeading = getHeadingFromTo(lat, long, target.lat, target.long);
  let hDiff = getCompassDiff(trueHeading, targetHeading);
  const dHeading = hDiff - prevDiff;

  let update = 0;
  update += constrainMap(hDiff, -30, 30, -cMax / 2, cMax / 2);
  update += constrainMap(dHeading, -1, 1, -cMax, cMax);

  const newRudder = rudder / 100 + update;
  api.set(`RUDDER_POSITION`, newRudder);
  return hDiff;
}
