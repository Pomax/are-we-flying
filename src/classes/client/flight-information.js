import { MSFS_API } from "msfs-simconnect-api-wrapper";
import {
  BOOLEAN_VALUES,
  DEGREE_VALUES,
  PERCENT_VALUES,
  FLIGHT_MODEL,
  FLIGHT_DATA,
} from "./flight-values.js";

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
   * @param {MSFS_API} api
   */
  constructor(api) {
    this.api = api;
    this.reset();
  }

  /**
   * ...docs go here...
   */
  reset() {
    this.model = false;
    this.data = false;
  }

  /**
   * ...docs go here...
   */
  async update() {
    const [flightModel, flightData] = await Promise.all([
      this.updateModel(),
      this.updateFlight(),
    ]);
    return { flightModel, flightData };
  }

  /**
   * ...docs go here...
   */
  async updateModel() {
    const modelData = await this.api.get(...FLIGHT_MODEL);
    if (!modelData) {
      return (this.model = false);
    }
    return (this.model = modelData);
  }

  /**
   * ...docs go here...
   */
  async updateFlight() {
    const flightData = await this.api.get(...FLIGHT_DATA);
    if (!flightData) return (this.data = false);

    // Convert values to the units they're supposed to be:
    BOOLEAN_VALUES.forEach((p) => (flightData[p] = !!flightData[p]));
    DEGREE_VALUES.forEach((p) => (flightData[p] *= 180 / Math.PI));
    PERCENT_VALUES.forEach((p) => (flightData[p] *= 100));

    // Convert "feet per second" to "feet per minute"
    flightData.VERTICAL_SPEED *= 60;

    // Create a convenience value for "are any engines running?"
    flightData.ENGINES_RUNNING = [1, 2, 3, 4].reduce(
      (t, num) => t || flightData[`ENG_COMBUSTION:${num}`],
      false
    );

    // Create a convenience value for "is the plane powered on?"
    flightData.POWERED_UP = flightData.ELECTRICAL_TOTAL_LOAD_AMPS !== 0;

    return (this.data = flightData);
  }
}
