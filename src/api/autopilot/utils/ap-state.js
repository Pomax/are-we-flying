import { degrees } from "./utils.js";
import { KNOT_IN_FPS } from "./constants.js";
import { AP_VARIABLES } from "./ap-variables.js";

export class State {
  // Basic flight data
  onGround = true;
  isTailDragger = false;
  altitude = 0;
  speed = 0;
  lift = 0;

  // Basic navigation data
  latitude = 0;
  longitude = 0;
  heading = 0; // based on the magnetic compass
  trueHeading = 0; // based on GPS

  // Extended flight data
  bankAngle = 0;
  turnRate = 0;
  verticalSpeed = 0;
  pitchTrim = 0;
  pitchTrimLimit = [10, -10];
  aileronTrim = 0;
  rudderTrim = 0;

  // Value deltas ("per second"). These are automatically
  // set if there is a previous state.
  dSpeed = 0;
  dLift = 0;
  dBank = 0;
  dTurn = 0;
  dHeading = 0;
  dV = 0;
  dVS = 0;

  // model properties
  model = {
    climbSpeed: 0,
    minRotation: 0,
    vc: 0,
    vs1: 0,
    takeoffSpeed: 0,
    numberOfEngines: 0,
    overSpeed: 0,
    weight: 0,
  };

  // Timestamp for this state. This value is automatically set.
  callTime = 0;

  // ...talk about this...
  constructor(data, previous) {
    this.callTime = Date.now();

    if (data === undefined) {
      return;
    }

    // check to make sure we have all the data we need:
    for (let key of AP_VARIABLES) {
      if (data[key] === undefined) {
        // not all planes specify these two values, so we won't error out if they're missing.
        if (
          key !== `ELEVATOR_TRIM_DOWN_LIMIT` &&
          key !== `ELEVATOR_TRIM_UP_LIMIT`
        ) {
          throw new Error(`bad state data, ${key} is undefined`);
        }
      }
    }

    // booleans
    this.onGround = !!data.SIM_ON_GROUND;
    this.isTailDragger = !!data.IS_TAIL_DRAGGER;

    // degrees
    this.latitude = degrees(data.PLANE_LATITUDE);
    this.longitude = degrees(data.PLANE_LONGITUDE);
    this.heading = degrees(data.PLANE_HEADING_DEGREES_MAGNETIC);
    this.trueHeading = degrees(data.PLANE_HEADING_DEGREES_TRUE);
    this.declination = this.trueHeading - this.heading;
    this.bankAngle = degrees(data.PLANE_BANK_DEGREES);
    this.turnRate = degrees(data.TURN_INDICATOR_RATE);

    // altitudes
    this.altitude = data.INDICATED_ALTITUDE;
    this.lift = data.PLANE_ALT_ABOVE_GROUND_MINUS_CG;

    // speed
    this.speed = data.AIRSPEED_TRUE;
    this.verticalSpeed = 60 * data.VERTICAL_SPEED; // we want feet per minute, not feet per second

    // trim values
    this.pitchTrim = data.ELEVATOR_TRIM_POSITION;
    this.pitchTrimLimit = [
      data.ELEVATOR_TRIM_UP_LIMIT ?? 10,
      data.ELEVATOR_TRIM_DOWN_LIMIT ?? -10,
    ];
    this.aileronTrim = 100 * data.AILERON_TRIM_PCT;
    this.rudderTrim = 100 * data.RUDDER_TRIM_PCT;

    // model data
    this.model = {
      climbSpeed: data.DESIGN_SPEED_CLIMB / KNOT_IN_FPS,
      minRotation: data.DESIGN_SPEED_MIN_ROTATION,
      vc: data.DESIGN_SPEED_VC / KNOT_IN_FPS,
      vs1: data.DESIGN_SPEED_VS1,
      takeoffSpeed: data.DESIGN_TAKEOFF_SPEED,
      numberOfEngines: data.NUMBER_OF_ENGINES,
      overSpeed: data.OVERSPEED_WARNING,
      weight: data.TOTAL_WEIGHT,
    };

    // derive "delta per second" values if there is a previous state
    this.buildDeltas(previous);
  }

  buildDeltas(previous) {
    if (!previous) return;
    const s = (this.callTime - previous.callTime) / 1000;
    this.dSpeed = (this.speed - previous.speed) / s;
    this.dLift = (this.lift - previous.lift) / s;
    this.dBank = (this.bankAngle - previous.bankAngle) / s;
    this.dTurn = (this.turnRate - previous.turnRate) / s;
    this.dHeading = (this.heading - previous.heading) / s;
    this.dV = (this.speed - previous.speed) / s;
    this.dVS = (this.verticalSpeed - previous.verticalSpeed) / s;
  }
}
