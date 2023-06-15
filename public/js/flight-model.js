import { getAPI } from "./api.js";

/*
           twitch  vs1    vs1²  weight     zlA
  rudder      1     21    441     439    -0.0087
  beaver      2     52   2704    3955    -0.0719
  kodiak      3     61   3721    5170    -0.011
  310R        4     70   4900    4485    -0.0669
  model18     5     75   5625    6509    -0.053

  */

// See https://docs.flightsimulator.com/html/Programming_Tools/SimVars/Aircraft_SimVars/Aircraft_FlightModel_Variables.htm
const flightModelValues = [
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
  `ELEVATOR_TRIM_UP_LIMIT`,
  `ELEVATOR_TRIM_DOWN_LIMIT`,
  `ENGINE_TYPE`,
  `ESTIMATED_CRUISE_SPEED`,
  `G_FORCE`,
  `G_LIMITER_SETTING`,
  `INCIDENCE_ALPHA`,
  `INCIDENCE_BETA`,
  `IS GEAR FLOATS`,
  `IS_TAIL_DRAGGER`,
  `LINEAR_CL_ALPHA`,
  `MACH_MAX_OPERATE`,
  `MAX_G_FORCE`,
  `MIN_DRAG_VELOCITY`,
  `MIN_G_FORCE`,
  `NUMBER_OF_ENGINES`,
  // `SEMIBODY_LOADFACTOR_X`, // deprecated, do not use
  `SEMIBODY_LOADFACTOR_Y`,
  `SEMIBODY_LOADFACTOR_YDOT`,
  // `SEMIBODY_LOADFACTOR_Z`, // deprecated, do not use
  `SIGMA_SQRT`,
  `SIMULATED_RADIUS`,
  `STALL_ALPHA`,
  `STATIC_PITCH`,
  `STATIC_CG_TO_GROUND`,
  `TITLE`,
  `TYPICAL_DESCENT_RATE`,
  `TOTAL_WEIGHT`,
  `WING_AREA`,
  `WING_FLEX_PCT:1`,
  `WING_FLEX_PCT:2`,
  `WING_SPAN`,
  `YAW_STRING_ANGLE`,
  `YAW_STRING_PCT_EXTENDED`,
  `ZERO_LIFT_ALPHA`,
  `PLANE_LATITUDE`,
  `PLANE_LONGITUDE`,
];

export class FlightModel {
  constructor(api) {
    this.api = api;
  }

  async bootstrap() {
    const values = (this.values = await getAPI(...flightModelValues));
    return {
      lat: values.PLANE_LATITUDE,
      long: values.PLANE_LONGITUDE,
      title: values.TITLE,
      engineCount: values.NUMBER_OF_ENGINES,
    };
  }
}
