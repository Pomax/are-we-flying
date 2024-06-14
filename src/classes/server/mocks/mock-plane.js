import * as geomag from "geomag";
import {
  constrainMap,
  degrees,
  getPointAtDistance,
  radians,
  runLater,
} from "../../../utils/utils.js";
import { FEET_PER_METER } from "../../../utils/constants.js";
import {
  ALOSInterface,
  NO_ALOS_DATA_VALUE,
  DATA_FOLDER,
} from "../../../elevation/alos-interface.js";
import { roll, pitch, yaw, Computer } from "./geometry/computer.js";

const { abs, sign, PI } = Math;
const TAU = PI * 2;

// Our starting point is runway 27 at Victoria airport
let lat = 48.646548831015394;
let long = -123.41169834136964;
let heading = 285.8;
let deviation = 15.8;
let altitude = 0;

const ONE_KTS_IN_KMS = 0.000514444;
const UPDATE_FREQUENCY = 450;

export class MockPlane {
  computer = new Computer();

  constructor() {
    this.TITLE = "Generic Airplane Number 1";

    this.computer.init({
      lat: 48.646548831015394,
      long: -123.41169834136964,
      heading: 285.8,
      elevation: 1500,
    })

    // airplane data
    this.CATEGORY = 2;
    this.DESIGN_CRUISE_ALT = 12000;
    this.DESIGN_SPEED_VS0 = 80;
    this.ELEVATOR_TRIM_DOWN_LIMIT = 18;
    this.ELEVATOR_TRIM_UP_LIMIT = 18;
    this.ENGINE_TYPE = 1;
    this.IS_GEAR_FLOATS = 0;
    this.IS_GEAR_RETRACTABLE = 1;
    this.STALL_ALPHA = 0;
    this.TYPICAL_DESCENT_RATE = 80;
    this.WING_AREA = 1000;
    this.WING_SPAN = 100;

    this.TAILWHEEL_LOCK_ON = 0;
    this.BRAKE_PARKING_POSITION = 0;
    this.GEAR_HANDLE_POSITION = 100;
    this.ENG_COMBUSTION = 1;
    this.GENERAL_ENG_THROTTLE_LEVER_POSITION = 95;
    this.ELECTRICAL_TOTAL_LOAD_AMPS = -148.123;

    // flight data
    this.AILERON_POSITION = 0;
    this.ELEVATOR_TRIM_PCT = 0;
    this["GEAR_POSITION:1"] = 1;
    this.GEAR_SPEED_EXCEEDED = 0;
    this.RUDDER_POSITION = 0;

    this.PLANE_BANK_DEGREES = 0;
    this.PLANE_PITCH_DEGREES = 0;
    this.TURN_INDICATOR_RATE = 0;

    // control values
    this.ELEVATOR_POSITION = 0;
    this.AILERON_TRIM_PCT = 0;
    this.ELEVATOR_TRIM_POSITION = 0;
    this.RUDDER_TRIM_PCT = 0;

    // autopilot values
    this.AUTOPILOT_MASTER = 0;
    this.AUTOPILOT_HEADING_LOCK_DIR = heading - deviation;

    // model properties
    this.DESIGN_SPEED_VNE = 200;
    this.DESIGN_SPEED_CLIMB = 120;
    this.DESIGN_SPEED_VC = 280;
    this.DESIGN_SPEED_VS1 = 100;
    this.DESIGN_SPEED_MIN_ROTATION = 100;
    this.DESIGN_TAKEOFF_SPEED = 120;
    this.IS_TAIL_DRAGGER = 0;
    this.NUMBER_OF_ENGINES = 1;
    this.STATIC_CG_TO_GROUND = 0;
    this.TOTAL_WEIGHT = 3000;

    // "game" values
    this.CRASH_FLAG = 0;
    this.CRASH_SEQUENCE = 0;
    this.OVERSPEED_WARNING = 0;
    this.CAMERA_STATE = 2; // cockpit
    this.CAMERA_SUBSTATE = 2; // unlocked view
    this.ELECTRICAL_AVIONICS_BUS_VOLTAGE = 480;
    this.ELECTRICAL_TOTAL_LOAD_AMPS = 400;

    // non-simconnect values
    this.ALT = 1500;
    this.VS = 0;
    this.dVS = 0;
    this.alos = new ALOSInterface(DATA_FOLDER);

    this.run();
  }

  run(now = Date.now()) {
    this.lastCall = now;
    runLater(() => this.update(), UPDATE_FREQUENCY);
  }

  /**
   * This function basically runs the world's worst flight simulation.
   */
  update() {
    // get time-since-last-call in seconds
    const now = Date.now();
    const interval = (now - this.lastCall) / 1000;

    const data = this.computer.update(interval);

    lat = data.lat;
    long = data.long;
    heading = data.heading;
    deviation = geomag.field(
      lat,
      long,
      (data.elevation * FEET_PER_METER) / 1000
    ).declination;

    this.AIRSPEED_TRUE = data.speed;
    this.ALT = data.elevation;
    this.VS = data.vs;

    if (this.ALT < 0) {
      this.ALT = 0;
      this.VS = 0;
      this.dVS = 0;
    }

    this.TURN_INDICATOR_RATE = data.turnRate;
    this.PLANE_BANK_DEGREES = degrees(asin(data.localFrame[pitch][2]));
    this.PLANE_PITCH_DEGREES = degrees(asin(data.localFrame[roll][2]));

    /*
      // update the current altitude
      if (sign(this.VS) !== sign(this.dVS)) this.VS -= this.VS / 10;
      const update = this.dVS / interval;
      if (sign(this.VS) !== sign(this.dVS)) {
        this.VS += constrainMap(this.VS, 0, 100, update, 100 * update);
      } else {
        this.VS += update;
      }
      this.ALT += (this.VS / interval) * this.speedFactor;
      if (this.ALT < 0) {
        this.ALT = 0;
        this.VS = 0;
        this.dVS = 0;
      }
      this.PLANE_PITCH_DEGREES = radians(
        constrainMap(this.AIRSPEED_TRUE, 0, 200, -10, 0) - this.VS / 2
      );

      // update the current GPS position
      const d = this.AIRSPEED_TRUE * ONE_KTS_IN_KMS * interval;
      const { lat: lat2, long: long2 } = getPointAtDistance(
        lat,
        long,
        d,
        heading
      );
      lat = lat2;
      long = long2;

      // update the altitude and magnetic deviation given this position
      let altMeters = this.alos.lookup(lat, long);
      if (altMeters === NO_ALOS_DATA_VALUE) {
        altMeters = 5;
      }
      altitude = altMeters * FEET_PER_METER;
      deviation = geomag.field(lat, long, altMeters / 1000).declination;

      // update the current heading
      this.PLANE_BANK_DEGREES += -100 * radians(this.AILERON_TRIM_PCT);
      heading -= (this.speedFactor * degrees(this.PLANE_BANK_DEGREES)) / 5;
    */

    this.run(now);
  }

  get speedFactor() {
    return constrainMap(this.AIRSPEED_TRUE, 0, 30, 0, 1);
  }

  // dynamic properties

  get GROUND_ALTITUDE() {
    return altitude;
  }

  get PLANE_HEADING_DEGREES_MAGNETIC() {
    return radians(heading - deviation) % TAU;
  }

  get PLANE_HEADING_DEGREES_TRUE() {
    return radians(heading);
  }

  get VERTICAL_SPEED() {
    return this.VS;
  }

  get INDICATED_ALTITUDE() {
    return this.ALT;
  }

  get PLANE_ALT_ABOVE_GROUND() {
    return this.INDICATED_ALTITUDE - this.GROUND_ALTITUDE;
  }

  get PLANE_ALT_ABOVE_GROUND_MINUS_CG() {
    return this.PLANE_ALT_ABOVE_GROUND;
  }

  get SIM_ON_GROUND() {
    return this.PLANE_ALT_ABOVE_GROUND < 1 ? 1 : 0;
  }

  get AIRSPEED_TRUE() {
    return (
      (this.GENERAL_ENG_THROTTLE_LEVER_POSITION / 100) *
      0.8 *
      this.DESIGN_SPEED_VNE
    );
  }

  get AIRSPEED_INDICATED() {
    return this.AIRSPEED_TRUE * 0.95;
  }

  get PLANE_LATITUDE() {
    return radians(lat);
  }
  get PLANE_LONGITUDE() {
    return radians(long);
  }

  // API mocks

  get(props) {
    const response = {};
    props.forEach((name) => {
      response[name] = this[name.replace(/:.*/, ``)];
    });
    return response;
  }

  set(name, value) {
    // console.log(`setting ${name} to ${value}`);
    if (name === `GENERAL_ENG_THROTTLE_LEVER_POSITION`) {
      if (value < 0.01) value = 0;
      this.GENERAL_ENG_THROTTLE_LEVER_POSITION = value;
    }
    if (name === `ELEVATOR_TRIM_POSITION`) {
      this.ELEVATOR_TRIM_POSITION = value;
      this.dVS = degrees(value);
    }
    if (name === `AILERON_TRIM_PCT`) {
      this.AILERON_TRIM_PCT = value;
    }
    if (name === `AUTOPILOT_HEADING_LOCK_DIR`) {
      this.AUTOPILOT_HEADING_LOCK_DIR = value;
    }
  }

  trigger(name, value) {
    if (name === `AP_MASTER`) {
      this.AUTOPILOT_MASTER = abs(this.AUTOPILOT_MASTER - 1);
    }
    if (name === `TOGGLE_TAILWHEEL_LOCK`) {
      this.TAILWHEEL_LOCK_ON = abs(this.TAILWHEEL_LOCK_ON - 1);
    }
    if (name === `PARKING_BRAKES`) {
      this.BRAKE_PARKING_POSITION = abs(this.BRAKE_PARKING_POSITION - 1);
    }
    if (name === `GEAR_UP`) {
      this.GEAR_HANDLE_POSITION = 0;
    }
    if (name === `GEAR_DOWN`) {
      this.GEAR_HANDLE_POSITION = 100;
    }
  }
}
