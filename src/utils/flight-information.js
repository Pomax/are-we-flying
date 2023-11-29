import { MSFS_API } from "msfs-simconnect-api-wrapper";
import {
  BOOLEAN_VALUES,
  DEGREE_VALUES,
  DERIVATIVES,
  FLIGHT_DATA,
  FLIGHT_MODEL,
  FPM_VALUES,
  KNOT_VALUES,
  NAME_MAPPING,
  PERCENT_VALUES,
  SECOND_DERIVATIVES,
} from "./flight-values.js";
import { FPS_IN_KNOTS } from "./constants.js";
import { exists } from "./utils.js";

/**
 *
 *  Adds two custom flight data properties:
 *
 *   - ENGINES_RUNNING: bool
 *   - POWERED_UP: bool
 *
 */
export class FlightInformation {
  /**
   * ...docs go here...
   * @param {MSFS_API} api
   */
  constructor(api) {
    this.api = api;
    this.reset();
  }

  /**
   * ...docs go here...
   */
  reset() {
    this.model = false;
    this.data = false;
  }

  /**
   * ...docs go here...
   */
  async update() {
    try {
      const [flightModel, flightData] = await Promise.all([
        this.updateModel(),
        this.updateFlight(),
      ]);
      console.log(`bootstrapped flight information`);
      return { flightModel, flightData };
    } catch (e) {
      console.warn(e);
    }
  }

  /**
   * ...docs go here...
   */
  async updateModel() {
    const modelData = await this.api.get(...FLIGHT_MODEL);
    if (!modelData) {
      return (this.model = false);
    }
    this.convertValues(modelData);
    this.rebindData(modelData);

    // Create a convenience value for trimming
    modelData.pitchTrimLimit = [
      modelData.trimUpLimit ?? 10,
      modelData.trimDownLimit ?? -10,
    ];

    return (this.model = modelData);
  }

  /**
   * ...docs go here...
   */
  async updateFlight() {
    const flightData = await this.api.get(...FLIGHT_DATA);
    if (!flightData) return (this.data = false);

    this.convertValues(flightData);

    // Create a convenience value for "are any engines running?"
    flightData.ENGINES_RUNNING = [1, 2, 3, 4].reduce(
      (t, num) => t || flightData[`ENG_COMBUSTION:${num}`],
      false
    );

    // Create a convenience value for "is the plane powered on?"
    flightData.POWERED_UP = flightData.ELECTRICAL_TOTAL_LOAD_AMPS !== 0;

    this.rebindData(flightData, this.data);

    // Create a convenience value for compass correction:
    flightData.declination = flightData.trueHeading - flightData.heading;

    return (this.data = flightData);
  }

  /**
   * ...
   * @param {*} data
   */
  convertValues(data) {
    // Convert values to the units they're supposed to be:
    BOOLEAN_VALUES.forEach((p) =>
      exists(data[p]) ? (data[p] = !!data[p]) : ``
    );
    DEGREE_VALUES.forEach((p) =>
      exists(data[p]) ? (data[p] *= 180 / Math.PI) : ``
    );
    PERCENT_VALUES.forEach((p) => (exists(data[p]) ? (data[p] *= 100) : ``));
    FPM_VALUES.forEach((p) => (exists(data[p]) ? (data[p] *= 60) : ``));
    KNOT_VALUES.forEach((p) =>
      exists(data[p]) ? (data[p] *= FPS_IN_KNOTS) : ``
    );
  }

  /**
   * ...
   * @param {*} data
   * @param {*} withDelta
   */
  rebindData(data, previousValues) {
    // Whether or not we have previous values for delta computation,
    // just preallocate the values we _might_ need for that.
    const delta = {};
    const before = this.data.__datetime;
    const now = Date.now();
    const dt = (now - before) / 1000; // delta per second seconds

    // Then copy all of that data to remapped names so we don't need to
    // ever work with ALL_CAPS_SIMVAR_NAMES. Any information the client
    // needs to "normally" work with should have normal JS varnames.
    // At the same time, compute deltas for anything that has a JS name
    // and is a numeric type (and isn't in the FIXED_PROPERTIES list).
    Object.entries(data).forEach(([simName, value]) => {
      const jsName = NAME_MAPPING[simName];
      data[jsName] = value;

      // Do we need to compute derivatives?
      if (previousValues && DERIVATIVES.includes(jsName)) {
        const previous = previousValues[jsName];
        if (typeof previous !== `number`) return;
        const current = data[jsName];
        delta[jsName] = (current - previous) / dt;

        // ...do we need to compute *second* derivatives?
        if (SECOND_DERIVATIVES.includes(jsName)) {
          delta.delta ??= {};
          const previousDelta = previousValues.delta?.[jsName] ?? 0;
          delta.delta[jsName] = delta[jsName] - previousDelta;
        }
      }
    });

    // If we did delta computation work, save the result:
    if (previousValues) {
      data.__datetime = now;
      data.delta = delta;
    }
  }
}
