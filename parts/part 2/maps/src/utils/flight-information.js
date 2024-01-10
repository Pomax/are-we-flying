import {
  FLIGHT_MODEL,
  FLIGHT_DATA,
  convertValues,
  renameData,
} from "./flight-values.js";

let api;

export class FlightInformation {
  constructor(_api) {
    api = _api;
    this.reset();
  }

  reset() {
    this.model = false;
    this.data = false;
    this.general = {
      flying: false,
      inGame: false,
      moving: false,
      planeActive: false,
    };
  }

  // We'll have three update functions. Two for the two types
  // of data, and then this one, which is a unified "call both":
  async update() {
    try {
      if (!api.connected) throw new Error(`API not connected`);
      await Promise.all([this.updateModel(), this.updateFlight()]);
    } catch (e) {
      console.warn(e);
    }
    return this;
  }

  // Then our "update the model" code:
  async updateModel() {
    const modelData = await api.get(...FLIGHT_MODEL);
    if (!modelData) return (this.flightModel = false);
    // Make sure to run our quality-of-life functions:
    convertValues(modelData);
    renameData(modelData);
    return (this.model = modelData);
  }

  // And our "update the current flight information" code:
  async updateFlight() {
    const flightData = await api.get(...FLIGHT_DATA);
    if (!flightData) return (this.flightData = false);
    // Make sure to run our quality-of-life functions here, too:
    convertValues(flightData);
    renameData(flightData, this.flightData);

    // Create a convenience value for "are any engines running?",
    // which would otherwise require checking four separate variables:
    flightData.enginesRunning = [1, 2, 3, 4].reduce(
      (t, num) => t || flightData[`ENG_COMBUSTION:${num}`],
      false
    );

    // Create a convenience value for "is the plane powered on?",
    // which would otherwise require checking two variables:
    flightData.hasPower =
      flightData.ampLoad !== 0 || flightData.busVoltage !== 0;

    // And create a convenience value for compass correction:
    flightData.declination = flightData.trueHeading - flightData.heading;

    // Then update our general flight values and return;
    this.setGeneralProperties(flightData);
    return (this.data = flightData);
  }

  // The general properties are mostly there so we don't have to
  // constantly derive them on the client side:
  setGeneralProperties(flightData) {
    const { onGround, hasPower, enginesRunning, speed, camera } = flightData;
    const inGame = 2 <= camera && camera < 9;
    const flying = inGame ? !onGround : false;
    const moving = inGame ? speed > 0 : false;
    const planeActive = inGame ? hasPower || enginesRunning : false;
    Object.assign(this.general, { flying, inGame, planeActive, moving });
  }
}
