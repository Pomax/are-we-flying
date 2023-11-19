/**
 * This is an autolanding experiment. It's browser based mostly in order not to
 * pollute the API server until I feel this is worth actually doing.
 *
 */

import {
  getDistanceBetweenPoints,
  getHeadingFromTo,
  getCompassDiff,
  constrain,
  lerp,
  map,
} from "../../utils.js";
import {
  getNearestApproach,
  drawApproach,
  setApproachPath,
} from "./approach.js";
import { pathIntersection, changeThrottle, targetThrottle } from "./compute.js";
import { Runner } from "../experiment.js";
import { BEAVER, C310R, DEFAULT } from "./parameters.js";

const { min } = Math;

// general constants
const FEET_PER_METER = 3.28084;
const KMH_PER_KNOT = 1.852;
const KMS_PER_KNOT = KMH_PER_KNOT / 3600;
const TRANSITION_TIME = 30;

// fixed airport?
const AIRPORT_ICAO = undefined; // `CYYJ`;

// How many local airports do we want to evaluate (at most)?
const NUMBER_OF_AIRPORTS = 10;

// Plane-specific parameters
let APPROACH_DISTANCE;
let LANDING_ALTITUDE_DISTANCE;
let CG_TO_GROUND;
let SAFE_THROTTLE;
let DROP_DISTANCE_KM;
let FLARE_ALTITUDE;
let FLARE_AMOUNT;
let RUDDER_FACTOR;
let INITIAL_BRAKE_VALUE;
let ROLLOUT_BRAKE_VALUE;

// Brakes run on this weird ±2^14 scale, but we like percentages better.
function brake(percentage) {
  const value = map(percentage, 0, 100, -16383, 16383) | 0;
  plane.server.api.trigger(`AXIS_LEFT_BRAKE_SET`, value);
  plane.server.api.trigger(`AXIS_RIGHT_BRAKE_SET`, value);
}

function assignParameters(plane) {
  console.log(plane);
  const title = plane.state.flightModel.TITLE.toLowerCase();
  let PARAMS = DEFAULT;
  if (title.includes(` beaver`)) PARAMS = BEAVER;
  if (title.includes(` 310`)) PARAMS = C310R;

  APPROACH_DISTANCE = PARAMS.APPROACH_DISTANCE;
  LANDING_ALTITUDE_DISTANCE = PARAMS.LANDING_ALTITUDE_DISTANCE;
  CG_TO_GROUND = PARAMS.CG_TO_GROUND;
  SAFE_THROTTLE = PARAMS.SAFE_THROTTLE;
  DROP_DISTANCE_KM = PARAMS.DROP_DISTANCE_KM;
  FLARE_ALTITUDE = PARAMS.FLARE_ALTITUDE;
  FLARE_AMOUNT = PARAMS.FLARE_AMOUNT;
  RUDDER_FACTOR = PARAMS.RUDDER_FACTOR;

  INITIAL_BRAKE_VALUE = PARAMS.INITIAL_BRAKE_PERCENTAGE;
  ROLLOUT_BRAKE_VALUE = PARAMS.ROLLOUT_BRAKE_PERCENTAGE;
}

/**
 * Our experiment
 */
export class Experiment extends Runner {
  constructor(plane) {
    super(plane);
    const ATL = document.createElement(`button`);
    const map = plane.map;
    ATL.textContent = `land`;
    ATL.title = `auto land`;
    ATL.classList.add(`ATL`);
    ATL.addEventListener(`click`, () => autoLand(this, map, plane));
    document.querySelector(`.controls`).appendChild(ATL);
  }
}

/**
 * ...docs go here...
 */
async function autoLand(runner, map, plane) {
  console.log(plane);

  assignParameters(plane);
  const { NUMBER_OF_ENGINES: engineCount } = plane.state.flightModel;

  // =============================
  // (1) Find a runway to land at
  // =============================

  const approach = await getNearestApproach(
    plane,
    AIRPORT_ICAO,
    NUMBER_OF_AIRPORTS,
    APPROACH_DISTANCE
  );

  const { airport, runway, coordinates, marking } = approach;
  const { anchor, runwayStart, runwayEnd } = coordinates;
  drawApproach(map, approach);
  console.log(approach);
  console.log(`Landing at ${airport.name}`);
  console.log(`Using runway ${marking}`);

  // helper function for setting our ALT parameter based on plane location
  const setAltitude = () => {
    const { lat, long } = plane.lastUpdate;
    const distanceToRunway = getDistanceBetweenPoints(
      lat,
      long,
      ...runwayStart
    );
    const distanceRatio =
      (distanceToRunway - LANDING_ALTITUDE_DISTANCE) /
      (APPROACH_DISTANCE - LANDING_ALTITUDE_DISTANCE);
    const alt = constrain(
      lerp(distanceRatio, landingAltitude, approachAltitude),
      landingAltitude,
      approachAltitude
    );
    plane.server.autopilot.update({ ALT: alt });
  };

  // Get the runway altitude
  const aalt = approach.airport.altitude * FEET_PER_METER;
  const cgToGround = CG_TO_GROUND;
  const runwayAltitude = aalt + cgToGround;

  // And set our various decision altitudes
  let approachAltitude = runwayAltitude + 1500;
  const landingAltitude = runwayAltitude + 200;
  const stallAltitude = runwayAltitude + 30;

  // =============================
  // (2) Get onto the glide slope
  // =============================

  console.log(`Flying towards the start of the approach.`);
  await runner.run(getOntoApproach(plane, approach, approachAltitude));
  console.log(`Approach reached`);

  // Update the approach altitude so we don't force a climb just to force a descent.
  approachAltitude = min(approachAltitude, plane.lastUpdate.alt);

  // =========================================
  // (3) Throttle down to "still safe" speeds
  // =========================================

  const pos = SAFE_THROTTLE;
  console.log(`Throttle down to ${pos}%...`);
  await runner.run(throttleTo(plane, engineCount, pos, setAltitude));
  console.log(`Done`);

  // ============================
  // (4) Get to landing distance
  // ============================

  const dropDistance = DROP_DISTANCE_KM;
  console.log(`Waiting until we get to ${dropDistance}km from the runway...`);
  await runner.run(reachRunway(plane, approach, dropDistance, setAltitude));

  // ============================================
  // (5) Set full flaps and do a stalled landing
  // ============================================

  console.log(`Dropping to`, stallAltitude);
  await runner.run(dropToRunway(plane, engineCount, cgToGround, stallAltitude));

  // =========================
  // (6) Brake to a full stop
  // =========================

  console.log("Braking...");
  await runner.run(startBraking(plane, approach, engineCount));
  await runner.run(rollOut(plane, engineCount));

  console.log(`Landing complete`);
}

/**
 *
 * @param {*} plane
 * @param {*} approach
 * @returns
 */
function getOntoApproach(plane, approach, approachAltitude) {
  setApproachPath(plane, approach.coordinates);

  plane.server.autopilot.update({
    MASTER: true,
    LVL: true,
    ALT: approachAltitude,
    ATT: true,
    TER: true,
  });

  return (done) => {
    // check if we're close enough to the approach
    const { lat, long, speed } = plane.lastUpdate;
    const transitionRadius = speed * KMS_PER_KNOT * TRANSITION_TIME;
    const glidePoint = approach.coordinates.anchor;
    const distToApproach = getDistanceBetweenPoints(lat, long, ...glidePoint);

    console.log(
      `activation radius: ${transitionRadius}, current distance: ${distToApproach}`
    );

    if (distToApproach < transitionRadius) done();
  };
}

/**
 *
 * @param {*} plane
 * @param {*} engineCount
 * @param {*} position
 * @returns
 */
function throttleTo(plane, engineCount, position, setAltitude) {
  // turn off the auto-throttle (obviously) and terrain follow if it's on
  plane.server.autopilot.update({ ATT: false, TER: false });

  // Then return the function that will keep throttling down until we reach our throttle target.
  return async (done) => {
    setAltitude();
    if ((await targetThrottle(engineCount, position)) === false) done();
  };
}

/**
 *
 * @param {*} plane
 * @param {*} param1
 * @param {*} distance
 * @returns
 */
function reachRunway(plane, { runway, coordinates }, distance, setAltitude) {
  const { runwayEnd } = coordinates;
  const length = runway.length / 1000;

  return (done) => {
    setAltitude();

    const { lat, long } = plane.lastUpdate;
    const d = getDistanceBetweenPoints(lat, long, ...runwayEnd);
    if (d < length + distance) done();
  };
}

/**
 *
 * @param {*} plane
 * @param {*} engineCount
 * @param {*} cgToGround
 * @param {*} dropAltitude
 * @returns
 */
function dropToRunway(plane, engineCount, cgToGround, dropAltitude) {
  plane.server.autopilot.update({ ALT: dropAltitude });

  console.log(`Gear down`);
  plane.server.api.trigger(`GEAR_DOWN`);

  console.log(`Full flaps`);
  plane.server.api.set(`FLAPS_HANDLE_INDEX:1`, 10);

  // flag that lets us flare, once.
  let flared = false;

  return async (done) => {
    // throttle down to a glide
    changeThrottle(engineCount, -3, 0, 100);

    // get true "how far above the ground are we"
    let { PLANE_ALT_ABOVE_GROUND_MINUS_CG: pacg } = await plane.server.api.get(
      `PLANE_ALT_ABOVE_GROUND_MINUS_CG`
    );

    const distanceToGround = pacg - cgToGround;
    if (distanceToGround < FLARE_ALTITUDE && !flared) {
      plane.server.api.set(`ELEVATOR_POSITION`, FLARE_AMOUNT);
      flared = true;
    }

    if (!plane.lastUpdate.airBorn) {
      console.log(`Turn off our autopilot, it has done its job`);
      plane.server.autopilot.update({
        MASTER: false,
      });
      done();
    }
  };
}

/**
 *
 * @param {*} plane
 * @param {*} approach
 * @returns
 */
function startBraking(plane, approach, engineCount) {
  brake(INITIAL_BRAKE_VALUE);

  return (done) => {
    const { lat, long, speed, heading: h1, trueHeading: h2 } = plane.lastUpdate;

    // keep throttling down to 0
    targetThrottle(engineCount, 0, 3);

    // auto-rudder
    const { runwayStart, runwayEnd } = approach.coordinates;
    const target = pathIntersection(
      runwayStart[1],
      runwayStart[0],
      runwayEnd[1],
      runwayEnd[0],
      long,
      lat,
      0.2
    );
    const declination = getCompassDiff(h1, h2);
    let targetHeading = getHeadingFromTo(lat, long, target.y, target.x);
    targetHeading = (targetHeading + 360 - declination) % 360;
    const headingDiff = getCompassDiff(plane.lastUpdate.heading, targetHeading);
    const diff = constrain(headingDiff, -2, 2);
    const rudder = RUDDER_FACTOR * diff;
    plane.server.api.set(`RUDDER_POSITION`, rudder);

    if (speed < 15) done();
  };
}

function rollOut(plane, engineCount) {
  console.log(`Flaps up...`);
  plane.server.api.set(`FLAPS_HANDLE_INDEX:1`, 0);

  // ease up on the brakes
  brake(ROLLOUT_BRAKE_VALUE);

  return (done) => {
    const { speed } = plane.lastUpdate;

    // keep throttling down to 0
    targetThrottle(engineCount, 0, 3);

    if (speed < 1) {
      // release brakes.
      brake(0);
      // kill engine
      plane.server.api.trigger(`ENGINE_AUTO_SHUTDOWN`);
      done();
    }
  };
}
