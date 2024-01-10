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
      // This is going to be our "switch panel", where
      // we say which modes are on or off, and for modes
      // with numerical values, what those values are.
      //
      // For now, we're only adding a single switch:
      // the master switch:
      MASTER: false,
    };
    this.onChange(this.getParameters);
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
    const { modes } = this;
    // We'll be building this out as we implement more and
    // more autopilot features, but for now we just "blindly"
    // update values. But, only if they exist in our list of
    // modes: we're not going to let clients just set arbitrary
    // key/value pairs!
    if (modes[key] !== undefined) {
      modes[key] = value;
    }

    // And if switch was for our AP master, log that:
    if (key === `MASTER`) {
      console.log(`${value ? `E` : `Dise`}ngaging autopilot`);
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
    // This is where things will actually happen, rather than
    // putting that code inside `runAutopilot`, because this will
    // eventually be a substantial amount of code.

    // For now, all we do is update the flight information. And
    // you might be thinking "well why not just update only the
    // flight data, the model isn't going to change mid-flight?"
    // but if so: you never turned on the MSFS developer tools,
    // which comes with an aircraft selector so you *can* change
    // the model mid-flight =)
    this.flightInfoUpdateHandler(await this.flightInformation.update());
  }
}
