import * as geomag from "geomag";
import { getInitialState } from "./simvars.js";
import { convertValues, renameData } from "../../../utils/flight-values.js";
import {
  FEET_PER_METER,
  ONE_KTS_IN_KMS,
  FPS_PER_KNOT,
} from "../../../utils/constants.js";
import {
  constrainMap,
  degrees,
  getPointAtDistance,
  radians,
  runLater,
  lerp,
  flip,
} from "../../../utils/utils.js";

const { abs, sign, tan, PI } = Math;
const UPDATE_FREQUENCY = 450;

export class MockPlane {
  /**
   * Our starting point will be 1500 feet above runway 27
   * at Victoria Airport on Vancouver Island, BC, Canada.
   */
  constructor() {
    this.data = getInitialState();
    this.run();
  }

  setPosition(lat, long) {
    const { data } = this;
    data.PLANE_LATITUDE = radians(lat);
    data.PLANE_LATITUDE = radians(long);
  }

  setHeading(
    deg,
    lat = degrees(this.data.PLANE_LATITUDE),
    long = degrees(this.data.PLANE_LONGITUDE),
    alt = this.data.INDICATED_ALTITUDE / (1000 * FEET_PER_METER)
  ) {
    const { data } = this;
    const declination = geomag.field(lat, long, alt).declination;
    data.MAGVAR = radians(declination);
    deg = (deg + 360) % 360;
    data.PLANE_HEADING_DEGREES_MAGNETIC = radians(deg);
    data.PLANE_HEADING_DEGREES_TRUE = radians(deg + declination);
  }

  setAltitude(feet, lat, long, groundAlt = this.getGroundAlt(lat, long)) {
    const { data } = this;
    data.INDICATED_ALTITUDE = feet;
    data.PLANE_ALT_ABOVE_GROUND = feet - groundAlt;
    data.PLANE_ALT_ABOVE_GROUND_MINUS_CG =
      data.PLANE_ALT_ABOVE_GROUND - data.STATIC_CG_TO_GROUND;
  }

  getGroundAlt(lat, long) {
    // if we have an elevation server, we could use that here.
    return 0;
  }

  run(previousCallTime = Date.now()) {
    let callTime = Date.now();
    const ms = callTime - previousCallTime;
    if (ms > 10) {
      const interval = ms / 1000;
      this.update(interval);
    } else {
      callTime = previousCallTime;
    }
    runLater(() => this.run(callTime), UPDATE_FREQUENCY);
  }

  /**
   * This function basically runs the world's worst flight simulation.
   */
  update(interval) {
    const { data } = this;
    const converted = Object.assign({}, data);
    convertValues(converted);
    renameData(converted, this.previousValues);
    this.previousValues = converted;

    // update our current speed based on the throttle lever, too
    const throttle = data.GENERAL_ENG_THROTTLE_LEVER_POSITION;
    const speed = constrainMap(throttle, 0, 100, 0, 150);
    data.AIRSPEED_TRUE = lerp(0.2, data.AIRSPEED_TRUE, speed);
    data.AIRSPEED_INDICATED = 0.95 * data.AIRSPEED_TRUE;

    // update the current altitude by turning the current elevator
    // trim position into a target pitch and vertical speed, and then
    // applying a partial change so that the plane "takes a while to
    // get there" because otherwise our autopilot won't work =)
    const { pitchTrim, lat, long, vs1, climbSpeed } = converted;
    const p = sign(pitchTrim) * (abs(pitchTrim) / 100) ** 1.2;
    const pitchAngle = constrainMap(p, -1, 1, -3, 3);
    data.PLANE_PITCH_DEGREES = radians(pitchAngle);
    const newVS =
      tan(-data.PLANE_PITCH_DEGREES) *
      FPS_PER_KNOT *
      data.AIRSPEED_TRUE *
      60 *
      5;
    data.VERTICAL_SPEED = lerp(0.85, data.VERTICAL_SPEED, newVS);

    // update the current heading by turning the current aileron trim
    // position into a target bank, and then applying a partical change
    // so that the plane "takes a while to get there" because otherwise
    // our autopilot still can't work =)
    const { aileronTrim } = converted;
    const newBank =
      100 * radians(constrainMap(aileronTrim, -100, 100, 180, -180));
    data.PLANE_BANK_DEGREES = lerp(0.1, data.PLANE_BANK_DEGREES, newBank);
    let turnRate = aileronTrim * 30;
    data.TURN_INDICATOR_RATE = lerp(0.1, data.TURN_INDICATOR_RATE, turnRate);

    // // update heading
    const { heading } = converted;
    const updatedHeading = heading + 2 * turnRate * interval;
    this.setHeading(updatedHeading, lat, long);

    // Then we update all our derivative values.
    data.INDICATED_ALTITUDE += data.VERTICAL_SPEED * interval;

    // update our GPS position
    const d = data.AIRSPEED_TRUE * ONE_KTS_IN_KMS * interval;
    const h = degrees(data.PLANE_HEADING_DEGREES_TRUE);
    const { lat: lat2, long: long2 } = getPointAtDistance(lat, long, d, h);
    data.PLANE_LATITUDE = radians(lat2);
    data.PLANE_LONGITUDE = radians(long2);
  }

  get(props) {
    const response = {};
    props.forEach((name) => {
      response[name] = this.data[name.replace(/:.*/, ``)];
    });
    return response;
  }

  set(name, value) {
    // console.log(`setting ${name} to ${value}`);
    const { data } = this;
    if (name === `GENERAL_ENG_THROTTLE_LEVER_POSITION`) {
      if (value < 0.01) value = 0;
      data.GENERAL_ENG_THROTTLE_LEVER_POSITION = value;
    }
    if (name === `ELEVATOR_TRIM_POSITION`) {
      data.ELEVATOR_TRIM_POSITION = value;
      data.ELEVATOR_TRIM_PCT = constrainMap(value, -PI / 2, PI / 2, 1, -1);
    }
    if (name === `AILERON_TRIM_PCT`) {
      data.AILERON_TRIM_PCT = value / 100;
    }
    if (name === `AUTOPILOT_HEADING_LOCK_DIR`) {
      data.AUTOPILOT_HEADING_LOCK_DIR = value;
    }
  }

  trigger(name) {
    // console.log(`triggering event ${name}`);
    const { data } = this;
    if (name === `AP_MASTER`) {
      data.AUTOPILOT_MASTER = flip(data.AUTOPILOT_MASTER);
    }
    if (name === `TOGGLE_TAILWHEEL_LOCK`) {
      data.TAILWHEEL_LOCK_ON = flip(data.TAILWHEEL_LOCK_ON);
    }
    if (name === `PARKING_BRAKES`) {
      data.BRAKE_PARKING_POSITION = flip(data.BRAKE_PARKING_POSITION);
    }
    if (name === `GEAR_UP`) {
      data.GEAR_HANDLE_POSITION = 0;
      data.GEAR_POSITION = 1;
    }
    if (name === `GEAR_DOWN`) {
      data.GEAR_HANDLE_POSITION = 100;
      data.GEAR_POSITION = 0;
    }
  }
}
