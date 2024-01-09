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
    this.model = false;
    this.data = false;
    this.general = {
      inGame: false,
      planeActive: false,
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
    const data = await api.get(...FLIGHT_MODEL);
    if (!data) return (this.model = false);

    convertValues(data);
    renameData(data);

    // Create a convenience value for trimming
    data.pitchTrimLimit = [data.trimUpLimit ?? 10, data.trimDownLimit ?? -10];

    // Check whether this plane has shitty trimming
    checkTrimCapability(data);

    return (this.model = data);
  }

  /**
   * ...docs go here...
   */
  async updateFlight() {
    const data = await api.get(...FLIGHT_DATA);
    if (!data) return (this.data = false);

    convertValues(data);
    renameData(data, this.data);

    // Create a convenience value for "are any engines running?"
    data.enginesRunning = [1, 2, 3, 4].reduce(
      (t, num) => t || data[`ENG_COMBUSTION:${num}`],
      false
    );

    // Create a convenience value for "is the plane powered on?"
    data.hasPower = data.ampLoad !== 0 || data.busVoltage !== 0;

    // Create a convenience value for compass correction:
    data.declination = data.trueHeading - data.heading;

    this.setGeneralProperties(data);
    return (this.data = data);
  }

  // Set a few general properties so we don't have to
  // constantly derive them on the client side:
  setGeneralProperties(data) {
    const { onGround, hasPower, enginesRunning, speed, camera } = data;
    const inGame = 2 <= camera && camera < 9;
    const planeActive = inGame ? hasPower || enginesRunning : false;
    const moving = speed > 0;
    const flying = !onGround;
    Object.assign(this.general, { inGame, planeActive, moving, flying });
  }
}
