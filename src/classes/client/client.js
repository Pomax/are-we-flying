import { FlightInformation } from "./flight-information.js";

/**
 * Our client class
 */
export class ClientClass {
  #flightInfo;

  async onConnect() {
    console.log(`client connected to server`);
    this.#bootstrap();
    this.#flightInfo = new FlightInformation(this.server.api);
    await this.server.api.register(`MSFS`, `SIM`, `VIEW`);
  }

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

  async onBrowserConnect(browser) {
    this.setState({ connected: true });
  }

  async onBrowserDisconnect(browser) {
    this.setState({ connected: false });
  }

  async onMSFS(value) {
    console.log(`onMSFS`, value);
    this.setState({ MSFS: value });
  }

  async onSim([value]) {
    this.setState({ simState: value });
  }

  async onView([value]) {
    this.setState({ view: value });
  }

  async onAutoPilot(autopilot) {
    this.setState({ autopilot });
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

  async setCamera(camera, cameraSubState) {
    this.setState({
      camera: {
        main: camera,
        sub: cameraSubState,
      },
    });
  }

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
