import { FEET_PER_METER, FPS_IN_KNOTS } from "./constants.js";
import { exists } from "./utils.js";

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
  `INCIDENCE_ALPHA`,
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

export const ENGINE_TYPES = [
  `piston`,
  `jet`,
  `none`,
  `helo(Bell) turbine`,
  `unsupported`,
  `turboprop`,
];

export const FLIGHT_DATA = [
  `AILERON_POSITION`,
  `AILERON_TRIM_PCT`,
  `AIRSPEED_INDICATED`,
  `AIRSPEED_TRUE`,
  `AUTOPILOT_HEADING_LOCK_DIR`,
  `AUTOPILOT_MASTER`,
  `BRAKE_PARKING_POSITION`,
  `CAMERA_STATE`,
  `CAMERA_SUBSTATE`,
  `CONTACT_POINT_IS_ON_GROUND:0`,
  `CONTACT_POINT_IS_ON_GROUND:1`,
  `CONTACT_POINT_IS_ON_GROUND:2`,
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
  `GENERAL_ENG_THROTTLE_LEVER_POSITION:1`,
  `GROUND_ALTITUDE`,
  `INDICATED_ALTITUDE`,
  `IS_SLEW_ACTIVE`,
  `MAGVAR`,
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
  `TAILWHEEL_LOCK_ON`,
  `TRAILING_EDGE_FLAPS_LEFT_ANGLE`,
  `TURN_INDICATOR_RATE`,
  `VERTICAL_SPEED`,
];

// These are all degree values that are actually stored as radians.
export const DEGREE_VALUES = [
  `MAGVAR`,
  `PLANE_LATITUDE`,
  `PLANE_LONGITUDE`,
  `PLANE_BANK_DEGREES`,
  `PLANE_HEADING_DEGREES_MAGNETIC`,
  `PLANE_HEADING_DEGREES_TRUE`,
  `PLANE_PITCH_DEGREES`,
  `STALL_ALPHA`,
  `TRAILING_EDGE_FLAPS_LEFT_ANGLE`,
  `TURN_INDICATOR_RATE`,
];

// These are all boolean values that are stored as a number.
export const BOOLEAN_VALUES = [
  `AUTOPILOT_MASTER`,
  `BRAKE_PARKING_POSITION`,
  `CONTACT_POINT_IS_ON_GROUND:0`,
  `CONTACT_POINT_IS_ON_GROUND:1`,
  `CONTACT_POINT_IS_ON_GROUND:2`,
  `ENG_COMBUSTION:1`,
  `ENG_COMBUSTION:2`,
  `ENG_COMBUSTION:3`,
  `ENG_COMBUSTION:4`,
  `IS_GEAR_FLOATS`,
  `IS_GEAR_RETRACTABLE`,
  `IS_SLEW_ACTIVE`,
  `IS_TAIL_DRAGGER`,
  `GEAR_POSITION:1`,
  `GEAR_SPEED_EXCEEDED`,
  `OVERSPEED_WARNING`,
  `SIM_ON_GROUND`,
  `TAILWHEEL_LOCK_ON`,
];

// These are percentages, but stored as "percent divided by 100"
export const PERCENT_VALUES = [
  `AILERON_POSITION`,
  `AILERON_TRIM_PCT`,
  `ELEVATOR_POSITION`,
  `ELEVATOR_TRIM_PCT`,
  `RUDDER_POSITION`,
  `RUDDER_TRIM_PCT`,
];

// In game, vertical speed is shown feet per minute,
// but SimConnect reports it as feet per second...
export const FPM_VALUES = [`VERTICAL_SPEED`];

// Plane altitude is in feet, so why is ground altitude in meters?
export const MTF_VALUES = [`GROUND_ALTITUDE`];

// And finally, please just turn all of these into
// values in knots instead of feet per second...
export const KNOT_VALUES = [
  `DESIGN_SPEED_MIN_ROTATION`,
  `DESIGN_SPEED_CLIMB`,
  `DESIGN_SPEED_VC`,
];

const noop = () => {};

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
  if (exists(data.ENGINE_TYPE))
    data.ENGINE_TYPE = ENGINE_TYPES[data.ENGINE_TYPE];
}

export const NAME_MAPPING = {
  AILERON_POSITION: `aileron`,
  AILERON_TRIM_PCT: `aileronTrim`,
  AIRSPEED_INDICATED: `speed`,
  AIRSPEED_TRUE: `trueSpeed`,
  AUTOPILOT_HEADING_LOCK_DIR: `headingBug`,
  AUTOPILOT_MASTER: `MASTER`,
  BRAKE_PARKING_POSITION: `parkingBrake`,
  CAMERA_STATE: `camera`,
  CAMERA_SUBSTATE: `cameraSub`,
  CATEGORY: `category`,
  "CONTACT_POINT_IS_ON_GROUND:0": `centerWheelOnGround`,
  "CONTACT_POINT_IS_ON_GROUND:1": `leftWheelOnGround`,
  "CONTACT_POINT_IS_ON_GROUND:2": `rightWheeOnGround`,
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
  "GENERAL_ENG_THROTTLE_LEVER_POSITION:1": `throttle`,
  GROUND_ALTITUDE: `groundAlt`,
  INDICATED_ALTITUDE: `alt`,
  IS_GEAR_FLOATS: `isFloatPlane`,
  IS_GEAR_RETRACTABLE: `hasRetractibleGear`,
  IS_SLEW_ACTIVE: `slewMode`,
  IS_TAIL_DRAGGER: `isTailDragger`,
  MAGVAR: `declination`,
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
  TAILWHEEL_LOCK_ON: `tailWheelLock`,
  TITLE: `title`,
  TOTAL_WEIGHT: `weight`,
  TURN_INDICATOR_RATE: `turnRate`,
  TYPICAL_DESCENT_RATE: `descentRate`,
  VERTICAL_SPEED: `VS`,
  WING_AREA: `wingArea`,
  WING_SPAN: `wingSpan`,
};

// Our list of "first derivatives", i.e. our deltas
export const DERIVATIVES = [
  `aileronTrim`,
  `bank`,
  `heading`,
  `lift`,
  `pitch`,
  `flaps`,
  `pitchTrim`,
  `speed`,
  `trueHeading`,
  `trueSpeed`,
  `turnRate`,
  `VS`,
];

// And our single "second derivative":
export const SECOND_DERIVATIVES = [`VS`];

// And then an update to the `rebind` function:
export function renameData(data, previousValues) {
  // Whether or not we have previous values for delta computation,
  // just preallocate the values we _might_ need for that.
  const d = {};
  const now = Date.now();
  const before = previousValues?.__date_time ?? now - 0.001;

  // delta per second, but make sure that pausing the game
  // doesn't lead to insanely high values here:
  let dt = (now - before) / 1000;
  if (dt > 2) dt = 2;
  d.dt = dt;

  // Then perform the name mapping, but with extra code for getting
  // our "delta" values, which we'll add into a `.d` property.
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
