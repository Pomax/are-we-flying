import * as geomag from "geomag";
import { getInitialState } from "./fake-flight-data.js";
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
  lerp,
  radians,
  runLater,
} from "../../../utils/utils.js";

const { abs, sign, tan, PI } = Math;
const UPDATE_FREQUENCY = 450;
const startTime = Date.now();

/**
 * ...
 */
export class MockPlane {
  constructor() {
    this.reset();
    this.playbackRate = 1;
    this.run();
  }

  reset() {
    this.data = getInitialState();
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
      this.update(ms);
    } else {
      callTime = previousCallTime;
    }
    runLater(() => this.run(callTime), UPDATE_FREQUENCY);
  }

  /**
   * This function basically runs the world's worst flight
   * simulator: we're not even going to bother with a flight
   * model and computing forces, even though we're trying to
   * work with a trim-based autopilot, we're just going to
   * constrainMap and interpolate our way to victory.
   */
  update(ms) {
    console.log(`- [${((Date.now() - startTime) / 1000).toFixed(1)}] update`);
    // If the interval is too long, "do nothing",
    // so we don't teleport around when the OS decides
    // to throttle or suspend a process.
    if (ms > 5 * UPDATE_FREQUENCY) return;

    // allow "fast forward"
    const interval = (ms / 1000) * this.playbackRate;

    // First, use the code we already wrote to data-fy the flight.
    const { data } = this;
    const converted = Object.assign({}, data);
    convertValues(converted);
    renameData(converted, this.previousValues);
    this.previousValues = converted;

    // Update the current altitude by turning the current elevator
    // trim position into a target pitch and vertical speed, and then
    // applying a partial change so that the plane "takes a while to
    // get there" because otherwise our autopilot won't work =)
    const { pitchTrim, lat, long } = converted;
    const p = sign(pitchTrim) * (abs(pitchTrim) / 100) ** 1.2;
    const pitchAngle = constrainMap(p, -1, 1, -3, 3);
    data.PLANE_PITCH_DEGREES = radians(pitchAngle);

    // Okay fine, there's *one* bit of real math: converting
    // the plane's pitch into a vertical speed, since we know
    // how fast we're going, and thus how many feet per second
    // we're covering, and thus how many vertical feet that
    // works out to. This is, of course, *completely wrong*
    // compared to the real world, but: this is a mock.
    // We don't *need* realistic, we just need good enough.
    const newVS =
      tan(-data.PLANE_PITCH_DEGREES) *
      FPS_PER_KNOT *
      data.AIRSPEED_TRUE *
      60 *
      5;
    data.VERTICAL_SPEED = lerp(0.15, data.VERTICAL_SPEED, newVS);

    // Then update our current speed, based on the throttle lever,
    // with a loss (or gain) offset based on the current vertical
    // speed, so the autothrottle/targetVS code has something to
    // work with.
    const throttle = data.GENERAL_ENG_THROTTLE_LEVER_POSITION;
    const vsOffset = constrainMap(newVS, -16, 16, -10, 10);
    const speed = constrainMap(throttle, 0, 100, 0, 150) - vsOffset;
    data.AIRSPEED_TRUE = lerp(0.8, data.AIRSPEED_TRUE, speed);
    data.AIRSPEED_INDICATED = 0.95 * data.AIRSPEED_TRUE;

    // Update the current bank and turn rate by turning the current
    // aileron trim position into a values that we then "lerp to" so
    // that the change is gradual.
    const { aileronTrim } = converted;
    const newBankDegrees = constrainMap(aileronTrim, -100, 100, 180, -180);
    const newBank = 100 * radians(newBankDegrees);
    data.PLANE_BANK_DEGREES = lerp(0.9, data.PLANE_BANK_DEGREES, newBank);
    let turnRate = aileronTrim * 30;
    data.TURN_INDICATOR_RATE = lerp(0.9, data.TURN_INDICATOR_RATE, turnRate);

    // Update heading, taking into account that the slower we go, the
    // faster we can turn, and the faster we go, the slower we can turn:
    const { heading } = converted;
    const speedFactor = constrainMap(speed, 100, 150, 4, 1);
    const updatedHeading = heading + speedFactor * turnRate * interval;
    this.setHeading(updatedHeading, lat, long);

    // Update our altitude values...
    const { alt } = converted;
    const newAltitude = alt + data.VERTICAL_SPEED * interval;
    this.setAltitude(newAltitude, lat, long);

    // And update our GPS position.
    const d = data.AIRSPEED_TRUE * ONE_KTS_IN_KMS * interval;

    // Why are we teleporting?
    if (d > 1) {
      console.log(interval, converted);
      process.exit(-1);
    }

    const h = degrees(data.PLANE_HEADING_DEGREES_TRUE);
    const { lat: lat2, long: long2 } = getPointAtDistance(lat, long, d, h);
    data.PLANE_LATITUDE = radians(lat2);
    data.PLANE_LONGITUDE = radians(long2);
  }

  /**
   * We accept all of four variables, one each so that
   * ATT, ALT, and LVL modes work, and then one for updating
   * the heading bug, because we use that in the browser.
   */
  set(name, value) {
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
}
