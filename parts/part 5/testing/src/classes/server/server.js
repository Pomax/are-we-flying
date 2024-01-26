// Load the environment:
const dirname = import.meta.dirname;
import dotenv from "dotenv";
dotenv.config({ path: `${dirname}/../../../.env` });

const { FLIGHT_OWNER_KEY } = process.env;

// And get the "how frequentlu to poll" from theÏ environment.
const POLLING_INTERVAL = process.env.POLLING_INTERVAL ?? 2500;

// Then, an import for a setTimeout that ignores throws:
import { runLater } from "../../utils/utils.js";

// And two helper functions for setting up the API connection:
import {
  checkGameState,
  connectServerToAPI,
  registerWithAPI,
} from "./helpers.js";

// Plus a helper that we can expose as `this.api` for clients to work with:
import { APIRouter } from "./routers/api-router.js";

// And then the most important import: the MSFS connector
import { MSFS_API } from "msfs-simconnect-api-wrapper";

// Import our hot-reloader
import { watch } from "../../utils/reload-watcher.js";

// Import our fancy new class, in a way that lets us hot-reload it:
let flightInformation;
let { FlightInformation } = await watch(
  dirname,
  `../../utils/flight-information.js`,
  (module) => {
    FlightInformation = module.FlightInformation;
    if (flightInformation)
      Object.setPrototypeOf(flightInformation, FlightInformation.prototype);
    FlightInformation.api = api;
  }
);

// we'll make the autopilot hot-reloadable:
let autopilot = false;
let { AutoPilot } = await watch(
  dirname,
  `../../autopilot/autopilot.js`,
  (module) => {
    AutoPilot = module.AutoPilot;
    if (autopilot) Object.setPrototypeOf(autopilot, AutoPilot.prototype);
  }
);

// And we're not going to expose the autopilot itself to clients,
// instead we're wrapping it so we can control who gets to call it,
// similar to what we did with the API:
import { AutopilotRouter } from "./routers/autopilot-router.js";

// In order to prevent clients from directly accessing the MSFS
// connector, we're going to make it a global (to our module):
let api = false;

import { MOCK_API } from "./mocks/mock-api.js";
const USE_MOCK = process.argv.includes(`--mock`);

// Next up, our server class:
export class ServerClass {
  #authenticatedClients = [];

  async init() {
    const { clients } = this;

    // set up the API variable - note that because this is a global,
    // clients can't directly access the API. However, we'll be setting
    // up some API routing to make that a non-issue in a bit.
    api = USE_MOCK ? new MOCK_API() : new MSFS_API();

    // Set up call handling for API calls: this will be explained after we
    // finish writing this class. We bind it as `this.api` so that any
    // client will be able to call `this.server.api...` and have things work.
    this.api = this.lock(new APIRouter(api), (client) =>
      this.#authenticatedClients.includes(client)
    );

    // Set up the off-class autopilot instance, with a callback that
    // lets the autopilot broadcast its settings whenever they change.
    autopilot = new AutoPilot(api, (params) =>
      clients.forEach((client) => client.onAutoPilot(params))
    );

    // And set up call routing for the autopilot in the same way as we
    // did for the API: only authenticated clients are allowed to mess
    // with the AP settings =)
    this.autopilot = this.lock(new AutopilotRouter(autopilot), (client) =>
      this.#authenticatedClients.includes(client)
    );

    if (USE_MOCK) {
      // Explicitly bind the autopilot if we're running a mock,
      // because the mock is going to have to turn it on without
      // any sort of user involvement.
      api.setAutopilot(autopilot);
      // And allow clients to call this.server.mock.reset(),
      this.mock = {
        reset: (client) => api.reset(`Resetting the mock flight`),
        setPlaybackRate: (client, v) => api.plane.setPlaybackRate(v),
      };
    }

    connectServerToAPI(api, async () => {
      console.log(`Connected to MSFS.`);
      flightInformation = new FlightInformation(api);
      registerWithAPI(clients, api, autopilot);
      clients.forEach((client) => client.onMSFS(true));

      (async function poll() {
        checkGameState(autopilot, clients, flightInformation);
        runLater(poll, POLLING_INTERVAL);
      })();
    });
  }

  /**
   * Then a minimum amount of code for When a client connects to us,
   * and MSFS is already connected.
   */
  async onConnect(client) {
    if (api?.connected) client.onMSFS(true);
    if (flightInformation) {
      client.setFlightInformation(flightInformation);
    }
    if (autopilot) {
      client.onAutoPilot(await autopilot.getParameters());
    }
  }

  /*
   * An almost trivially simple authentication function:
   */
  async authenticate(client, username, password) {
    // This should go without saying, but: don't do this in real
    // code. Use a proper, secure login solution, instead =)
    const hash = btoa(username + password);
    if (hash !== FLIGHT_OWNER_KEY) return false;
    console.log(`authenticated client ${client.id}`);
    this.#authenticatedClients.push(client);
    return true;
  }
}
