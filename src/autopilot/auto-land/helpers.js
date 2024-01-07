import {
  constrainMap,
  getHeadingFromTo,
  getPointAtDistance,
  radians,
} from "../../utils/utils.js";

import { FEET_PER_METER, KM_PER_NM } from "../../utils/constants.js";

const { sign, tan } = Math;

/**
 *
 * @param {*} flightInformation
 * @param {*} airport
 */
export function performAirportCalculations(flightInformation, airport) {
  airport.runways.forEach((runway) =>
    calculateRunwayApproaches(flightInformation, runway)
  );
}

/**
 *
 * @param {*} flightInformation
 * @param {*} runway
 */
export function calculateRunwayApproaches(flightInformation, runway) {
  const { flightData } = flightInformation;
  const { alt } = flightData;
  const { start, end, altitude } = runway;

  // runway approach points
  runway.approach.forEach((approach, idx) => {
    const from = idx === 1 ? start : end;
    const to = idx === 1 ? end : start;
    const heading = approach.heading;

    // Calculate the distance based on the plane's current altitude,
    // and the runway's altitude, given a 3 degree glidelslope.

    const altDiff = alt - altitude; // in feet
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
      heading
    );
    const { lat: olat3, long: olong3 } = getPointAtDistance(
      lat,
      long,
      KM_PER_NM,
      heading - 90
    );

    approach.offsets = [
      [olat1, olong1],
      [olat2, olong2],
      [olat3, olong3],
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
      heading
    );
    const { lat: tlat3, long: tlong3 } = getPointAtDistance(
      lat,
      long,
      KM_PER_NM * 2,
      heading - 90
    );

    approach.tips = [
      [tlat1, tlong1],
      [tlat2, tlong2],
      [tlat3, tlong3],
    ];
  });
}

/**
 * A utility function for targeting a specific pitch, which is pretty important during the actual landing itself
 * @param {*} api
 * @param {*} targetPitch
 * @param {*} flightInformation
 */
export async function setPitch(api, targetPitch, data) {
  const { pitch, dPitch } = data;
  let { elevator } = data;
  elevator = -(elevator / 100) * 2 ** 14;
  const diff = targetPitch - pitch;
  let correction = constrainMap(diff, -2, 2, -300, 300);
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
  await api.trigger(`ELEVATOR_SET`, next | 0);
}
