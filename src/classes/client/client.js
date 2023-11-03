import { AutoPilot } from "../../api/autopilot/autopilot.js";
import { FlightInformation } from "./flight-information.js";

let fok = undefined;
if (process.argv.includes(`--owner`)) {
  fok = process.env.FLIGHT_OWNER_KEY;
}

let reconnection = false;

/**
 * Our client class
 */
export class ClientClass {
  #flightInfo;
  #reconnection;

  constructor() {
    const tryConnect = async () => {
      if (this.server) return;
      console.log(`trying to connect...`);
      this.setState({
        autopilot: false,
        crashed: false,
        flightData: false,
        flightModel: false,
        flying: false,
        MSFS: false,
        paused: false,
      });
      this.reconnect();
      this.#reconnection = setTimeout(tryConnect, 5000);
    };
    setTimeout(tryConnect, 5000);
  }

  /**
   * ...docs go here...
   */
  async onConnect() {
    clearTimeout(this.#reconnection);
    console.log(`client connected to server`);
    // Set up our "initial" state. However, we might already have been
    // sent events by the server by the time this kicks in, so we need
    // to make sure to not overwrite any values that are "not nullish".
    this.setState({
      autopilot:
        this.state.autopilot ?? (await this.server.autopilot.getParameters()),
      crashed: this.state.crashed ?? false,
      flightData: this.state.flightData ?? false,
      flightModel: this.state.flightModel ?? false,
      flying: this.state.flying ?? false,
      MSFS: this.state.MSFS ?? false,
      paused: this.state.paused ?? false,
    });
    if (fok) {
      this.setState({
        authenticated: await this.server.authenticate(fok),
      });
    }
    await this.server.api.register(`MSFS`);
  }

  async onDisconnect() {
    console.log(`disconnected`);
    this.setState({ flying: false });
    this.#tryReconnect();
  }

  async #tryReconnect() {
    if (this.server) {
      return console.log(`reconnected`);
    }
    console.log(`trying reconnect`);
    this.reconnect();
    console.log(`setting timeout`);
    setTimeout(() => this.#tryReconnect(), 5000);
  }

  /**
   * ...docs go here
   * @param {*} browser
   */
  async onBrowserConnect(browser) {
    this.setState({ connected: true });
  }

  /**
   * ...docs go here
   * @param {*} browser
   */
  async onBrowserDisconnect(browser) {
    this.setState({ connected: false });
  }

  /**
   * ...docs go here
   * @param {Boolean} value
   */
  async onMSFS(value) {
    this.setState({ MSFS: value });
  }

  /**
   * ...docs go here...
   * @param {AutoPilot} autopilot
   */
  async onAutoPilot(autopilot) {
    this.setState({ autopilot });
  }

  /**
   * ...docs go here...
   */
  async pause() {
    this.setState({ paused: true });
  }

  /**
   * ...docs go here...
   */
  async unpause() {
    this.setState({ paused: false });
  }

  /**
   * ...docs go here...
   */
  async crashed() {
    this.setState({ crashed: true });
  }

  /**
   * ...docs go here...
   */
  async crashReset() {
    this.setState({ crashed: false });
  }

  /**
   * ...docs go here...
   * @param {Number} camera
   * @param {Number} cameraSubState
   */
  async setCamera(camera, cameraSubState) {
    this.setState({
      camera: {
        main: camera,
        sub: cameraSubState,
      },
    });
  }

  /**
   * ...docs go here...
   * @param {Boolean} flying
   */
  async setFlying(flying) {
    const wasFlying = this.state.flying;
    this.setState({ flying });
    if (flying && !wasFlying) {
      this.setState({ crashed: false, MSFS: true });
      this.#flightInfo ??= new FlightInformation(this.server.api);
      this.setState(await this.#flightInfo.update());
      this.#poll();
    }
  }

  /**
   * ...docs go here...
   */
  async #poll() {
    if (!this.state.flying) return;
    const flightData = await this.#flightInfo.updateFlight();
    if (flightData) {
      this.setState({ flightData });
    } else {
      console.log(`flight data was empty?`);
    }
    setTimeout(() => this.#poll(), 1000);
  }
}
