import { MSFS_API } from "msfs-simconnect-api-wrapper";
import {
  BOOLEAN_VALUES,
  DEGREE_VALUES,
  DERIVATIVES,
  FLIGHT_DATA,
  FLIGHT_MODEL,
  FPM_VALUES,
  KNOT_VALUES,
  MTF_VALUES,
  NAME_MAPPING,
  PERCENT_VALUES,
  SECOND_DERIVATIVES,
  ENGINE_TYPES,
} from "./flight-values.js";
import { FEET_PER_DEGREE, FEET_PER_METER, FPS_IN_KNOTS } from "./constants.js";
import { exists } from "./utils.js";

const noop = () => {};

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
    this.flightModel = false;
    this.flightData = false;
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
      return (this.flightModel = false);
    }
    this.convertValues(modelData);
    this.rebindData(modelData);

    // Create a convenience value for trimming
    modelData.pitchTrimLimit = [
      modelData.trimUpLimit ?? 10,
      modelData.trimDownLimit ?? -10,
    ];

    // Check whether this plane has shitty trimming
    this.checkTrimCapability(modelData);

    return (this.flightModel = modelData);
  }

  /**
   * Some planes need different trimming mechanism.
   *
   * FIXME: it would be wonderful if we could determine this
   * without needing to hardcode lists of planes...
   */
  checkTrimCapability(data) {
    // Nothing like immediately diving into a turn on takeoff...
    const noAileronTrim = [
      `ae145`,
      `ae45`,
      `fox`,
      `kodiak 100`,
      `pa28`,
      `zenith 701`,
    ].some((fragment) => data.title.toLowerCase().includes(fragment));
    if (noAileronTrim) data.noAileronTrim = true;

    // Mostly fighter jets, which may technically have trim,
    // but you're not going to fly with it.
    const noElevatorTrim = [`super hornet`, `vertigo`].some((fragment) =>
      data.title.toLowerCase().includes(fragment)
    );
    if (noElevatorTrim) data.noElevatorTrim = true;

    // Zooooom! Which means that we need to use drastically smaller steps
    // for both the wing leveler and the altitude hold corrections.
    const forAcrobatics = [
      `gee bee r3`,
      `super hornet`,
      `vertigo`,
      `l-39`,
    ].some((fragment) => data.title.toLowerCase().includes(fragment));
    if (forAcrobatics) data.isAcrobatic = true;
  }

  /**
   * ...docs go here...
   */
  async updateFlight() {
    const flightData = await this.api.get(...FLIGHT_DATA);
    if (!flightData) return (this.flightData = false);

    this.convertValues(flightData);

    // Create a convenience value for "are any engines running?"
    flightData.ENGINES_RUNNING = [1, 2, 3, 4].reduce(
      (t, num) => t || flightData[`ENG_COMBUSTION:${num}`],
      false
    );

    // Create a convenience value for "is the plane powered on?"
    flightData.POWERED_UP = flightData.ELECTRICAL_TOTAL_LOAD_AMPS !== 0;

    this.rebindData(flightData, this.flightData);

    // Create a convenience value for compass correction:
    flightData.declination = flightData.trueHeading - flightData.heading;

    return (this.flightData = flightData);
  }

  /**
   * ...
   * @param {*} data
   */
  convertValues(data) {
    // Convert values to the units they're supposed to be:
    BOOLEAN_VALUES.forEach((p) =>
      exists(data[p]) ? (data[p] = !!data[p]) : noop
    );
    DEGREE_VALUES.forEach((p) =>
      exists(data[p]) ? (data[p] *= 180 / Math.PI) : noop
    );
    PERCENT_VALUES.forEach((p) => (exists(data[p]) ? (data[p] *= 100) : noop));
    FPM_VALUES.forEach((p) => (exists(data[p]) ? (data[p] *= 60) : noop));
    KNOT_VALUES.forEach((p) =>
      exists(data[p]) ? (data[p] *= FPS_IN_KNOTS) : noop
    );
    MTF_VALUES.forEach((p) =>
      exists(data[p]) ? (data[p] *= FEET_PER_METER) : noop
    );

    if (exists(data.ENGINE_TYPE)) {
      data.ENGINE_TYPE = ENGINE_TYPES[data.ENGINE_TYPE];
    }
  }

  /**
   * ...
   * @param {*} data
   * @param {*} withDelta
   */
  rebindData(data, previousValues) {
    // Whether or not we have previous values for delta computation,
    // just preallocate the values we _might_ need for that.
    const d = {};
    const before = this.flightData.__datetime;
    const now = Date.now();
    const dt = (now - before) / 1000; // delta per second seconds

    // Then copy all of that data to remapped names so we don't need to
    // ever work with ALL_CAPS_SIMVAR_NAMES. Any information the client
    // needs to "normally" work with should have normal JS varnames.
    // At the same time, compute deltas for anything that has a JS name
    // and is a numeric type (and isn't in the FIXED_PROPERTIES list).
    Object.entries(data).forEach(([simName, value]) => {
      const jsName = NAME_MAPPING[simName];

      if (jsName === undefined) return;
      if (!exists(data[simName])) return;

      data[jsName] = value;
      delete data[simName];

      // Do we need to compute derivatives?
      if (previousValues && DERIVATIVES.includes(jsName)) {
        const previous = previousValues[jsName];
        if (typeof previous !== `number`) return;
        const current = data[jsName];
        d[jsName] = (current - previous) / dt;

        // ...do we need to compute *second* derivatives?
        if (SECOND_DERIVATIVES.includes(jsName)) {
          d.d ??= {};
          const previousDelta = previousValues.d?.[jsName] ?? 0;
          d.d[jsName] = d[jsName] - previousDelta;
        }
      }
    });

    // If we did delta computation work, save the result:
    if (previousValues) {
      data.__datetime = now;
      data.d = d;
    }
  }
}
