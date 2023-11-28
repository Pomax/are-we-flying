export const FLIGHT_MODEL = [
  `BETA_DOT`,
  `CATEGORY`,
  `DECISION_ALTITUDE_MSL`,
  `DECISION_HEIGHT`,
  `DESIGN_CRUISE_ALT`,
  `DESIGN_SPAWN_ALTITUDE_CRUISE`,
  `DESIGN_SPAWN_ALTITUDE_DESCENT`,
  `DESIGN_SPEED_CLIMB`,
  `DESIGN_SPEED_MIN_ROTATION`,
  `DESIGN_SPEED_VC`,
  `DESIGN_SPEED_VS0`,
  `DESIGN_SPEED_VS1`,
  `DESIGN_TAKEOFF_SPEED`,
  `DYNAMIC_PRESSURE`,
  `ELEVATOR_TRIM_DOWN_LIMIT`,
  `ELEVATOR_TRIM_UP_LIMIT`,
  `ENGINE_TYPE`,
  `ESTIMATED_CRUISE_SPEED`,
  `G_FORCE`,
  `G_LIMITER_SETTING`,
  `INCIDENCE_ALPHA`,
  `INCIDENCE_BETA`,
  `IS_GEAR_FLOATS`,
  `IS_TAIL_DRAGGER`,
  `LINEAR_CL_ALPHA`,
  `MACH_MAX_OPERATE`,
  `MAX_G_FORCE`,
  `MIN_DRAG_VELOCITY`,
  `MIN_G_FORCE`,
  `NUMBER_OF_ENGINES`,
  `PLANE_LATITUDE`,
  `PLANE_LONGITUDE`,
  `SEMIBODY_LOADFACTOR_Y`,
  `SEMIBODY_LOADFACTOR_YDOT`,
  `SIGMA_SQRT`,
  `SIMULATED_RADIUS`,
  `STALL_ALPHA`,
  `STATIC_CG_TO_GROUND`,
  `STATIC_PITCH`,
  `TITLE`,
  `TOTAL_WEIGHT`,
  `TYPICAL_DESCENT_RATE`,
  `WING_AREA`,
  `WING_FLEX_PCT:1`,
  `WING_FLEX_PCT:2`,
  `WING_SPAN`,
  `YAW_STRING_ANGLE`,
  `YAW_STRING_PCT_EXTENDED`,
  `ZERO_LIFT_ALPHA`,
];

export const FLIGHT_DATA = [
  `AILERON_TRIM_PCT`,
  `AIRSPEED_INDICATED`,
  `AIRSPEED_TRUE`,
  `AUTOPILOT_HEADING_LOCK_DIR`,
  `AUTOPILOT_MASTER`,
  `CAMERA_STATE`,
  `CAMERA_SUBSTATE`,
  `CRASH_FLAG`,
  `CRASH_SEQUENCE`,
  `ELECTRICAL_TOTAL_LOAD_AMPS`,
  `ELEVATOR_TRIM_PCT`,
  `ELEVATOR_TRIM_POSITION`,
  `ENG_COMBUSTION:1`,
  `ENG_COMBUSTION:2`,
  `ENG_COMBUSTION:3`,
  `ENG_COMBUSTION:4`,
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
  `RUDDER_TRIM_PCT`,
  `SIM_ON_GROUND`,
  `STATIC_CG_TO_GROUND`,
  `TITLE`,
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
  `TURN_INDICATOR_RATE`,
];

export const BOOLEAN_VALUES = [
  `AUTOPILOT_MASTER`,
  `ENG_COMBUSTION:1`,
  `ENG_COMBUSTION:2`,
  `ENG_COMBUSTION:3`,
  `ENG_COMBUSTION:4`,
  `OVERSPEED_WARNING`,
  `SIM_ON_GROUND`,
];

// percent over 100 to percent
export const PERCENT_VALUES = [
  `AILERON_TRIM_PCT`,
  `ELEVATOR_TRIM_PCT`,
  `RUDDER_TRIM_PCT`,
];

// fps to fpm
export const FPM_VALUES = [`VERTICAL_SPEED`];

// fps to knots
export const KNOT_VALUES = [
  `DESIGN_SPEED_MIN_ROTATION`,
  `DESIGN_SPEED_CLIMB`,
  `DESIGN_SPEED_VC`,
  `DESIGN_TAKEOFF_SPEED`,
];

export const NAME_MAPPING = {
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
  ELECTRICAL_TOTAL_LOAD_AMPS: `ampLoad`,
  ELEVATOR_TRIM_DOWN_LIMIT: `trimDownLimit`,
  ELEVATOR_TRIM_PCT: `pitchTrim`,
  ELEVATOR_TRIM_POSITION: `trimPosition`,
  ELEVATOR_TRIM_UP_LIMIT: `trimUpLimit`,
  ENGINE_TYPE: `engineType`,
  GROUND_ALTITUDE: `groundAlt`,
  INDICATED_ALTITUDE: `alt`,
  IS_GEAR_FLOATS: `isFloatPlane`,
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
  RUDDER_TRIM_PCT: `rudderTrim`,
  SIM_ON_GROUND: `onGround`,
  STATIC_CG_TO_GROUND: `cg`,
  TITLE: `title`,
  TOTAL_WEIGHT: `weight`,
  TURN_INDICATOR_RATE: `turnRate`,
  TYPICAL_DESCENT_RATE: `descentRate`,
  VERTICAL_SPEED: `VS`,
  WING_AREA: `wingArea`,
  WING_SPAN: `wingSpan`,
  // custom values
  ENGINES_RUNNING: "enginesRunning",
  POWERED_UP: "hasPower",
};

export const FIXED_PROPERTIES = [
  `__datatime`,
  `ampLoad`,
  `camera`,
  `cameraSub`,
  `cg`,
  `climbSpeed`,
  `crashed`,
  `crashSequence`,
  `cruiseAlt`,
  `cruiseSpeed`,
  `delta`,
  `descentRate`,
  `engineCount`,
  `enginesRunning`,
  `engineType`,
  `hasPower`,
  `headingBug`,
  `isFloatPlane`,
  `isTailDragger`,
  `lat`,
  `long`,
  `minRotation`,
  `pitchTrimLimit`,
  `takeoffSpeed`,
  `title`,
  `vs0`,
  `vs1`,
  `weight`,
  `wingArea`,
  `wingSpan`,
];

export const SECOND_DERIVATIVES = [`VS`];