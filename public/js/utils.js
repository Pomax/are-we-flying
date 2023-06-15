const { sin, cos, asin, acos, tan, atan, atan2, sqrt, log, PI, max, ceil } =
  Math;
const TAU = PI * 2;

export function deg(v) {
  return (360 * v) / TAU;
}

export function rad(v) {
  return (TAU * v) / 360;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return sqrt(dx * dx + dy * dy);
}

export function getLevelColor(level, completed) {
  const h = constrainMap(level, 500, 10000, 0, 360) | 0;
  return `hsla(${h},100%,50%, ${completed ? 0.2 : 1})`;
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

export function constrainMap(v, ds, de, ts, te) {
  return constrain(map(v, ds, de, ts, te), ts, te);
}

export class Sequence {
  constructor(...values) {
    this.initialState = values[0];
    this.sequencer = {};
    for (let i = 0, e = values.length; i < e; i++) {
      this.sequencer[values[i]] = values[i + 1];
    }
    this.reset();
  }
  reset() {
    this.state = undefined;
  }
  start() {
    this.state = this.initialState;
  }
  next() {
    this.state = this.sequencer[this.state];
  }
}

export function waitFor(fn, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    (async function run() {
      if (retries > Number.MAX_SAFE_INTEGER) {
        // mostly code in place in case we need to restrict call numbers
        reject(new Error(`failed after 10 attempts`));
      }
      try {
        const data = await fn();
        if (!data) {
          retries++;
          return setTimeout(run, timeout);
        }
        resolve(data);
      } catch (e) {
        console.error(e);
      }
    })();
  });
}

// copied from src/api/autopilot/utils/utils.js

export function degrees(v) {
  return (360 * v) / TAU;
}

export function radians(v) {
  return (TAU * v) / 360;
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

export function getHeadingFromTo(lat1, long1, lat2, long2) {
  lat1 = radians(parseFloat(lat1));
  long1 = radians(parseFloat(long1));
  lat2 = radians(parseFloat(lat2));
  long2 = radians(parseFloat(long2));
  const dLon = long2 - long1;
  const x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon);
  const y = cos(lat2) * sin(dLon);
  return degrees(atan2(y, x));
}

export function projectPointOntoLine(ax, ay, bx, by, cx, cy) {
  const abx = bx - ax;
  const aby = by - ay;
  const acx = cx - ax;
  const acy = cy - ay;
  const coeff = (abx * acx + aby * acy) / (abx * abx + aby * aby);
  return {
    x: ax + abx * coeff,
    y: ay + aby * coeff,
  };
}
