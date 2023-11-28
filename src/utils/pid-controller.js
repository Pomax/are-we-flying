/**
 * Based on https://www.npmjs.com/package/node-pid-controller
 * Updated to ESM
 * Updated to default parameters
 * Updated to allow for a sliding window I to complement infinite accumulation
 */
const { abs, sign } = Math;

/**
 * A PID controller class that computers a "control" value based on a time series of inputs,
 * computed each time a new reading is provided to the controller, using parameters P, I, and D
 * and the following formula:
 *
 *   Output = currentError * P + sumError * I + currentErrorDelta * D
 *
 * In this formula, the parameters represent:
 *
 *  - currentError: the difference between the current reading and intended target
 *  - P: the "proportional" factor for how much the current error affects the output.
 *
 *  - sumError: the sum of all error values over time (the discrete error "integral")
 *  - I: the "integral" factor for how much the error sum affects the output.
 *
 *  - currentErrorDelta: the change in error with respect to the target value.
 *  - D: the "delta" or "derivative" factor for how much the change in error affects the output.
 *
 */
export class PIDController {
  /**
   * @param {*} P proportional. Defaults to 1.
   * @param {*} I accumulated error ("integral"). Defaults to 0.
   * @param {*} D derivative error. Defaults to 0.
   * @param {*} target target value. Defaults to 0. Can be updated using `.setTarget(num)`
   * @param {*} dt stepping interval. Defaults to clock-time passed between calls.
   * @param {*} maxError maximum (absolute) value for the accumulated error. Defaults to 0. Can be updated using `.setMaxError(num)`
   * @param {*} maxSamples The maximum number of updates that the error should be computed over. Can be updated using `.setMaxSamples(num)`
   */
  constructor(P = 1, I = 0, D = 0, target = 0, dt, maxError, maxSamples) {
    this.reset();
    this.setParameters(P, I, D);
    this.target = target;
    this.dt = dt;
    this.maxError = maxError;
    this.maxSamples = maxSamples;
  }

  setParameters(P = this.P, I = this.I, D = this.D) {
    this.P = P;
    this.I = I;
    this.D = D;
  }

  reset() {
    this.errors = [];
    this.sumError = 0;
    this.lastError = 0;
    this.lastTime = 0;
  }

  setTarget(target) {
    this.target = target;
  }

  setMaxError(value) {
    this.maxError = value;
  }

  setMaxSamples(count) {
    this.maxSamples = count;
  }

  /**
   * Update the controller with a new measurement
   * @param {*} value The current state of the system as represented by a single number. Defaults to the current target value.
   * @returns The value that should be set as state input to get it closest to the target.
   */
  update(value = this.target, dt = this.#getInterval()) {
    this.currentValue = value;

    // Calculate the current error value.
    const { errors, target, currentValue, maxError, maxSamples } = this;
    const currentError = target - currentValue;
    let sumError = this.sumError;
    errors.push(currentError);
    sumError += currentError * dt;
    this.lastError = currentError;

    // Is the error windowed?
    if (maxSamples) {
      while (errors.length > maxSamples) {
        sumError -= errors.shift();
      }
    }

    // Is the error capped?
    if (maxError && abs(sumError) > maxError) {
      sumError = sign(sumError) * maxError;
    }

    this.sumError = sumError;

    // calculate the PID output.
    const { P, I, D } = this;
    let currentErrorDelta = (currentError - this.lastError) / dt;
    return currentError * P + sumError * I + currentErrorDelta * D;
  }

  // Private function that calculates the time-since-last-call
  #getInterval(now = Date.now(), dt) {
    if (this.dt) {
      dt = this.dt;
    } else if (!this.lastTime) {
      this.lastTime = now;
      dt = 1;
    } else {
      dt = (now - this.lastTime) / 1000; // dt is in seconds
      this.lastTime = now;
    }
    return dt;
  }
}
