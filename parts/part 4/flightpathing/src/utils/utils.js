import { root } from "./constants.js";
import { win32, posix } from "node:path";

const { asin, atan2, sin, cos, sqrt, PI } = Math;

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

// linear interpolation using a:b ratio,
// such that r=1 is a and r=0 is b.
export function lerp(r, a, b) {
  return r * a + (1 - r) * b;
}

export function getDistanceBetweenPoints(lat1, long1, lat2, long2, R = 6371) {
  `
    https://stackoverflow.com/a/365853/740553
  `;

  lat1 = parseFloat(lat1);
  long1 = parseFloat(long1);
  lat2 = parseFloat(lat2); // do we still need parseFloat here?
  long2 = parseFloat(long2);

  const dLat = radians(lat2 - lat1);
  const dLong = radians(long2 - long1);
  lat1 = radians(lat1);
  lat2 = radians(lat2);

  const a =
    sin(dLat / 2) * sin(dLat / 2) +
    sin(dLong / 2) * sin(dLong / 2) * cos(lat1) * cos(lat2);
  const c = 2 * atan2(sqrt(a), sqrt(1 - a));
  return R * c;
}

export function getHeadingFromTo(lat1, long1, lat2, long2, declination = 0) {
  lat1 = radians(parseFloat(lat1));
  long1 = radians(parseFloat(long1));
  lat2 = radians(parseFloat(lat2));
  long2 = radians(parseFloat(long2));
  const dLon = long2 - long1;
  const x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon);
  const y = cos(lat2) * sin(dLon);
  return (degrees(atan2(y, x)) - declination + 360) % 360;
}

export function projectCircleOnLine(px, py, r, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  const A = dy ** 2 + dx ** 2;
  const A2 = 1 / (2 * A);
  const B = 2 * (-px * dx - py * dy + x1 * dx + y1 * dy);
  const C =
    px ** 2 +
    py ** 2 +
    x1 ** 2 +
    y1 ** 2 -
    2 * px * x1 -
    2 * py * y1 -
    r ** 2;
  const D = B * B - 4 * A * C;
  const t1 = (-B + sqrt(D)) * A2;
  const t2 = (-B - sqrt(D)) * A2;

  // You may have noticed that the above code is just solving the
  // quadratic formula, so t1 and/or t2 might be "nothing". If there
  // are no roots, there there's no intersection between the circle
  // and the line *segment*, only the circle and the *line*.
  if (isNaN(t1) && isNaN(t2)) {
    const cx = px - x1;
    const cy = py - y1;
    let f = constrain((dx * cx + dy * cy) / (dx ** 2 + dy ** 2), 0, 1);
    return { x: x1 + dx * f, y: y1 + dy * f };
  }

  // If we have one root, then that's going to be our solution.
  if (isNaN(t1) || t1 < t2) t1 = t2;

  // cap the intersection if we have to:
  const t = constrain(t1, 0, 1);

  // and return the actual intersection as {x,y} point
  return { x: x1 + dx * t, y: y1 + dy * t, constrained: t !== t1 };
}
