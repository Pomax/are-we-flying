import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../../.env` });

// The most important of this whole thing:
import { MSFS_API } from "msfs-simconnect-api-wrapper";

// Some utility imports
import { watch } from "../../utils/reload-watcher.js";
import { runLater } from "../../utils/utils.js";
import {
  connectServerToAPI,
  registerWithAPI,
  checkGameState,
} from "./helpers.js";

// we'll make the autopilot hot-reloadable:
import { AutoPilot as ap } from "../../autopilot/autopilot.js";
let AutoPilot = ap;
let autopilot = false;
watch(__dirname, `../../autopilot/autopilot.js`, (module) => {
  AutoPilot = module.AutoPilot;
  if (autopilot) Object.setPrototypeOf(autopilot, AutoPilot.prototype);
});

// as well as our flight information:
import { FlightInformation as fi } from "../../utils/flight-information.js";
let FlightInformation = fi;
let flightInformation = false;
watch(__dirname, `../../utils/flight-information.js`, (module) => {
  FlightInformation = module.FlightInformation;
  if (flightInformation)
    Object.setPrototypeOf(flightInformation, FlightInformation.prototype);
});

// routers
import { APIRouter } from "./routers/api-router.js";
import { AutopilotRouter } from "./routers/autopilot-router.js";

// get our external runtime parameters:
const MOCKED = process.argv.includes(`--mock`);
const { FLIGHT_OWNER_KEY } = process.env;

// and our internal parameters:
const POLLING_INTERVAL = 2500;

// globals
let api = false;
let MSFS = false;

/**
 * Our server-side API, which exposes one function itself,
 * and delegates the rest to its .api and .autopilot routers.
 */
export class ServerClass {
  #authenticatedClients = [];

  async init() {
    const { clients } = this;
    console.log(`clients:`, clients);

    // Mock (if needed)
    if (MOCKED) {
      const { MOCK_API } = await import("./mocks/mock-api.js");
      api = new MOCK_API();
    } else {
      api = new MSFS_API();
    }

    // Set up the autopilot instance.
    autopilot = new AutoPilot(api, (params) => {
      clients.forEach((client) => client.onAutoPilot(params));
    });

    // If we're running a mock, feed the autopilot to the
    // mocked API because it'll need it to run a fake flight.
    if (MOCKED) api.setAutopilot(autopilot);

    // Set up call routing so that clients can call this.server.api.[...]
    // in order to talk directly to the API, but only allow this for
    // authenticated clients, rather than everyone. Everyone else just gets
    // the state updates through their setFlightInformation() function.
    this.api = this.lock(new APIRouter(api), (client) =>
      this.#authenticatedClients.includes(client)
    );

    // And set up call routing for the autopilot in the same way. Only
    // authenticated clients are allowed to mess with the AP settings.
    this.autopilot = this.lock(new AutopilotRouter(autopilot), (client) =>
      this.#authenticatedClients.includes(client)
    );

    // Then wait for MSFS to come online
    connectServerToAPI(api, async () => {
      console.log(`Connected to MSFS.`);
      MSFS = true;

      // Set up a flight information object for pulling
      // model and flight data from SimConnect:
      flightInformation = new FlightInformation(api);

      // And register for the pause and crash events:
      registerWithAPI(clients, api, autopilot);
      clients.forEach((client) => client.onMSFS(true));

      // And start polling to see if we're "in game".
      (async function poll() {
        checkGameState(autopilot, clients, flightInformation);
        runLater(poll, POLLING_INTERVAL);
      })();
    });
  }

  /**
   * When a client connects and MSFS is already connected,
   * let the client know that tell the client to start a new flight
   */
  async onConnect(client) {
    console.log(`sending onMSFS`);
    if (MSFS) client.onMSFS(true);
  }

  /**
   * Authentication handler for clients, using an ultra
   * high security super advanced auth approach!
   */
  async authenticate(client, username, password) {
    if (!username || !password) return false;
    // This should go without saying, but: don't do this.
    const hash = btoa(username + password);
    if (hash !== FLIGHT_OWNER_KEY) return false;
    console.log(`authenticated client`);
    this.#authenticatedClients.push(client);
    return true;
  }
}
