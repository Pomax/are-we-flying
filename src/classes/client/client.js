import url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import { AutoPilot } from "../../api/autopilot/autopilot.js";

// hot reloadable
import { addReloadWatcher } from "../../api/autopilot/reload-watcher.js";
import { FlightInformation as fi } from "./flight-information.js";
let FlightInformation = fi;
addReloadWatcher(
  __dirname,
  `flight-information.js`,
  (lib) => (FlightInformation = lib.FlightInformation)
);

const RECONNECT_TIMEOUT = 5000;

// Do we have a flight owner key that we need to authenticate with?
let fok = undefined;
if (process.argv.includes(`--owner`)) {
  fok = process.env.FLIGHT_OWNER_KEY;
}

/**
 * Our client class
 */
export class ClientClass {
  #reconnection;

  /**
   * @type {FlightInformation}
   */
  #flightInfo;

  /**
   * When our client starts up, also start a reconnect
   * attempt
   */
  init() {
    this.setState({ offline: true });
    setTimeout(() => this.#tryReconnect(), RECONNECT_TIMEOUT);
  }

  /**
   * A private function that lets us reconnect to the server
   * in case it disappears and comes back online.
   */
  async #tryReconnect() {
    if (this.server) {
      clearTimeout(this.#reconnection);
      this.setState({ offline: !this.server });
      console.log(`reconnected`);
      return;
    }
    console.log(`trying to reconnect to the server...`);
    this.reconnect();
    this.#reconnection = setTimeout(
      () => this.#tryReconnect(),
      RECONNECT_TIMEOUT
    );
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
      offline: false,
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
    this.setState({
      flying: false,
      offline: true,
      MSFS: false,
    });
    this.#tryReconnect();
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
    this.setState({ flying, crashed: false, MSFS: true });
    if (flying && !wasFlying) {
      console.log(`starting a new flight...`);
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
