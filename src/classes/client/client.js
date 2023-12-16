import { runLater } from "../../utils/utils.js";

const RECONNECT_TIMEOUT_IN_MS = 5000;

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
   * When our client starts up, also start a reconnect
   * attempt
   */
  init() {
    this.#resetState();
    runLater(() => this.#tryReconnect(), RECONNECT_TIMEOUT_IN_MS);
  }

  #resetState() {
    this.setState({
      autopilot: null,
      crashed: false,
      flightData: false,
      flightModel: false,
      flying: false,
      MSFS: false,
      serverConnection: false,
      paused: true,
    });
  }

  /**
   * A private function that lets us reconnect to the server
   * in case it disappears and comes back online.
   */
  async #tryReconnect() {
    if (this.server) {
      clearTimeout(this.#reconnection);
      console.log(`reconnected`);
      return;
    }
    console.log(`trying to reconnect to the server...`);
    this.#resetState();
    this.reconnect();
    this.#reconnection = runLater(
      () => this.#tryReconnect(),
      RECONNECT_TIMEOUT_IN_MS
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
      serverConnection: true,
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
      MSFS: false,
      serverConnection: true,
    });
    this.#tryReconnect();
  }

  /**
   * ...docs go here
   * @param {*} browser
   */
  async onBrowserConnect(browser) {
    this.setState({ browserConnected: true });
  }

  /**
   * ...docs go here
   * @param {*} browser
   */
  async onBrowserDisconnect(browser) {
    this.setState({ browserConnected: false });
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
      console.log(`starting a new flight...`);
      this.setState({ crashed: false, MSFS: true, paused: false });
    }
  }

  /**
   * ...docs go here...
   * @param {*} param0
   */
  async setFlightInformation({ flightData, flightModel }) {
    this.setState({ flightData, flightModel });
  }
}
