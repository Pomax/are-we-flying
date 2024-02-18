import {
  getHeadingFromTo,
  getDistanceBetweenPoints,
  getPointAtDistance,
  getCompassDiff,
  constrainMap,
  project,
  map,
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
} from "../utils/constants.js";
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

const { abs, sign, min } = Math;
let prev_hDiff = 0;

const GETTING_ONTO_GLIDE_SLOPE = `GETTING_ONTO_GLIDE_SLOPE`;
const THROTTLE_TO_CLIMB_SPEED = `THROTTLE_TO_CLIMB_SPEED`;
const FLYING_THE_GLIDE_SLOPE = `FLYING_THE_GLIDE_SLOPE`;
const GET_TO_RUNWAY = `GET_TO_RUNWAY`;
const DROPPING_ONTO_RUNWAY = `DROPPING_ONTO_RUNWAY`;
const LANDING_ON_RUNWAY = `LANDING_ON_RUNWAY`;
const ROLLING_AND_BRAKING = `ROLLING_AND_BRAKING`;
const END_OF_LANDING = `END_OF_LANDING`;

const LANDING_STEPS = [
  GETTING_ONTO_GLIDE_SLOPE,
  THROTTLE_TO_CLIMB_SPEED,
  FLYING_THE_GLIDE_SLOPE,
  GET_TO_RUNWAY,
  DROPPING_ONTO_RUNWAY,
  LANDING_ON_RUNWAY,
  ROLLING_AND_BRAKING,
  END_OF_LANDING,
];

// We'll define a simple sequencer that we can use
// to step through the various stgages of our landing.
class Sequence {
  constructor(api) {
    this.api = api;
    this.reset();
  }
  reset(steps = LANDING_STEPS) {
    this.step = false;
    this.steps = steps.slice();
    this.nextStage();
  }

  nextStage() {
    this.step = this.steps.shift();
    return this.step;
  }
}

// And our autolanding class. Which does nothing yet =)
export class AutoLanding {
  constructor(autopilot, lat, long, flightModel) {
    console.log(`autolanding:`, lat, long);
    this.autopilot = autopilot;
    this.reset();

    // Do we already have a landing mapped?
    this.approachData = autopilot.waypoints.getLanding();
    if (this.approachData) return;

    // If not, find a nearby approach:
    const { vs1, cruiseSpeed, isFloatPlane } = flightModel;
    const approachData = (this.approachData = this.determineLanding(
      lat,
      long,
      vs1,
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

  reset() {
    prev_hDiff = 0;
    this.running = true;
    this.stage = new Sequence(this.autopilot);
  }

  determineLanding(lat, long, vs1, cruiseSpeed, waterLanding) {
    // Get the shortlist of 10 airports near us that we can land at.
    const shortList = airports
      .filter((a) => {
        if (waterLanding) return a; // float planes *can* land on real runways
        else
          return a.runways.some((r) => r.surface.includes(`water`) === false);
      })
      .map((a) => {
        a.distance = getDistanceBetweenPoints(
          lat,
          long,
          a.latitude,
          a.longitude
        );
        return a;
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);

    // Then for each of these airports, determine their approach(es) or rule them out.
    shortList.forEach((airport) => {
      airport.runways.forEach((runway) => {
        this.calculateRunwayApproaches(
          lat,
          long,
          vs1,
          cruiseSpeed,
          airport,
          runway
        );
      });
    });

    // Then figure out which approach will be our best/safest option
    const approachData = this.findAndBindApproach(shortList);

    // If that's none of them: sucks to be us! O_O
    if (!approachData) {
      console.error(`There is nowhere to land!`);
      return false;
    }

    // Otherwise, this is the approach we'll be flying.
    return approachData;
  }

  calculateRunwayApproaches(lat, long, vs1, cruiseSpeed, airport, runway) {
    const { start, end } = runway;

    runway.approach.forEach((approach, idx) => {
      // first, let's assume this approach will work.
      approach.works = true;

      /*
        We're modelling the approach in stages:

                                                        _______________
                                                __,..-'' ╎     ╎     ╎
                                        __,..-''         ╎     ╎     ╎
                                __,..-''                 ╎     ╎     ╎
          ________________,..-''                         ╎     ╎     ╎
          ─o5────o4─────o3──────────────────────────────o2────o1─────A─

        In this:

          A = a waypoint in-line with the approach so that by the time we get to o1, we're flying straight.
          o1--o2 = slow down from cruise to vs1 + 20.
          o2--o3 = glide to runway + 100.
          o3--o4 = glide to runway + 20.
          o4--o5 = touch down on runway.

        We assign the following properties to each track:

          o1--o2 = flight alt, 2 minutes of flight at cruiseSpeed.
          o2--o3 = flight alt -> ground alt + 100, 5 minutes of flight at vs1 + 20.
          o3--o4 = ground alt + 100 -> ground alt + 20, lerp(vs1, 50, 100, 0, 1) km from runway.
          o4--o5 = alt: ground. dist: however long we need to brake.

        And the following behaviour:

          A  = disable terrain follow.
          o1 = set ATT to vs1 + 20.
          o2 = initiate rolling ALT.

            during o2--o3, if we're at "safe to gear" speed, drop gear.
            during o2--o3, if we're at "safe to work flaps" speed, 1 notch of flaps.

          o3 = initiate slow rolling ALT.
          o4 = cut the engines (or set in reverse) and start braking.
          o5 = engines off and abandon the plane on the runway. that's someone else's problem now.
      */

      // let's calculate those distances
      const d12 = (1 * (cruiseSpeed * KM_PER_NM)) / 60;
      const glideSpeed = vs1 + 20;
      const d23 = (3 * (glideSpeed * KM_PER_NM)) / 60;
      const d34 = constrainMap(vs1, 50, 100, 0.05, 1);

      // console.log({ vs1, cruiseSpeed, d12, d23, d34 });

      // and then calculate how far out approach points are.
      const t = idx === 0 ? start : end; // where do we touch down?
      const e = idx === 0 ? end : start; // and where does it end?
      const heading = getHeadingFromTo(e[0], e[1], t[0], t[1]);

      const d1 = d12 + d23 + d34;
      const d2 = d23 + d34;
      const d3 = d34;

      // console.log({ d1, d2, d3 });

      // Calculate our A coordinate
      const dA = d1 + 2;
      const { lat: pAt, long: pAg } = getPointAtDistance(
        t[0],
        t[1],
        dA,
        heading
      );
      const pA = [pAt, pAg];

      // Is this approach even possible given a standard 3 deg (5.25%) glide slope?
      const alt23 = d23 * 0.0525 * 1000 * FEET_PER_METER;
      const terrainAlt = alos.lookup(pAt, pAg) * FEET_PER_METER;
      if (terrainAlt > alt23) {
        console.log({ "it's": "no good", alt23, terrainAlt });
        return (approach.works = false);
      }

      // It might be: let's keep going.
      const { lat: p1t, long: p1g } = getPointAtDistance(
        t[0],
        t[1],
        d1,
        heading
      );
      const p1 = [p1t, p1g];

      const { lat: p2t, long: p2g } = getPointAtDistance(
        t[0],
        t[1],
        d2,
        heading
      );
      const p2 = [p2t, p2g];

      const { lat: p3t, long: p3g } = getPointAtDistance(
        t[0],
        t[1],
        d3,
        heading
      );
      const p3 = [p3t, p3g];

      const p4 = t;
      const p5 = e;

      /*
        Let's also look at the approach from above: if the plane is to the "right" of A (with respect
        to the approach heading) then we don't need offset points, and the plane can simply target
        A as a waypoint. If the plane is to the "left" of A, we'll need at least one offset point,
        either above or below A depending on the position of the plane. If the plane is above the top
        f1, or below the bottom f1, we don't need additional points, but if the plane is somewhere
        between f1 and the approach, we need a second offset f2 tho make sure the plane can turn onto
        the approach correctly.

          ╎                                            (f2?)╸╸╸╸╸╸(f1?)
          ╎                                                         ╏
          ╎                                                         ╏
          o5────o4─────o3──────────────────────────────o2────o1─────A
          ╎                                                         ╏
          ╎                                                         ╏
          ╎                                            (f2?)╸╸╸╸╸╸(f1?)
      */

      // Use a nice and safe 60 second turn distance.
      const offsetDistance = (cruiseSpeed * KM_PER_NM) / 60;
      const aHeading = getHeadingFromTo(pAt, pAg, lat, long);
      const hDiff = getCompassDiff(heading, aHeading);
      let f1, f2;

      // Do we need to set up f1?
      if (hDiff < -90 || hDiff > 90) {
        const sgn = sign(hDiff);
        const { lat: f1t, long: f1g } = getPointAtDistance(
          pAt,
          pAg,
          offsetDistance,
          heading + sgn * 90
        );
        f1 = [f1t, f1g];
        // Do we also need to set up f2?
        const p = project(t[1], t[0], e[1], e[0], long, lat);
        const rd = getDistanceBetweenPoints(lat, long, p.y, p.x);
        if (airport.icao === `CYYJ`) {
          console.log({ p, rd });
        }
        if (abs(rd) < offsetDistance) {
          const { lat: f2t, long: f2g } = getPointAtDistance(
            f1t,
            f1g,
            offsetDistance,
            (heading + 180) % 360
          );
          f2 = [f2t, f2g];
        }
      }

      // Then, set up the altitudes we'd *like* to fly:
      const approachAlt = alt23 | 0;
      if (f2) f2[2] = approachAlt;
      if (f1) f1[2] = approachAlt;
      pA[2] = approachAlt;
      p1[2] = approachAlt;
      p2[2] = approachAlt;
      p3[2] = (alos.lookup(p3[0], p3[1]) * FEET_PER_METER + 100) | 0;
      p4[2] = t[2] + 20;
      p5[2] = e[2];

      // Then verify that f2--f1, f1--A, and A--p2 have no terrain
      // in between the points:
      if (f2 && this.isObstructed(f1, f2)) return (approach.works = false);
      if (f1 && this.isObstructed(f1, pA)) return (approach.works = false);
      if (this.isObstructed(pA, p2)) return (approach.works = false);
      if (this.isObstructed(p2, p3)) return (approach.works = false);

      // At this point we know the approach is good, and we record
      // the distance to the reference coordinate so we can find the
      // closest approach.
      approach.points = [p5, p4, p3, p2, p1, pA];
      if (f1) approach.points.push(f1);
      if (f2) approach.points.push(f2);
      approach.target = f2 ? f2 : f1 ? f1 : pA;
      approach.distance = getDistanceBetweenPoints(
        lat,
        long,
        approach.target[0],
        approach.target[1]
      );
    });
  }

  /**
   * Check whether there is terrain obstruction between
   * these two points, given their relative altitudes.
   */
  isObstructed(p1, p2) {
    return alos.isObstructed(p1, p2);
  }

  /**
   * Find the airport, runway, and approach for which the distance
   * to our reference point was the shortest.
   */
  findAndBindApproach(airports) {
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

    flatList.sort((a, b) => b.runway.length - a.runway.length);
    const result = flatList[0];
    console.log(result);
    return result;
  }

  /**
   * ...
   */
  async run(flightInformation) {
    if (!this.running) return;
    if (!flightInformation) return;
    const { model: flightModel, data: flightData } = flightInformation;
    if (!flightModel || !flightData) return;
    const { vs0, climbSpeed, engineCount, isTailDragger } = flightModel;
    const { altAboveGround, speed, onGround, lat, long, alt } = flightData;

    const { approachData, autopilot, stage } = this;
    const { points } = approachData.approach;
    const [p5, p4, p3, p2, p1, pA, f1, f2] = points;
    const { api, waypoints } = autopilot;
    const { currentWaypoint: target } = waypoints;
    const { step } = stage;

    if (step === GETTING_ONTO_GLIDE_SLOPE) {
      console.log(step, target.id, pA.id, p1.id);
      if ((f2 && target === f2) || (f1 && target === f1)) {
        autopilot.setParameters({
          [TERRAIN_FOLLOW]: false,
          [ALTITUDE_HOLD]: p2.alt,
        });
      }
      if (target === pA || target === p1) {
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
        autopilot.setParameters({ [ALTITUDE_HOLD]: p3.alt });
        stage.nextStage();
      }
    }

    if (step === FLYING_THE_GLIDE_SLOPE) {
      console.log(step, target.id, p4.id);
      // Ease the plane down the glide slope
      const d1 = getDistanceBetweenPoints(lat, long, p3.lat, p3.long);
      const d2 = getDistanceBetweenPoints(p2.lat, p2.long, p3.lat, p3.long);
      const lerpAlt = constrainMap(d1 / d2, 0, 1, p3.alt, p2.alt);
      autopilot.setParameters({ [ALTITUDE_HOLD]: min(alt, lerpAlt) });
      if (target === p3) {
        autopilot.setParameters({
          [ALTITUDE_HOLD]: p4.alt,
          [AUTO_THROTTLE]: climbSpeed - 10,
        });
        stage.nextStage();
      }
    }

    if (step === GET_TO_RUNWAY) {
      console.log(step);
      if (altAboveGround < 10) {
        // cut the engines
        autopilot.setParameters({ [AUTO_THROTTLE]: false });
        for (let i = 1; i <= engineCount; i++) {
          await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
        }
        stage.nextStage();
      }
    }

    if (step === DROPPING_ONTO_RUNWAY) {
      console.log(step);
      if (altAboveGround < 10) {
        // do we even bother with a flare?
        stage.nextStage();
      }
    }

    if (step === LANDING_ON_RUNWAY) {
      console.log(step);
      // prevent peripherals from interfering
      for (let i = 1; i <= engineCount; i++) {
        await api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }

      if (onGround) {
        autopilot.setParameters({
          [LEVEL_FLIGHT]: false,
          [HEADING_MODE]: false,
          [ALTITUDE_HOLD]: false,
        });

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
        this.brake = 0;
        stage.nextStage();
      }
    }

    if (step === ROLLING_AND_BRAKING) {
      console.log(step);

      // Stay on the runway...
      autoRudder(api, p5, flightData);

      // increase brakes while we're rolling
      console.log(`Rolling and braking: ${this.brake}% brakes`);
      this.brake = Math.min(this.brake + 5, isTailDragger ? 70 : 100);
      setBrakes(api, this.brake);

      if (isTailDragger && this.brake > 50) {
        // and pull back on the elevator if we're in a for tail
        // draggers so that we don't end up in a nose-over.
        const elevator = constrainMap(this.brake, 0, 100, 0, -4000) | 0;
        api.trigger(`ELEVATOR_SET`, elevator);
      }

      if (speed < vs0 && !isTailDragger) {
        console.log(`Full flaps to aid in braking`);
        for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 10);
      }

      if (speed < 5) stage.nextStage();
    }

    if (step === END_OF_LANDING) {
      console.log(step);
      setBrakes(api, 0);
      api.trigger(`PARKING_BRAKES`);
      for (let i = 1; i <= engineCount; i++) {
        api.set(`GENERAL_ENG_THROTTLE_LEVER_POSITION:${i}`, 0);
      }
      for (let i = 0; i < 10; i++) api.set(`FLAPS_HANDLE_INDEX:1`, 0);
      api.trigger(`SPOILERS_OFF`);
      api.trigger(`ENGINE_AUTO_SHUTDOWN`);
      this.running = false;
    }
  }
}

function setBrakes(api, percentage) {
  const value = map(percentage, 0, 100, -16383, 16383) | 0;
  api.trigger(`AXIS_LEFT_BRAKE_SET`, value);
  api.trigger(`AXIS_RIGHT_BRAKE_SET`, value);
}

function autoRudder(api, target, { onGround, lat, long, trueHeading, rudder }) {
  if (!onGround) return;
  const targetHeading = getHeadingFromTo(lat, long, target.lat, target.long);
  let hDiff = getCompassDiff(trueHeading, targetHeading);
  const dHeading = hDiff - prev_hDiff;
  prev_hDiff = hDiff;

  let update = 0;
  const cMax = 0.01;
  update += constrainMap(hDiff, -30, 30, -cMax / 2, cMax / 2);
  update += constrainMap(dHeading, -1, 1, -cMax, cMax);

  const newRudder = rudder / 100 + update;
  api.set(`RUDDER_POSITION`, newRudder);
}
