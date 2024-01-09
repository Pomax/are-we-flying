// Load in our environment variables
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../../.env` });

// Do we have a flight owner key that we need to authenticate with?
const username = process.env.FLIGHT_OWNER_USERNAME;
const password = process.env.FLIGHT_OWNER_PASSWORD;

// (Re)connection values. The "run later" is essentially just
// a setTimeout that won't crash just because an error got thrown.
import { runLater } from "../../utils/utils.js";
const RECONNECT_TIMEOUT_IN_MS = 5000;
let reconnection = false;

/**
 * Our client class
 */
export class ClientClass {
  /**
   * When our client starts up, start a (re)connect attempt.
   */
  init() {
    this.#resetState();
    runLater(() => this.#tryReconnect(), RECONNECT_TIMEOUT_IN_MS);
  }

  #resetState() {
    this.setState({
      autopilot: null,
      crashed: false,
      flightInformation: false,
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
      clearTimeout(reconnection);
      console.log(`reconnected`);
      return;
    }
    console.log(`trying to reconnect to the server...`);
    this.#resetState();
    this.reconnect();
    reconnection = runLater(
      () => this.#tryReconnect(),
      RECONNECT_TIMEOUT_IN_MS
    );
  }

  /**
   * ...docs go here...
   */
  async onConnect() {
    clearTimeout(reconnection);
    console.log(`client connected to server`);
    this.setState({
      authenticated: await this.server.authenticate(username, password),
      serverConnection: true,
    });
    await this.server.api.register(`MSFS`);
  }

  async onDisconnect() {
    console.log(`disconnected`);
    this.setState({
      flying: false,
      MSFS: false,
      serverConnection: false,
    });
    this.#tryReconnect();
  }

  /**
   * ...docs go here
   */
  async onBrowserConnect(browser) {
    this.setState({ browserConnected: true });
  }

  /**
   * ...docs go here
   */
  async onBrowserDisconnect(browser) {
    this.setState({ browserConnected: false });
  }

  /**
   * ...docs go here
   */
  async onMSFS(value) {
    this.setState({ MSFS: value });
  }

  /**
   * ...docs go here...
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
   */
  async setFlightInformation(flightInformation) {
    const prevInformation = this.state.flightInformation;
    const { planeActive: wasPlaneActive } = prevInformation.general ?? {};
    const { planeActive } = flightInformation.general;
    if (!wasPlaneActive && planeActive) {
      console.log(`starting a new flight...`);
      this.setState({
        crashed: false,
        MSFS: true,
        paused: false,
      });
    }
    this.setState({ flightInformation });
  }
}
