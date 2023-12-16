import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../../.env` });

// API and Autopilot
import { SystemEvents, MSFS_API } from "msfs-simconnect-api-wrapper";

// we'll make the autopilot hot-reloadable
import { watch } from "../../utils/reload-watcher.js";
import { AutoPilot as ap } from "../../autopilot/autopilot.js";
let AutoPilot = ap;

import { FlightInformation as fi } from "../../utils/flight-information.js";
let FlightInformation = fi;

// routers
import { APIRouter } from "./routers/api-router.js";
import { AutopilotRouter } from "./routers/autopilot-router.js";
import { runLater } from "../../utils/utils.js";

const MOCKED = process.argv.includes(`--mock`);
const { FLIGHT_OWNER_KEY } = process.env;

// globals
let api = false;
let flying = false;
let MSFS = false;
let autopilot = false;

/**
 * Our server-side API
 */
export class ServerClass {
  clients = [];
  #flightInformation = {};

  /**
   * ...docs go here...
   */
  constructor() {
    this.init();
  }

  async init() {
    watch(__dirname, `../../autopilot/autopilot.js`, (lib) => {
      AutoPilot = lib.AutoPilot;
      if (autopilot) {
        Object.setPrototypeOf(autopilot, AutoPilot.prototype);
      }
    });

    watch(__dirname, `../../utils/flight-information.js`, (module) => {
      FlightInformation = module.FlightInformation;
      if (this.#flightInformation) {
        Object.setPrototypeOf(
          this.#flightInformation,
          FlightInformation.prototype
        );
      }
    });

    // Mock (if needed)
    if (MOCKED) {
      const lib = await import("./mocks/mock-api.js");
      const { MOCK_API } = lib;
      api = new MOCK_API();
    } else {
      api = new MSFS_API();
    }

    // Set up the autopilot instance.
    autopilot = new AutoPilot(api, (params) =>
      this.#autopilotBroadcast(params)
    );

    // If we're running a mock, feed the autopilot to the
    // mocked API because it'll need it to run a fake flight.
    if (MOCKED) api.setAutopilot(autopilot);

    // Add "function routing" for the api and autopilot
    this.#setupRouting();

    // Then wait for MSFS to come online
    connectServerToAPI(() => this.#onMSFSConnect());
  }

  /**
   * ...docs go here...
   * @param {*} params
   */
  async #autopilotBroadcast(params) {
    this.clients.forEach((client) => client.onAutoPilot(params));
  }

  /**
   * ...docs go here...
   */
  async #onMSFSConnect() {
    MSFS = true;
    console.log(`Connected to MSFS.`);
    console.log(
      `${(await api.get(`ALL_AIRPORTS`)).ALL_AIRPORTS.length} airports loaded`
    );
    this.#flightInformation = new FlightInformation(api);
    this.#flightInformation.update();
    this.#registerWithAPI(api, autopilot);
    this.clients.forEach((client) => client.onMSFS(MSFS));
    this.#poll();
  }

  /**
   * ...docs go here...
   */
  #setupRouting() {
    // All clients will now be able to call server.api.[...]
    this.api = new APIRouter(api, () => MSFS);

    // All clients will now be able to call server.autopilot.[...]
    this.autopilot = new AutopilotRouter(autopilot, (params) =>
      this.clients.forEach((c) => c.onAutoPilot(params))
    );
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
  }

  /**
   * Run an "are we flying?" check every few seconds
   */
  async #poll() {
    if (!autopilot.autoPilotEnabled) {
      // if the autopilot is running, it will be updating
      // the flight information more frequently than the
      // server would otherwise be updating it.
      this.sendFlightInformation(await this.#flightInformation.update());
    }
    this.#checkFlying();
    runLater(() => this.#poll(), 5000);
  }

  /**
   * If the camera enum is 9 or higher, we are not actually in-game,
   * even if the SIM variable is 1, so we use this to determine whether
   * we're in-flight (because there is no true "are we flyin?" var that
   * can be checked on connect)
   */
  async #checkFlying(client) {
    if (!MSFS) return;

    // console.log(`are we flying?`);
    const data = await this.api.get(
      client,
      `CAMERA_STATE`,
      `CAMERA_SUBSTATE`,
      `SIM_ON_GROUND`,
      `ELECTRICAL_AVIONICS_BUS_VOLTAGE`,
      `ELECTRICAL_TOTAL_LOAD_AMPS`
    );

    if (!data) {
      return console.warn(`there was no camera information? O_o`);
    }

    const {
      CAMERA_STATE: camera,
      CAMERA_SUBSTATE: camerasub,
      SIM_ON_GROUND: onGround,
      ELECTRICAL_AVIONICS_BUS_VOLTAGE: load,
      ELECTRICAL_TOTAL_LOAD_AMPS: amps,
    } = data;

    if (client) {
      client.setCamera(camera, camerasub);
    } else {
      this.clients.forEach((client) => client.setCamera(camera, camerasub));
    }

    const wasFlying = flying;
    flying =
      2 <= camera && camera < 9 && (onGround === 0 || load !== 0 || amps !== 0);

    if (flying !== wasFlying) {
      autopilot.reset(this.#flightInformation, (data) =>
        this.sendFlightInformation(data)
      );
      this.clients.forEach((client) => client.setFlying(flying));
    } else if (client) {
      client.setFlying(flying);
    }
  }

  /**
   * Send updated flight information to each client
   * @param {*} flightInformation
   */
  sendFlightInformation(flightInformation) {
    this.clients.forEach((client) =>
      client.setFlightInformation(flightInformation)
    );
  }

  /**
   * Authentication handle for when a client was started with --owner
   * and it had access to a FLIGHT_OWNER_KEY environment variable.
   */
  async authenticate(client, flightOwnerKey) {
    if (flightOwnerKey !== FLIGHT_OWNER_KEY) return false;
    console.log(`authenticating client`);
    return (client.authenticated = true);
  }
}

function connectServerToAPI(onConnect) {
  api.connect({
    autoReconnect: true,
    retries: Infinity,
    retryInterval: 5,
    onConnect,
    onRetry: (_, s) =>
      console.log(`Can't connect to MSFS, retrying in ${s} seconds`),
  });
}
