import url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../../.env` });

import { SystemEvents, MSFS_API } from "msfs-simconnect-api-wrapper";
import { APIWrapper } from "./api-wrapper.js";
import { AutoPilot } from "../../api/autopilot/autopilot.js";
import { AutopilotRouter } from "./autopilot-router.js";

const { FLIGHT_OWNER_KEY } = process.env;

import { MOCK_API } from "../../api/mocks/mock-api.js";
const MOCKED = process.argv.includes(`--mock`);
const api = MOCKED ? new MOCK_API() : new MSFS_API();
let flying = false;
let MSFS = false;

/**
 * Our server-side API
 */
export class ServerClass {
  #autopilot;
  clients = [];

  /**
   * ...docs go here...
   */
  constructor() {
    // Set up call handling for API calls
    this.api = new APIWrapper(api, () => MSFS);

    // Set up call handling for autopilot functionality
    const autopilot = (this.#autopilot = new AutoPilot(api, async (params) =>
      this.clients?.forEach((client) => client.onAutoPilot(params))
    ));

    if (MOCKED) {
      api.setAutopilot(autopilot);
    }

    this.autopilot = new AutopilotRouter(this.#autopilot, (params) =>
      this.clients?.forEach((c) => c.onAutoPilot(params))
    );

    // Then wait for MSFS to come online
    const server = this;
    api.connect({
      retries: Infinity,
      retryInterval: 5,
      onConnect: () => {
        MSFS = true;
        console.log(`Connected to MSFS, binding.`);
        this.#registerWithAPI(api, autopilot);
        server.clients.forEach((client) => client.onMSFS(MSFS));
        this.#poll();
      },
      onRetry: (_, s) =>
        console.log(`Can't connect to MSFS, retrying in ${s} seconds`),
    });
  }

  /**
   * ...docs go here...
   * @param {AutoPilot} api
   */
  #registerWithAPI(api, autopilot) {
    console.log(`Registering API server to the general sim events.`);

    api.on(SystemEvents.PAUSED, async () => {
      autopilot.setPaused(true);
      this.clients.forEach((client) => client.pause());
    });

    api.on(SystemEvents.UNPAUSED, async () => {
      autopilot.setPaused(false);
      this.clients.forEach((client) => client.unpause());
    });

    api.on(SystemEvents.CRASHED, async () => {
      this.clients.forEach((client) => client.crashed());
    });

    api.on(SystemEvents.CRASH_RESET, async () => {
      this.clients.forEach((client) => client.crashReset());
    });

    // whenever the sim or view values change, check the camera
    // to determine whether we're actually in-game or not.
    api.on(SystemEvents.SIM, () => this.#checkFlying());
    api.on(SystemEvents.VIEW, () => this.#checkFlying());
  }

  /**
   * When a client connects and MSFS is already connected,
   * tell the client to start a new flight
   */
  async onConnect(client) {
    if (MSFS) client.onMSFS(true);
    await this.#checkFlying(client);
    client.setFlying(flying);
  }

  /**
   * Run an "are we flying?" check every few seconds
   */
  async #poll() {
    this.#checkFlying();
    setTimeout(() => this.#poll(), 5000);
  }

  /**
   * If the camera enum is 9 or higher, we are not actually in-game,
   * even if the SIM variable is 1, so we use this to determine whether
   * we're in-flight (because there is no true "are we flyin?" var that
   * can be checked on connect)
   */
  async #checkFlying(client) {
    if (!MSFS) return;
    console.log(`are we flying?`);
    const data = await this.api.get(
      client,
      `CAMERA_STATE`,
      `CAMERA_SUBSTATE`,
      `SIM_ON_GROUND`,
      `ELECTRICAL_TOTAL_LOAD_AMPS`
    );

    if (!data) {
      return console.warn(`there was no camera information? O_o`);
    }

    const {
      CAMERA_STATE: camera,
      CAMERA_SUBSTATE: camerasub,
      SIM_ON_GROUND: onGround,
      ELECTRICAL_TOTAL_LOAD_AMPS: load,
    } = data;

    if (client) {
      client.setCamera(camera, camerasub);
    } else {
      this.clients.forEach((client) => client.setCamera(camera, camerasub));
    }

    const wasFlying = flying;
    flying = 2 <= camera && camera < 9 && (onGround === 0 || load !== 0);

    if (flying !== wasFlying) {
      if (flying) this.#autopilot.reset();
      this.clients.forEach((client) => client.setFlying(flying));
    } else if (client) {
      client.setFlying(flying);
    }
  }

  /**
   * Authentication handle for when a client was started with --owner
   * and it had access to a FLIGHT_OWNER_KEY environment variable.
   */
  async authenticate(client, flightOwnerKey) {
    if (flightOwnerKey !== FLIGHT_OWNER_KEY) return false;
    console.log(`authenticating client`);
    client.authenticated = true;
  }
}
