import {
  FLIGHT_MODEL,
  FLIGHT_DATA,
  convertValues,
  renameData,
} from "./flight-values.js";
import { getHeadingFromTo } from "./utils.js";

const { abs } = Math;

let api;

export class FlightInformation {
  constructor(_api) {
    api = FlightInformation.api = _api;
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
    api ??= FlightInformation.api;
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
    const data = await api.get(...FLIGHT_MODEL);
    if (!data) return (this.flightModel = false);

    // Make sure to run our quality-of-life functions:
    convertValues(data);
    renameData(data);

    // Does this plane have aileron trim?
    const noAileron = [`Turbo Arrow`];
    data.hasAileronTrim = !noAileron.some((t) =>
      data.title.toLowerCase().includes(t.toLowerCase())
    );

    const acrobatic = ["Pitts", "Gee Bee R3", "Top Rudder", "Extra 330"];
    data.isAcrobatic = acrobatic.some((t) =>
      data.title.toLowerCase().includes(t.toLowerCase())
    );

    const stubborn = [`Kodiak`, `King Air`];
    data.isStubborn = stubborn.some((t) =>
      data.title.toLowerCase().includes(t.toLowerCase())
    );

    // Create a convenience value for trimming
    data.pitchTrimLimit = [data.trimUpLimit ?? 10, data.trimDownLimit ?? -10];
    return (this.model = data);
  }

  // And our "update the current flight information" code:
  async updateFlight() {
    const data = await api.get(...FLIGHT_DATA);
    if (!data) return (this.data = false);
    // Make sure to run our quality-of-life functions here, too:
    convertValues(data);
    renameData(data, this.data);

    // Create a convenience value for "are any engines running?",
    // which would otherwise require checking four separate variables:
    data.enginesRunning = [1, 2, 3, 4].reduce(
      (t, num) => t || data[`ENG_COMBUSTION:${num}`],
      false
    );

    // Create a convenience value for "is the plane powered on?",
    // which would otherwise require checking two variables:
    data.hasPower = data.ampLoad !== 0 || data.busVoltage !== 0;

    // And create a convenience value for compass correction:
    data.declination = data.trueHeading - data.heading;

    // As well as an "actually true heading" based on our
    // GPS track rather than the direction the plane is
    // pointing in
    data.flightHeading = data.trueHeading;
    if (this.data) {
      data.flightHeading =
        getHeadingFromTo(this.data.lat, this.data.long, data.lat, data.long) -
        data.declination;
    }

    // As well as for how many wheels are on the ground
    data.wheelsOnGround = 0;
    if (data.centerWheelOnGround) data.wheelsOnGround++;
    if (data.leftWheelOnGround) data.wheelsOnGround++;
    if (data.rightWheeOnGround) data.wheelsOnGround++;

    // Finally: are we upside down?
    data.upsideDown = abs(data.bank) > 90;
    data.flipped = this.data.upsideDown !== data.upsideDown;

    // Then update our general flight values and return;
    this.setGeneralProperties(data);
    return (this.data = data);
  }

  // The general properties are mostly there so we don't have to
  // constantly derive them on the client side:
  setGeneralProperties(data) {
    const { onGround, hasPower, enginesRunning, speed, camera } = data;
    const inGame = 2 <= camera && camera < 9;
    const flying = inGame ? !onGround : false;
    const moving = inGame ? speed > 0 : false;
    const planeActive = inGame ? hasPower || enginesRunning : false;
    Object.assign(this.general, { flying, inGame, planeActive, moving });
  }
}
