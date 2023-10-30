import { AutoPilot } from "../../api/autopilot/autopilot.js";
import { FlightInformation } from "./flight-information.js";

/**
 * Our client class
 */
export class ClientClass {
  #flightInfo;

  /**
   * ...docs go here...
   */
  async onConnect() {
    console.log(`client connected to server`);
    this.#bootstrap();
    this.#flightInfo = new FlightInformation(this.server.api);
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
   * ...docs go here...
   */
  async #bootstrap() {
    this.setState({
      autopilot: await this.server.autopilot.getParameters(),
      crashed: false,
      flightData: false,
      flightModel: false,
      flying: false,
      MSFS: false,
      paused: false,
    });
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
   * ...docs go here
   * @param {[Number]} value
   */
  async onView([value]) {
    this.setState({ view: value });
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
