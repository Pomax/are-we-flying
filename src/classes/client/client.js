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
    await this.server.api.register(`MSFS`, `SIM`, `VIEW`);
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
      simState: 0,
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
    console.log(`onMSFS`, value);
    this.setState({ MSFS: value });
  }

  /**
   * ...docs go here
   * @param {[Number]} value
   */
  async onSim([value]) {
    this.setState({ simState: value });
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
    console.log(`flying:`, flying);
    const wasFlying = this.state.flying;
    this.setState({ flying });
    if (flying && !wasFlying) {
      console.log(`new flight`);
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
    // Check to see if there's updated flight data
    const flightData = await this.#flightInfo.updateFlight();
    // If this is false, we're no longer flying.
    if (!flightData) {
      return this.setState({
        flying: false,
        flightData: false,
      });
    }
    // If it's not, update our state and repoll 1.0 seconds from now.
    this.setState({ flightData });
    setTimeout(() => this.#poll(), 1000);
  }
}
