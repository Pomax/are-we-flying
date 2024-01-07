import {
  FLIGHT_MODEL,
  FLIGHT_DATA,
  convertValues,
  renameData,
} from "./flight-values.js";
import { checkTrimCapability } from "./flight-exceptions.js";

let api;

/**
 *
 *  Adds two custom flight data properties:
 *
 *   - ENGINES_RUNNING: bool
 *   - POWERED_UP: bool
 *
 */
export class FlightInformation {
  /**
   * ...docs go here...
   */
  constructor(_api) {
    api = _api;
    this.reset();
  }

  /**
   * ...docs go here...
   */
  reset() {
    this.flightModel = false;
    this.flightData = false;
    this.general = {
      inGame: false,
      planeActive: false,
      crashed: false,
      moving: false,
      flying: false,
    };
  }

  /**
   * ...docs go here...
   */
  async update() {
    try {
      if (!api.connected) throw new Error(`API not connected`);
      await Promise.all([this.updateModel(), this.updateFlight()]);
    } catch (e) {
      console.warn(e);
    }
    return this;
  }

  /**
   * ...docs go here...
   */
  async updateModel() {
    const modelData = await api.get(...FLIGHT_MODEL);
    if (!modelData) {
      return (this.flightModel = false);
    }

    convertValues(modelData);
    renameData(modelData);

    // Create a convenience value for trimming
    modelData.pitchTrimLimit = [
      modelData.trimUpLimit ?? 10,
      modelData.trimDownLimit ?? -10,
    ];

    // Check whether this plane has shitty trimming
    checkTrimCapability(modelData);

    return (this.flightModel = modelData);
  }

  /**
   * ...docs go here...
   */
  async updateFlight() {
    const flightData = await api.get(...FLIGHT_DATA);
    if (!flightData) return (this.flightData = false);

    convertValues(flightData);
    renameData(flightData, this.flightData);

    // Create a convenience value for "are any engines running?"
    flightData.enginesRunning = [1, 2, 3, 4].reduce(
      (t, num) => t || flightData[`ENG_COMBUSTION:${num}`],
      false
    );

    // Create a convenience value for "is the plane powered on?"
    flightData.hasPower =
      flightData.ampLoad !== 0 || flightData.busVoltage !== 0;

    // Create a convenience value for compass correction:
    flightData.declination = flightData.trueHeading - flightData.heading;

    this.setGeneralProperties(flightData);
    return (this.flightData = flightData);
  }

  // Set a few general properties so we don't have to
  // constantly derive them on the client side:
  setGeneralProperties(flightData) {
    const { onGround, hasPower, enginesRunning, speed, camera } = flightData;
    const inGame = 2 <= camera && camera < 9;
    const planeActive = inGame ? hasPower || enginesRunning : false;
    const moving = speed > 0;
    const flying = !onGround;
    Object.assign(this.general, { inGame, planeActive, moving, flying });
  }
}
