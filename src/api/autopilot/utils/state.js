import { degrees } from "./utils.js";

export class State {
  // Basic flight data
  onGround = true;
  altitude = 0;
  speed = 0;
  lift = 0;

  // Basic nagivation data
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

  // Value deltas ("per second"). These are automatically
  // set if there is a previous state.
  dSpeed = 0;
  dLift = 0;
  dBank = 0;
  dTurn = 0;
  dHeading = 0;
  dV = 0;
  dVS = 0;

  isTailDragger = false;

  // Timestamp for this state. This value is automatically set.
  callTime = 0;

  // derived values if there is a previous state
  constructor(data = {}, previous) {
    this.onGround = data.SIM_ON_GROUND ?? this.onGround;
    this.altitude = data.INDICATED_ALTITUDE ?? this.altitude;
    this.speed = data.AIRSPEED_TRUE ?? this.speed;
    this.lift = data.PLANE_ALT_ABOVE_GROUND_MINUS_CG ?? this.lift;

    this.latitude = degrees(data.PLANE_LATITUDE ?? this.latitude);
    this.longitude = degrees(data.PLANE_LONGITUDE ?? this.longitude);
    // FIXME: should these always be in degrees, too?
    this.heading = data.PLANE_HEADING_DEGREES_MAGNETIC ?? this.heading;
    this.trueHeading = data.PLANE_HEADING_DEGREES_TRUE ?? this.trueHeading;
    this.declination = degrees(this.trueHeading - this.heading);

    this.bankAngle = data.PLANE_BANK_DEGREES ?? this.bankAngle;
    this.turnRate = data.TURN_INDICATOR_RATE ?? this.turnRate;

    // VS is in feet per second, and we want feet per minute.
    this.verticalSpeed = 60 * (data.VERTICAL_SPEED ?? this.verticalSpeed);

    this.pitchTrim = data.ELEVATOR_TRIM_POSITION ?? this.pitchTrim;
    this.pitchTrimLimit = [
      data.ELEVATOR_TRIM_UP_LIMIT ?? 10,
      data.ELEVATOR_TRIM_DOWN_LIMIT ?? -10,
    ];
    this.aileronTrim = data.AILERON_TRIM_PCT ?? this.aileronTrim;
    this.isTailDragger = data.IS_TAIL_DRAGGER ?? this.isTailDragger;
    this.callTime = Date.now();

    if (previous) {
      const interval = (this.callTime - previous.callTime) / 1000;
      // Derive all our deltas "per second"
      this.dSpeed = (this.speed - previous.speed) / interval;
      this.dLift = (this.lift - previous.lift) / interval;
      this.dBank = (this.bankAngle - previous.bankAngle) / interval;
      this.dTurn = (this.turnRate - previous.turnRate) / interval;
      this.dHeading = (this.heading - previous.heading) / interval;
      this.dV = (this.speed - previous.speed) / interval;
      this.dVS = (this.verticalSpeed - previous.verticalSpeed) / interval;
    }
  }
}
