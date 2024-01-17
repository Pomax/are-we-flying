import { root } from "./constants.js";
import { win32, posix } from "node:path";

const { asin, atan2, sin, cos, PI } = Math;

export function runLater(fn, timeoutInMS, notice, preCall) {
  // Do we have a "label" to print?
  if (notice) console.log(notice);

  // Is there some initial code to run?
  if (preCall) preCall();

  // This is literally just setTimeout, but with a try/catch so
  // that if the function we're running throws an error, we
  // completely ignore that instead of crashing the server.
  setTimeout(() => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }, timeoutInMS);
}

// Get a file's path relative to the project root directory
export function rootRelative(filepath) {
  return filepath.split(win32.sep).join(posix.sep).replace(root, `./`);
}

// Check whether something "is a value"
export function exists(v) {
  return v !== undefined && v !== null;
}

export function map(v, ds, de, ts, te) {
  const d = de - ds;
  if (d === 0) return ts;
  return ts + ((v - ds) * (te - ts)) / d;
}

export function constrain(v, m, M) {
  if (m > M) return constrain(v, M, m);
  return v > M ? M : v < m ? m : v;
}

export function constrainMap(v, ds, de, ts, te) {
  return constrain(map(v, ds, de, ts, te), ts, te);
}

export function radians(deg) {
  return (deg / 180) * PI;
}

export function degrees(rad) {
  return (rad / PI) * 180;
}

export function getCompassDiff(current, target, direction = 1) {
  const diff = current > 180 ? current - 360 : current;
  target = target - diff;
  const result = target < 180 ? target : target - 360;
  if (direction > 0) return result;
  return target < 180 ? 360 - target : target - 360;
}

export function exceeds(a, b) {
  if (a < -b) return a + b;
  if (a > b) return a - b;
  return 0;
}

export function getPointAtDistance(lat1, long1, d, heading, R = 6371) {
  `
    lat: initial latitude, in degrees
    lon: initial longitude, in degrees
    d: target distance from initial in kilometers
    heading: (true) heading in degrees
    R: optional radius of sphere, defaults to mean radius of earth

    Returns new lat/lon coordinate {d}km from initial, in degrees
  `;

  lat1 = radians(lat1);
  long1 = radians(long1);
  const a = radians(heading);
  const lat2 = asin(sin(lat1) * cos(d / R) + cos(lat1) * sin(d / R) * cos(a));
  const dx = cos(d / R) - sin(lat1) * sin(lat2);
  const dy = sin(a) * sin(d / R) * cos(lat1);
  const long2 = long1 + atan2(dy, dx);
  return { lat: degrees(lat2), long: degrees(long2) };
}

export function lerp(r, a, b) {
  return r * a + (1 - r) * b;
}
