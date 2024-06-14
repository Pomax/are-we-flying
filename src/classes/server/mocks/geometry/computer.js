export const roll = Symbol(`roll`);
export const pitch = Symbol(`pitch`);
export const yaw = Symbol(`yaw`);

const knots_in_feet_per_s = 1.68781;
const knots_in_kph = 1.852;
const ms_per_s = 1000;
const s_per_hour = 3600;

import { degrees, radians } from "../../../../utils/utils.js";
const { sign, sin, cos, asin, atan2 } = Math;

// 3D matrix * 3D vector function
function mul3(M, [x, y, z]) {
  return [
    M[0] * x + M[1] * y + M[2] * z,
    M[3] * x + M[4] * y + M[5] * z,
    M[6] * x + M[7] * y + M[8] * z,
  ];
}

function getPointAtDistance(lat, long1, km, heading, R = 6371) {
  lat = radians(lat);
  long1 = radians(long1);
  const a = radians(heading);
  const lat2 = asin(sin(lat) * cos(km / R) + cos(lat) * sin(km / R) * cos(a));
  const dx = cos(km / R) - sin(lat) * sin(lat2);
  const dy = sin(a) * sin(km / R) * cos(lat);
  const long2 = long1 + atan2(dy, dx);
  return [degrees(lat2), degrees(long2)];
}

export class Computer {
  lastCall = null;

  localFrame = {
    [roll]: [1, 0, 0],
    [pitch]: [0, 1, 0],
    [yaw]: [0, 0, 1],
  };

  plane = {
    localFrame,
    lat: 48.75499698, // Duncan
    long: -123.7166638,
    elevation: 2500, // feet
    speed: 100, // knots
    vs: 0, // feet per minute
    heading: 0, // degrees
    bankAngle: 0, // degrees
    turnRate: 0, // degrees per second
  };

  init({ lat, long, elevation, speed, heading }) {
    const { plane } = this;
    plane.lat = lat;
    plane.long = long;
    plane.elevation = elevation;
    plane.speed = speed;
    plane.heading = heading;
  }

  control({ elevator, aileron, rudder }) {
    const asAngle = (v) => map(v, -(2 ** 14), 2 ** 14, -0.3, 0.3);
    updateLocalFrame(roll, asAngle(aileron));
    updateLocalFrame(pitch, asAngle(elevator));
    updateLocalFrame(yaw, asAngle(rudder));
  }

  update(frameDelta = null) {
    // track call times
    frameDelta ??= Date.now() - (this.lastCall ?? Date.now() - 1);
    const interval_s = frameDelta / ms_per_s;
    const interval_h = interval_s / s_per_hour;

    // then update position, momentum, and orientation.
    const { plane } = this;
    const { speed } = plane;
    const [x, y, z] = this.localFrame[roll];
    const vs_per_s = speed * z * knots_in_feet_per_s;

    plane.speed = (speed ** 2 - sign(vs) * vs_per_s ** 2) ** 0.5;
    plane.vs = vs_per_s * 60;

    const heading = (90 + degrees(atan2(y, x)) + 360) % 360;
    const turnRate = (heading - plane.heading) * interval_s;

    plane.heading = heading;
    plane.bankAngle = degrees(asin(this.localFrame[pitch][2]));
    plane.turnRate = turnRate;

    const km = plane.speed * knots_in_kph * interval_h;
    const pos = getPointAtDistance(lat, long, km, heading);

    plane.lat = pos[0];
    plane.long = pos[1];
    plane.elevation += vs_per_s * interval_s;

    // Effect something akin to an ICAO "standard turn"
    // with a 25 degrees bank being roughly a 3 deg/s turn.
    this.applyGlobalYaw((bankAngle / 10) * interval_s);

    // track call times
    this.lastCall = Date.now();
    return plane;
  }

  applyGlobalYaw(deg) {
    const angle = radians(deg);

    // apply global yaw to our local frame
    const sa = sin(angle);
    const ca = cos(angle);

    // prettier-ignore
    transformLocalFrame([
        ca, sa, 0,
      -sa, ca, 0,
        0,  0, 1
    ]);
  }

  updateLocalFrame(axis, angle) {
    const pv = this.localFrame[axis];

    // safety normalization:
    const m = pv.reduce((t, e) => t + e ** 2, 0) ** 0.5;
    pv.forEach((v, i, pv) => (pv[i] = v / m));

    // precompute more-than-once values
    const [x, y, z] = pv;
    const sa = sin(angle);
    const ca = cos(angle);
    const mc = 1 - ca;
    const xsa = x * sa;
    const ysa = y * sa;
    const zsa = z * sa;
    const xmc = x * mc;
    const ymc = y * mc;
    const zmc = z * mc;

    // Form the "rotate over arbitrary axis" matrix.
    // prettier-ignore
    const Q = [
      x * xmc + ca,  x * ymc - zsa, x * zmc + ysa,
      y * xmc + zsa, y * ymc + ca,  y * zmc - xsa,
      z * xmc - ysa, z * ymc + xsa, z * zmc + ca,
    ];

    // Then apply
    transformLocalFrame(Q);
  }

  transformLocalFrame(Q) {
    // Then apply
    const { localFrame } = this;
    localFrame.roll = mul3(Q, localFrame.roll);
    localFrame.pitch = mul3(Q, localFrame.pitch);
    localFrame.yaw = mul3(Q, localFrame.yaw);
  }
}
