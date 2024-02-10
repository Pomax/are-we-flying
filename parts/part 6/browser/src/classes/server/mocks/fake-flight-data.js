import { radians } from "../../../utils/utils.js";

/**
 * Our starting point will be 1500 feet above runway 27
 * at Victoria Airport on Vancouver Island, BC, Canada.
 */
const altitude = 1500;
const static_cg_height = 5;
const speed = 142;
const declination = 15.883026056332483;
const heading = 270;
const lat = 48.646548831015394;
const long = -123.41169834136964;
const trimLimit = 18;

/**
 * All the values that our FlightInformation object needs:
 */
const data = {
  AILERON_POSITION: 0,
  AILERON_TRIM_PCT: 0,
  AIRSPEED_INDICATED: speed * 0.95,
  AIRSPEED_TRUE: speed,
  AUTOPILOT_HEADING_LOCK_DIR: heading,
  AUTOPILOT_MASTER: 0,
  BRAKE_PARKING_POSITION: 0,
  CAMERA_STATE: 2, // cockpit view
  CAMERA_SUBSTATE: 2, // unlocked view
  CATEGORY: 2,
  CRASH_FLAG: 0,
  CRASH_SEQUENCE: 0,
  DESIGN_CRUISE_ALT: 12000,
  DESIGN_SPEED_CLIMB: 100,
  DESIGN_SPEED_MIN_ROTATION: 100,
  DESIGN_SPEED_VC: 145,
  DESIGN_SPEED_VS0: 60,
  DESIGN_SPEED_VS1: 70,
  DESIGN_TAKEOFF_SPEED: 100,
  ELECTRICAL_AVIONICS_BUS_VOLTAGE: 480,
  ELECTRICAL_TOTAL_LOAD_AMPS: -148.123,
  ELEVATOR_POSITION: 0,
  ELEVATOR_TRIM_DOWN_LIMIT: trimLimit,
  ELEVATOR_TRIM_PCT: 0,
  ELEVATOR_TRIM_POSITION: 0,
  ELEVATOR_TRIM_UP_LIMIT: trimLimit,
  ENG_COMBUSTION: 1, // note that we removed the :<num> suffix
  ENGINE_TYPE: 1,
  GEAR_HANDLE_POSITION: 0,
  GEAR_POSITION: 1, // note that we removed the :<num> suffix
  GEAR_SPEED_EXCEEDED: 0,
  GENERAL_ENG_THROTTLE_LEVER_POSITION: 95,
  GROUND_ALTITUDE: 0,
  INCIDENCE_ALPHA: 0,
  INDICATED_ALTITUDE: altitude,
  IS_GEAR_FLOATS: 0,
  IS_GEAR_RETRACTABLE: 1,
  IS_TAIL_DRAGGER: 0,
  MAGVAR: declination,
  NUMBER_OF_ENGINES: 1,
  OVERSPEED_WARNING: 0,
  PLANE_ALT_ABOVE_GROUND_MINUS_CG: altitude - static_cg_height,
  PLANE_ALT_ABOVE_GROUND: altitude,
  PLANE_BANK_DEGREES: 0,
  PLANE_HEADING_DEGREES_MAGNETIC: radians(heading),
  PLANE_HEADING_DEGREES_TRUE: radians(heading + declination),
  PLANE_LATITUDE: radians(lat),
  PLANE_LONGITUDE: radians(long),
  PLANE_PITCH_DEGREES: 0,
  RUDDER_POSITION: 0,
  RUDDER_TRIM_PCT: 0,
  SIM_ON_GROUND: 0,
  STALL_ALPHA: 0,
  STATIC_CG_TO_GROUND: static_cg_height,
  TAILWHEEL_LOCK_ON: 0,
  TITLE: `pretty terrible testing plane`,
  TOTAL_WEIGHT: 3000,
  TURN_INDICATOR_RATE: 0,
  TYPICAL_DESCENT_RATE: 80,
  VERTICAL_SPEED: 0,
  WING_AREA: 250,
  WING_SPAN: 50,
};

/**
 * And as our export, a function that returns a *copy*
 * of the above data, so that we can reset to it if
 * we need to.
 */
export function getInitialState() {
  return Object.assign({}, data);
}
