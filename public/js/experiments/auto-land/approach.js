import {
  getPointAtDistance,
  getDistanceBetweenPoints,
  getHeadingFromTo,
  getCompassDiff,
} from "../../utils.js";
import { Trail } from "../../trail.js";

const { sign } = Math;

// TODO: make controlled parameter
const MARGIN_DISTANCE = 3; // km

/**
 *
 * @param {*} plane
 * @param {*} icao
 * @param {*} airportCount
 * @param {*} approachDistance
 * @returns
 */
export async function getNearestApproach(
  plane,
  icao = undefined,
  airportCount = 10,
  approachDistance
) {
  const candidates = [];
  let lat, long;

  if (icao) {
    const simvar = `AIRPORT:${icao}`;
    const airport = (await plane.server.api.get(simvar))[simvar];
    candidates.push(airport);
  } else {
    // Get all nearby airports
    const { NEARBY_AIRPORTS: nearby } =
      await plane.server.api.get(`NEARBY_AIRPORTS`);

    // Reduce that to the five nearest airports, but if we're flying a flight plan,
    // nearest to the end of our flight plan. If we're not, then nearest to the plane.
    let hasWaypoints = plane.waypoints.hasWaypointLeft();
    if (hasWaypoints) {
      const { last } = plane.waypoints;
      lat = last.lat;
      long = last.long;
    }
    if (!lat && !long) {
      lat = plane.lastUpdate.lat;
      long = plane.lastUpdate.long;
    }

    const reduced = nearby
      .map((e) => {
        e.d = getDistanceBetweenPoints(lat, long, e.latitude, e.longitude);
        return e;
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, airportCount);

    for await (let airport of reduced) {
      const simvar = `AIRPORT:${airport.icao}`;
      const data = await plane.server.api.get(simvar);
      console.log(data);
      const fullAirport = data[simvar];
      fullAirport.distance = airport.d;
      candidates.push(fullAirport);
    }
  }

  candidates.forEach((airport) =>
    computeApproachCoordinates(
      lat,
      long,
      airport,
      approachDistance,
      MARGIN_DISTANCE
    )
  );

  // Sort on approach point distance, but don't pick water if we can't land on water =)
  let approaches = candidates
    .map((airport) => airport.runways.map((runway) => runway.approach))
    .flat(Infinity)
    .sort((a, b) => a.distanceToMark - b.distanceToMark);

  // remove water landings for planes that can't swim
  const { FLOATS: isFloatPlane } = plane.state.flightModel;
  if (!isFloatPlane)
    approaches = approaches.filter((e) => {
      const surface = e.runway.surface;
      return !surface.includes(`water`);
    });

  console.log(approaches);
  // approaches.forEach(drawApproach);

  const target = approaches[0];

  // drawApproach(target);

  return target;
}

/**
 *
 * @param {*} map
 * @param {*} param1
 */
export function drawApproach(map, { runway, coordinates }) {
  let approachTrail = new Trail(
    map,
    coordinates.anchor,
    `rgba(0,0,0,0.5)`,
    undefined,
    { width: 10 }
  );

  approachTrail.add(...coordinates.runwayStart);

  const { bbox } = runway;
  let runwayOutline = new Trail(map, bbox[0], `red`, undefined, { width: 2 });
  runwayOutline.add(...bbox[1]);
  runwayOutline.add(...bbox[2]);
  runwayOutline.add(...bbox[3]);
  runwayOutline.add(...bbox[0]);
}

/**
 *
 * @param {*} plane
 * @param {*} airport
 * @param {*} approachDistance
 */
function computeApproachCoordinates(
  markLat,
  markLong,
  airport,
  approachDistance
) {
  console.log(markLat, markLong);

  airport.runways.forEach((runway) => {
    const { latitude: lat, longitude: long, length, width, heading } = runway;
    runway.airport = airport;
    let args;

    // runway endpoints
    args = [lat, long, length / 2000, heading];
    const { lat: latS, long: longS } = getPointAtDistance(...args);
    args = [lat, long, length / 2000, heading + 180];
    const { lat: latE, long: longE } = getPointAtDistance(...args);

    // runway bbox
    args = [latS, longS, width / 2000, heading + 90];
    const { lat: lat1, long: long1 } = getPointAtDistance(...args);
    args = [latS, longS, width / 2000, heading - 90];
    const { lat: lat2, long: long2 } = getPointAtDistance(...args);
    args = [latE, longE, width / 2000, heading - 90];
    const { lat: lat3, long: long3 } = getPointAtDistance(...args);
    args = [latE, longE, width / 2000, heading + 90];
    const { lat: lat4, long: long4 } = getPointAtDistance(...args);

    runway.bbox = [
      [lat1, long1],
      [lat2, long2],
      [lat3, long3],
      [lat4, long4],
    ];

    runway.coordinates = [
      [latE, longE],
      [latS, longS],
    ];

    runway.approach.forEach((approach, pos) => {
      const pts = runway.coordinates[pos];
      const other = runway.coordinates[1 - pos];
      approach.heading = (heading + (1 - pos) * 180) % 360;
      args = [...pts, approachDistance, approach.heading];
      const { lat: alat, long: along } = getPointAtDistance(...args);
      const anchor = [alat, along];

      // Which side do we build our easing path on?
      const a1 = getHeadingFromTo(...anchor, ...other);
      const a2 = getHeadingFromTo(...anchor, markLat, markLong);
      const s = sign(getCompassDiff(a2, a1));

      args = [alat, along, MARGIN_DISTANCE, approach.heading + s * 90];
      const { lat: palat1, long: palong1 } = getPointAtDistance(...args);
      args = [palat1, palong1, MARGIN_DISTANCE, approach.heading + s * 180];
      const { lat: palat2, long: palong2 } = getPointAtDistance(...args);

      approach.coordinates = {
        easingPoints: [
          [palat1, palong1],
          [palat2, palong2],
        ],
        anchor,
        runwayStart: pts,
        runwayEnd: other,
      };
      approach.distanceToMark = getDistanceBetweenPoints(
        markLat,
        markLong,
        alat,
        along
      );
      approach.airport = airport;
      approach.runway = runway;
    });
  });
}

/**
 *
 * @param {*} param0
 */
export function setApproachPath(
  plane,
  { easingPoints, anchor, runwayStart, runwayEnd }
) {
  const { lat, long } = plane.lastUpdate;
  const distToAirport = getDistanceBetweenPoints(lat, long, ...runwayStart);
  const approachDistance = getDistanceBetweenPoints(...anchor, ...runwayStart);

  if (distToAirport < approachDistance - MARGIN_DISTANCE) {
    // we're on the wrong side of the approach: add some easing waypoints to get
    // us onto the approach flight plan.
    plane.server.autopilot.addWaypoint(
      easingPoints[1][0],
      easingPoints[1][1],
      undefined,
      true
    );
  }

  // Then add waypoints that mark the approach itself as part of the flight plan.
  plane.server.autopilot.addWaypoint(
    easingPoints[0][0],
    easingPoints[0][1],
    undefined,
    true
  );

  plane.server.autopilot.addWaypoint(anchor[0], anchor[1], undefined, true);
  plane.server.autopilot.addWaypoint(
    runwayEnd[0],
    runwayEnd[1],
    undefined,
    true
  );
}
