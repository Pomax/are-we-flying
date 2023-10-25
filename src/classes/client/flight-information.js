import { MSFS_API } from "msfs-simconnect-api-wrapper";
import { FLIGHT_MODEL, FLIGHT_DATA } from "./flight-values.js";

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

    if (!flightData) {
      return (this.data = false);
    }

    // convert all values in radians to values in degrees
    [
      `PLANE_LATITUDE`,
      `PLANE_LONGITUDE`,
      `PLANE_BANK_DEGREES`,
      `PLANE_HEADING_DEGREES_MAGNETIC`,
      `PLANE_HEADING_DEGREES_TRUE`,
      `PLANE_PITCH_DEGREES`,
      `TURN_INDICATOR_RATE`,
    ].forEach((p) => {
      flightData[p] *= 180 / Math.PI;
    });

    // convert all "numerical booleans" to true booleans
    [
      `AUTOPILOT_MASTER`,
      `ENG_COMBUSTION:1`,
      `ENG_COMBUSTION:2`,
      `ENG_COMBUSTION:3`,
      `ENG_COMBUSTION:4`,
      `SIM_ON_GROUND`,
    ].forEach((p) => {
      flightData[p] = !!flightData[p];
    });

    // convert "feet per second" to "feet per minute"
    flightData[`VERTICAL_SPEED`] *= 60;

    // convert "percent over 100" to percentages
    flightData[`AILERON_TRIM_PCT`] *= 100;
    flightData[`RUDDER_TRIM_PCT`] *= 100;

    // Create a convenience value for "engines running?"
    flightData[`ENGINES_RUNNING`] = [
      `ENG_COMBUSTION:1`,
      `ENG_COMBUSTION:2`,
      `ENG_COMBUSTION:3`,
      `ENG_COMBUSTION:4`,
    ].reduce((t, p) => t || flightData[p], false);

    return (this.data = flightData);
  }
}
