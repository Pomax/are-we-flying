import {
  getHeadingFromTo,
  getPointAtDistance,
  radians,
} from "../../utils/utils.js";

import { FEET_PER_METER, KM_PER_NM } from "../../utils/constants.js";

const { tan } = Math;

/**
 *
 * @param {*} flightInformation
 * @param {*} airport
 */
export function performAirportCalculations(flightInformation, airport) {
  airport.runways.forEach((runway) =>
    setRunwayBounds(flightInformation, runway)
  );
}

/**
 *
 * @param {*} flightInformation
 * @param {*} runway
 */
export function setRunwayBounds(flightInformation, runway) {
  const { latitude: lat, longitude: long, length, width, heading } = runway;
  let args;

  // runway endpoints
  args = [lat, long, length / 2000, heading];
  const { lat: latS, long: longS } = getPointAtDistance(...args);
  args = [lat, long, length / 2000, heading + 180];
  const { lat: latE, long: longE } = getPointAtDistance(...args);
  KM_PER_NM;
  // runway start/end coordinates
  runway.coordinates = [
    [latE, longE],
    [latS, longS],
  ];

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

  calculateRunwayApproaches(flightInformation, runway);
}

/**
 *
 * @param {*} flightInformation
 * @param {*} runway
 */
export function calculateRunwayApproaches(flightInformation, runway) {
  const { flightData } = flightInformation;
  const { alt } = flightData;

  // runway approach points
  runway.approach.forEach((approach, idx) => {
    const from = runway.coordinates[idx];
    const to = runway.coordinates[1 - idx];
    const heading = getHeadingFromTo(...from, ...to);

    // Calculate the distance based on the plane's current altitude,
    // and the runway's altitude, given a 3 degree glidelslope.

    const altDiff = alt - runway.altitude; // in feet
    const distance = tan(radians(3)) * altDiff; // in feet
    const approachDistance = distance / FEET_PER_METER / 1000; // in km

    // we want at least 8NM of approach so we can slow down enough
    const d = Math.max(approachDistance, 5 * KM_PER_NM);
    const { lat, long } = getPointAtDistance(...from, d, heading);
    approach.anchor = [lat, long];

    // and we want a "stable" 2km prior to the runway
    const d2 = Math.max(approachDistance, 2 * KM_PER_NM);
    let { lat: latm, long: longm } = getPointAtDistance(...from, d2, heading);
    approach.stable = [latm, longm];

    // calculate offsets
    const { lat: olat1, long: olong1 } = getPointAtDistance(
      lat,
      long,
      KM_PER_NM,
      heading + 90
    );
    const { lat: olat2, long: olong2 } = getPointAtDistance(
      lat,
      long,
      KM_PER_NM,
      heading - 90
    );
    approach.offsets = [
      [olat1, olong1],
      [olat2, olong2],
    ];
    const { lat: tlat1, long: tlong1 } = getPointAtDistance(
      lat,
      long,
      KM_PER_NM * 2,
      heading + 90
    );
    const { lat: tlat2, long: tlong2 } = getPointAtDistance(
      lat,
      long,
      KM_PER_NM * 2,
      heading - 90
    );
    approach.tips = [
      [tlat1, tlong1],
      [tlat2, tlong2],
    ];
  });
}
