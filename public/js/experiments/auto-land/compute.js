const { abs, sqrt } = Math;

/**
 *
 * @param {*} x1
 * @param {*} y1
 * @param {*} x2
 * @param {*} y2
 * @param {*} cx
 * @param {*} cy
 * @param {*} r
 * @returns
 */
export function pathIntersection(x1, y1, x2, y2, cx, cy, r) {
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
    return { x: x1 + dx * f, y: y1 + dy * f };
  }
  if (isNaN(t1) || t1 < t2) t1 = t2;
  return f(t1, x1, y1, dx, dy);
}

/**
 *
 * @param {*} t
 * @param {*} x
 * @param {*} y
 * @param {*} dx
 * @param {*} dy
 * @returns
 */
function f(t, x, y, dx, dy) {
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return { x: x + dx * t, y: y + dy * t };
}

/**
 *
 * @param {*} engineCount
 * @param {*} byHowMuch
 * @param {*} floor
 * @param {*} ceiling
 * @param {*} pFloor
 * @param {*} pCeiling
 */
export async function changeThrottle(
  plane,
  byHowMuch,
  floor = 0,
  ceiling = 100,
  pFloor = floor,
  pCeiling = ceiling
) {
  const engineCount = plane.state.model.numberOfEngines;
  const { api } = plane.server;

  for (let count = 1; count <= engineCount; count++) {
    // change throttle
    const throttleVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:${count}`;
    const throttle = (await api.get(throttleVar))[throttleVar];
    if (
      (byHowMuch < 0 && throttle > floor - byHowMuch) ||
      (byHowMuch > 0 && throttle < ceiling - byHowMuch)
    ) {
      api.set(throttleVar, throttle + byHowMuch);
    }

    // change prop
    const propVar = `GENERAL_ENG_PROPELLER_LEVER_POSITION:${count}`;
    const prop = (await api.get(propVar))[propVar];
    if (
      (byHowMuch < 0 && prop > pFloor - byHowMuch) ||
      (byHowMuch > 0 && prop < pCeiling - byHowMuch)
    ) {
      api.set(propVar, prop + byHowMuch);
    }
  }
}

/**
 *
 * @param {*} engineCount
 * @param {*} target
 * @param {*} step
 * @returns
 */
export async function targetThrottle(plane, target, step = 1) {
  const engineCount = plane.state.model.numberOfEngines;
  const { api } = plane.server;

  let updated = false;
  for (let count = 1; count <= engineCount; count++) {
    // change throttle
    const throttleVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:${count}`;
    const throttle = (await api.get(throttleVar))[throttleVar];
    if (abs(throttle - target) >= abs(step)) {
      // console.log(`current throttle: ${throttle}, target: ${target}`);

      const diff = target - throttle;
      // console.log(`target: ${target}, current: ${throttle}, diff: ${diff}`);

      // set directly
      if (abs(diff) < abs(step)) {
        // console.log(`hard set`);
        api.set(throttleVar, target);
      }

      // inc/dec by `step`
      else {
        if (diff > 0) step = abs(step);
        if (diff < 0) step = -abs(step);
        // console.log(`step is ${step}, setting throttle to ${throttle + step}`);
        api.set(throttleVar, throttle + step);
      }
      updated = true;
    }
  }
  return updated;
}

/**
 *
 */
export class AvgWindow {
  constructor(size = 20) {
    this.__size = size;
    this.values = [];
    this.error = 0;
  }
  get size() {
    return this.values.length;
  }
  add(value) {
    const { values, __size } = this;
    values.push(value);
    while (values.length > __size) values.shift();
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
