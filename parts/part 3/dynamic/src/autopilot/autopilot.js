import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import { watch } from "../utils/reload-watcher.js";

import { runLater } from "../utils/utils.js";

// Import our new constants
import { LEVEL_FLIGHT, ALTITUDE_HOLD } from "../utils/constants.js";

// and import the "fly level" code using our hot-reloading technique
let { flyLevel } = await watch(
  __dirname,
  `fly-level.js`,
  (lib) => (flyLevel = lib.flyLevel)
);

let { altitudeHold } = await watch(
  __dirname,
  `altitude-hold.js`,
  (lib) => (altitudeHold = lib.altitudeHold)
);

const AUTOPILOT_INTERVAL = 500;

export class AutoPilot {
  constructor(api, onChange = () => {}) {
    this.api = api;
    this.onChange = async (update) => {
      onChange(update ?? (await this.getParameters()));
    };
    this.reset();
  }

  reset(flightInformation, flightInfoUpdateHandler) {
    console.log(`resetting autopilot`);
    this.flightInformation = flightInformation;
    this.flightInfoUpdateHandler = flightInfoUpdateHandler;
    this.paused = false;
    this.modes = {
      MASTER: false,
      // Our first real autopilot mode!
      [LEVEL_FLIGHT]: false,
      [ALTITUDE_HOLD]: false,
    };
    this.resetTrim();
    this.onChange();
  }

  resetTrim() {
    this.trim = {
      pitch: 0,
      roll: 0,
      yaw: 0,
    };
  }

  get autoPilotEnabled() {
    return this.modes.MASTER;
  }

  disable() {
    this.setParameters({ MASTER: false });
  }

  setPaused(value) {
    this.paused = value;
  }

  async getParameters() {
    return { ...this.modes };
  }

  async setParameters(params) {
    const { api, modes } = this;
    const wasEnabled = modes.MASTER;
    Object.entries(params).forEach(([key, value]) => {
      this.setTarget(key, value);
    });

    // notify clients of all the changes that just occurred:
    this.onChange();

    // Then, MSFS might not actually be running...
    if (!this.api.connected) return;

    // but if it is, and we just turned our own autopilot on, then we'll
    // want to make sure to turn off the in-game autopilot (if it's on),
    // before we start to run our own code, so that it doesn't interfere:
    if (!wasEnabled && modes.MASTER) {
      const { AUTOPILOT_MASTER: gameAP } = await api.get(`AUTOPILOT_MASTER`);
      if (gameAP === 1) api.trigger(`AP_MASTER`);
      // now we can safely run our own autopilot code.
      this.runAutopilot();
    }
  }

  async setTarget(key, value) {
    const { api, modes, trim } = this;

    if (modes[key] !== undefined) {
      modes[key] = value;
    }

    // If the switch was for our AP master, log that:
    if (key === `MASTER`) {
      console.log(`${value ? `E` : `Dise`}ngaging autopilot`);
    }

    // When we turn the wing leveler on, make sure to copy the in-game
    // trim setting over into our trim vector. Pretty important!
    if (key === LEVEL_FLIGHT && value === true) {
      const { AILERON_TRIM_PCT: roll } = await api.get("AILERON_TRIM_PCT");
      trim.roll = roll;
      console.log(`Engaging wing leveler. Initial trim:`, trim.roll);
    }

    // And we do the same if altitude hold got turned on.
    if (key === ALTITUDE_HOLD && value === true) {
      const { ELEVATOR_TRIM_POSITION: pitch } = await api.get(
        "ELEVATOR_TRIM_POSITION"
      );
      trim.pitch = pitch;
      console.log(`Engaging altitude hold. Initial trim:`, trim.pitch);
    }
  }

  async runAutopilot() {
    const { api, modes, paused } = this;

    // Sanity check: *should* this code run?
    if (!api.connected) return;
    if (!modes.MASTER) return;

    // If the autopilot is enabled, even if there are errors due to
    // MSFS glitching, or the DLL handling glitching, or values somehow
    // having gone missing, or our own code throwing errors that we
    // need to fix, etc. etc: schedule the next call, and hopefully
    // things work by then.
    runLater(() => this.runAutopilot(), AUTOPILOT_INTERVAL);

    // If the game is paused, then don't run the autopilot code, but
    // only for "this call". Maybe by the next call the game won't be
    // paused anymore.
    if (paused) return;

    // And remember: *never* allow code to crash the server:
    try {
      await this.run();
      this.onChange();
    } catch (e) {
      console.error(e);
    }
  }

  async run() {
    const { modes, flightInformation } = this;

    // Get the most up to date flight information:
    this.flightInfoUpdateHandler(await flightInformation.update());

    // Then run a single iteration of the wing leveler and altitude holder:
    if (modes[LEVEL_FLIGHT]) flyLevel(this, flightInformation);
    if (modes[ALTITUDE_HOLD]) altitudeHold(this, flightInformation);
  }
}
