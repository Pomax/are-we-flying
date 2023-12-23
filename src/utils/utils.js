import path from "node:path";
import { __root } from "./constants.js";

const { sin, asin, cos, acos, tan, atan, atan2, sqrt } = Math;
const TAU = Math.PI * 2;

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return sqrt(dx ** 2 + dy ** 2);
}

export function exceeds(value, limit) {
  if (value < -limit || value > limit) {
    return value - limit;
  }
  return 0;
}

export function degrees(v) {
  return (360 * v) / TAU;
}
export function radians(v) {
  return (TAU * v) / 360;
}

export function lerp(r, a, b) {
  return (1 - r) * a + r * b;
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

export function constrainMap(
  v,
  ds,
  de,
  ts,
  te,
  lowerLimit = false,
  upperLimit = false,
  lutFn = (v) => v
) {
  const val = lutFn(constrain(map(v, ds, de, ts, te), ts, te));
  if (lowerLimit === false || upperLimit === false) return val;
  if (val < lowerLimit) return val;
  if (val > upperLimit) return val;
  const mid = (lowerLimit + upperLimit) / 2;
  if (val > lowerLimit && val <= mid) return lowerLimit;
  if (val < upperLimit && val >= mid) return upperLimit;
  return val;
}

export function getCompassDiff(current, target, direction = 1) {
  const diff = current > 180 ? current - 360 : current;
  target = target - diff;
  const result = target < 180 ? target : target - 360;
  if (direction > 0) return result;
  return target < 180 ? 360 - target : target - 360;
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

export class AvgWindow {
  constructor(size = 20) {
    this.size = size;
    this.values = [];
    this.error = 0;
  }
  add(value) {
    const { values, size } = this;
    values.push(value);
    while (values.length > size) values.shift();
    const avg = this.avg();
    const { length: n } = values;
    const error = values.reduce((t, v) => t + (v - avg) ** 2, 0) / n;
    return { avg, error };
  }
  avg() {
    const { values } = this;
    const { length: n } = values;
    const avg = values.reduce((t, e) => t + e, 0) / n;
    return avg;
  }
}

// find the intersection of the plane's "bubble" and the waypoint path
function f(t, x, y, dx, dy) {
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return { x: x + dx * t, y: y + dy * t };
}

// path is (x1,y1)--(x2,y2), point to project is (cx,cy), intersection  radius is r
export function pathIntersection(x1, y1, x2, y2, cx, cy, r) {
  // console.log(x1, y1, x2, y2, cx, cy);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const c = { x: cx, y: cy, r };

  const A = dy ** 2 + dx ** 2;
  const B = 2 * (-c.x * dx - c.y * dy + x1 * dx + y1 * dy);
  const C =
    c.x ** 2 +
    c.y ** 2 +
    x1 ** 2 +
    y1 ** 2 -
    2 * c.x * x1 -
    2 * c.y * y1 -
    c.r ** 2;
  const D = B * B - 4 * A * C;

  const t1 = (-B + sqrt(D)) / (2 * A);
  const t2 = (-B - sqrt(D)) / (2 * A);

  if (isNaN(t1) && isNaN(t2)) {
    const cx = c.x - x1;
    const cy = c.y - y1;
    let f = (dx * cx + dy * cy) / (dx * dx + dy * dy);
    if (f < 0) f = 0;
    if (f > 1) f = 1;
    // console.log(`f:`, f);
    return { x: x1 + dx * f, y: y1 + dy * f };
  }
  if (isNaN(t1) || t1 < t2) t1 = t2;
  // console.log(`t1:`, t1);
  return f(t1, x1, y1, dx, dy);
}

export function nf(v) {
  if (v === undefined) return `---`;
  return (v < 0 ? `` : ` `) + v.toFixed(5);
}

export function exists(v) {
  return v !== undefined && v !== null;
}

export function rootRelative(filepath) {
  return filepath
    .split(path.win32.sep)
    .join(path.posix.sep)
    .replace(__root, `./`);
}

/**
 * Given a line p1--p2 and a point P,
 * get the intersection "nearest to" p2
 * of that line and a circle around P
 * with the specified radius
 * @param {point} P
 * @param {point} p1
 * @param {point} p2
 * @param {number in feet} r
 * @returns
 */
export function getLineCircleIntersection(
  { x, y },
  { x: x1, y: y1 },
  { x: x2, y: y2 },
  r
) {
  // work relative to (0,0)
  x1 -= x;
  y1 -= y;
  x2 -= x;
  y2 -= y;
  const dy = y2 - y1;
  const dx = x2 - x1;
  const m = (dx * dx + dy * dy) ** 0.5;
  const A = x1 * y2 - x2 * y1;
  const d = (r * r * m * m - A * A) ** 0.5;
  return {
    x: x + (d * dx + A * dy) / (m * m),
    y: y + (d * dy - A * dx) / (m * m),
  };
}

export function runLater(fn, timeoutInMillis) {
  setTimeout(() => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }, timeoutInMillis);
}
