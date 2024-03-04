// Load in our environment variables now we have
import dotenv from "dotenv";
dotenv.config({ path: `${import.meta.dirname}/../../../../../../.env` });

// Do we have a flight owner key that we need to authenticate with?
let username, password;
if (process.argv.includes(`--owner`)) {
  username = process.env.FLIGHT_OWNER_USERNAME;
  password = process.env.FLIGHT_OWNER_PASSWORD;
}

import { getDistanceBetweenPoints, runLater } from "../../utils/utils.js";

// when we lose the connection to the server, this will be our reconnection interval:
const RECONNECT_TIMEOUT_IN_MS = 5000;

// A timeer variable for when we need to (re)try (re)connecting.
let reconnection;

/**
 * Our client class
 */
export class ClientClass {
  /**
   * When our client starts up, start a "reconnect 5 seconds
   * from now" attempt, cleaned up when we connect.
   */
  init() {
    this.#resetState();
    runLater(() => this.#tryReconnect(), RECONNECT_TIMEOUT_IN_MS);
  }

  /**
   * A private function that sets our state to a "starting default" state.
   */
  #resetState() {
    // "setState" is a magic function that comes with socketless, and will
    // automatically lead to a browser sync, if there's a browser connected.
    this.setState({
      airportData: undefined,
      crashed: false,
      flightInformation: {},
      flying: false,
      MSFS: false,
      paused: false,
      serverConnection: false,
    });
  }

  /**
   * A private function that lets us reconnect to the server
   * in case it disappears and comes back online.
   */
  async #tryReconnect() {
    if (this.server) {
      clearTimeout(reconnection);
      return console.log(`reconnected`);
    }
    console.log(`trying to reconnect to the server...`);
    this.#resetState();
    this.reconnect(); // <- this is also a magic socketless function
    reconnection = setTimeout(
      () => this.#tryReconnect(),
      RECONNECT_TIMEOUT_IN_MS
    );
  }

  /**
   * The main role of our client is to encode a state that can be
   * automatically communicated to the browser. As such, really
   * the only thing we're doing si setting up a state, and then
   * updating that based on server signals.
   */
  async onConnect() {
    clearTimeout(reconnection);
    console.log(`client connected to server`);
    this.setState({
      authenticated: await this.server.authenticate(username, password),
      serverConnection: true,
    });
    if (this.state.authenticated) {
      await this.server.api.register(`MSFS`);
    }
  }

  /**
   * If we become disconnected from the server, go into a
   * "holding pattern" where we check whether the server
   * is back every few seconds.
   */
  async onDisconnect() {
    // First, since we obviously don't have a server anymore,
    // we won't be informed about whether or not we're still
    // flying, or really anything about the flight at all, so
    // record that we're not flying (anymore).
    this.setState({
      flying: false,
      MSFS: false,
      serverConnection: false,
    });
    // Then start the reconnect cycle
    this.#tryReconnect();
  }

  // Record that a connection has been established. Since the state
  // gets automatically synced at the browser, this means the browser
  // can also see that `this.state.connected` is true.
  async onBrowserConnect(browser) {
    this.setState({ browserConnected: true });
  }

  // And the opposite when the browser disconnects, of course:
  async onBrowserDisconnect(browser) {
    this.setState({ browserConnected: false });
  }

  // Then a set of self-explanatory functions based on events:
  async onMSFS(value) {
    this.setState({ MSFS: value });
  }

  async pause() {
    this.setState({ paused: true });
  }

  async unpause() {
    this.setState({ paused: false });
  }

  async crashed() {
    this.setState({ crashed: true });
  }

  async crashReset() {
    this.setState({ crashed: false });
  }

  async setFlightInformation(flightInformation) {
    const lat = this.state.flightInformation?.data?.lat;
    const long = this.state.flightInformation?.data?.long;

    if (lat && long) {
      this.airportData ??= { lat: 0, long: 0 };
      const lat2 = this.airportData.lat;
      const long2 = this.airportData.long;
      const d = getDistanceBetweenPoints(lat, long, lat2, long2);
      if (d > 10) {
        const varName = `NEARBY_AIRPORTS:25`;
        const data = await this.server.api.get(varName);
        const airports = data[varName];
        this.airportData = { airports, lat, long };
      }
    }

    this.setState({ airportData: this.airportData, flightInformation });
  }

  async onAutoPilot(params) {
    this.setState({ autopilot: params });
  }
}
