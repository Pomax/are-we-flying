import { FEET_PER_DEGREE, FEET_PER_METER, FPS_IN_KNOTS } from "./constants.js";
import { exists } from "./utils.js";
const noop = () => {};

export const FLIGHT_MODEL = [
  `CATEGORY`,
  `DESIGN_CRUISE_ALT`,
  `DESIGN_SPEED_CLIMB`,
  `DESIGN_SPEED_MIN_ROTATION`,
  `DESIGN_SPEED_VC`,
  `DESIGN_SPEED_VS0`,
  `DESIGN_SPEED_VS1`,
  `DESIGN_TAKEOFF_SPEED`,
  `ELEVATOR_TRIM_DOWN_LIMIT`,
  `ELEVATOR_TRIM_UP_LIMIT`,
  `ENGINE_TYPE`,
  `IS_GEAR_FLOATS`,
  `IS_GEAR_RETRACTABLE`,
  `IS_TAIL_DRAGGER`,
  `NUMBER_OF_ENGINES`,
  `PLANE_LATITUDE`,
  `PLANE_LONGITUDE`,
  `STALL_ALPHA`,
  `STATIC_CG_TO_GROUND`,
  `TITLE`,
  `TOTAL_WEIGHT`,
  `TYPICAL_DESCENT_RATE`,
  `WING_AREA`,
  `WING_SPAN`,
];

export const FLIGHT_DATA = [
  `AILERON_POSITION`,
  `AILERON_TRIM_PCT`,
  `AIRSPEED_INDICATED`,
  `AIRSPEED_TRUE`,
  `AUTOPILOT_HEADING_LOCK_DIR`,
  `AUTOPILOT_MASTER`,
  `CAMERA_STATE`,
  `CAMERA_SUBSTATE`,
  `CRASH_FLAG`,
  `CRASH_SEQUENCE`,
  `ELECTRICAL_AVIONICS_BUS_VOLTAGE`,
  `ELECTRICAL_TOTAL_LOAD_AMPS`,
  `ELEVATOR_POSITION`,
  `ELEVATOR_TRIM_PCT`,
  `ELEVATOR_TRIM_POSITION`,
  `ENG_COMBUSTION:1`,
  `ENG_COMBUSTION:2`,
  `ENG_COMBUSTION:3`,
  `ENG_COMBUSTION:4`,
  `GEAR_POSITION:1`,
  `GEAR_SPEED_EXCEEDED`,
  `GROUND_ALTITUDE`,
  `INDICATED_ALTITUDE`,
  `OVERSPEED_WARNING`,
  `PLANE_ALT_ABOVE_GROUND_MINUS_CG`,
  `PLANE_ALT_ABOVE_GROUND`,
  `PLANE_BANK_DEGREES`,
  `PLANE_HEADING_DEGREES_MAGNETIC`,
  `PLANE_HEADING_DEGREES_TRUE`,
  `PLANE_LATITUDE`,
  `PLANE_LONGITUDE`,
  `PLANE_PITCH_DEGREES`,
  `RUDDER_POSITION`,
  `RUDDER_TRIM_PCT`,
  `SIM_ON_GROUND`,
  `TURN_INDICATOR_RATE`,
  `VERTICAL_SPEED`,
];

export const DEGREE_VALUES = [
  `PLANE_LATITUDE`,
  `PLANE_LONGITUDE`,
  `PLANE_BANK_DEGREES`,
  `PLANE_HEADING_DEGREES_MAGNETIC`,
  `PLANE_HEADING_DEGREES_TRUE`,
  `PLANE_PITCH_DEGREES`,
  `STALL_ALPHA`,
  `TURN_INDICATOR_RATE`,
];

export const BOOLEAN_VALUES = [
  `AUTOPILOT_MASTER`,
  `ENG_COMBUSTION:1`,
  `ENG_COMBUSTION:2`,
  `ENG_COMBUSTION:3`,
  `ENG_COMBUSTION:4`,
  `IS_GEAR_FLOATS`,
  `IS_GEAR_RETRACTABLE`,
  `IS_TAIL_DRAGGER`,
  `GEAR_POSITION:1`,
  `GEAR_SPEED_EXCEEDED`,
  `OVERSPEED_WARNING`,
  `SIM_ON_GROUND`,
];

// percent over 100 to percent
export const PERCENT_VALUES = [
  `AILERON_POSITION`,
  `AILERON_TRIM_PCT`,
  `ELEVATOR_POSITION`,
  `ELEVATOR_TRIM_PCT`,
  `RUDDER_POSITION`,
  `RUDDER_TRIM_PCT`,
];

// fps to fpm
export const FPM_VALUES = [`VERTICAL_SPEED`];

// meters to feet
export const MTF_VALUES = [`GROUND_ALTITUDE`];

// fps to knots
export const KNOT_VALUES = [
  `DESIGN_SPEED_MIN_ROTATION`,
  `DESIGN_SPEED_CLIMB`,
  `DESIGN_SPEED_VC`,
  `DESIGN_TAKEOFF_SPEED`,
];

export const NAME_MAPPING = {
  AILERON_POSITION: `aileron`,
  AILERON_TRIM_PCT: `aileronTrim`,
  AIRSPEED_INDICATED: `speed`,
  AIRSPEED_TRUE: `trueSpeed`,
  AUTOPILOT_HEADING_LOCK_DIR: `headingBug`,
  AUTOPILOT_MASTER: `MASTER`,
  CAMERA_STATE: `camera`,
  CAMERA_SUBSTATE: `cameraSub`,
  CATEGORY: `category`,
  CRASH_FLAG: `crashed`,
  CRASH_SEQUENCE: `crashSequence`,
  DESIGN_CRUISE_ALT: `cruiseAlt`,
  DESIGN_SPEED_CLIMB: `climbSpeed`,
  DESIGN_SPEED_MIN_ROTATION: `minRotation`,
  DESIGN_SPEED_VC: `cruiseSpeed`,
  DESIGN_SPEED_VS0: `vs0`,
  DESIGN_SPEED_VS1: `vs1`,
  DESIGN_TAKEOFF_SPEED: `takeoffSpeed`,
  ELECTRICAL_AVIONICS_BUS_VOLTAGE: `busVoltage`,
  ELECTRICAL_TOTAL_LOAD_AMPS: `ampLoad`,
  ELEVATOR_POSITION: `elevator`,
  ELEVATOR_TRIM_DOWN_LIMIT: `trimDownLimit`,
  ELEVATOR_TRIM_PCT: `pitchTrim`,
  ELEVATOR_TRIM_POSITION: `trimPosition`,
  ELEVATOR_TRIM_UP_LIMIT: `trimUpLimit`,
  ENGINE_TYPE: `engineType`,
  "GEAR_POSITION:1": `isGearDown`,
  GEAR_SPEED_EXCEEDED: `gearSpeedExceeded`,
  GROUND_ALTITUDE: `groundAlt`,
  INDICATED_ALTITUDE: `alt`,
  IS_GEAR_FLOATS: `isFloatPlane`,
  IS_GEAR_RETRACTABLE: `hasRetractibleGear`,
  IS_TAIL_DRAGGER: `isTailDragger`,
  NUMBER_OF_ENGINES: `engineCount`,
  OVERSPEED_WARNING: `overSpeed`,
  PLANE_ALT_ABOVE_GROUND_MINUS_CG: `lift`,
  PLANE_ALT_ABOVE_GROUND: `altAboveGround`,
  PLANE_BANK_DEGREES: `bank`,
  PLANE_HEADING_DEGREES_MAGNETIC: `heading`,
  PLANE_HEADING_DEGREES_TRUE: `trueHeading`,
  PLANE_LATITUDE: `lat`,
  PLANE_LONGITUDE: `long`,
  PLANE_PITCH_DEGREES: `pitch`,
  RUDDER_POSITION: `rudder`,
  RUDDER_TRIM_PCT: `rudderTrim`,
  SIM_ON_GROUND: `onGround`,
  STATIC_CG_TO_GROUND: `cg`,
  STALL_ALPHA: `stallAlpha`,
  TITLE: `title`,
  TOTAL_WEIGHT: `weight`,
  TURN_INDICATOR_RATE: `turnRate`,
  TYPICAL_DESCENT_RATE: `descentRate`,
  VERTICAL_SPEED: `VS`,
  WING_AREA: `wingArea`,
  WING_SPAN: `wingSpan`,
};

export const DERIVATIVES = [
  `bank`,
  `heading`,
  `lift`,
  `pitch`,
  `speed`,
  `trueHeading`,
  `trueSpeed`,
  `turnRate`,
  `VS`,
];

export const SECOND_DERIVATIVES = [`VS`];

export const ENGINE_TYPES = [
  `piston`,
  `jet`,
  `none`,
  `helo(Bell) turbine`,
  `unsupported`,
  `turboprop`,
];

/**
 * ...
 * @param {*} data
 */
export function convertValues(data) {
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
export function renameData(data, previousValues) {
  // Whether or not we have previous values for delta computation,
  // just preallocate the values we _might_ need for that.
  const d = {};
  const before = data.__date_time ?? 0;
  const now = Date.now();
  const dt = (now - before) / 1000; // delta per second

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
    data.__date_time = now;
    data.d = d;
  }
}
