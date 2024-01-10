// Load the environment:
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../../.env` });

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
  __dirname,
  `../../utils/flight-information.js`,
  (module) => {
    FlightInformation = module.FlightInformation;
    if (flightInformation)
      Object.setPrototypeOf(flightInformation, FlightInformation.prototype);
  }
);

// In order to prevent clients from directly accessing the MSFS
// connector, we're going to make it a global (to our module):
let api = false;

// Next up, our server class:
export class ServerClass {
  #authenticatedClients = [];

  async init() {
    const { clients } = this;

    // set up the API variable - note that because this is a global,
    // clients can't directly access the API. However, we'll be setting
    // up some API routing to make that a non-issue in a bit.
    api = new MSFS_API();

    // Set up call handling for API calls: this will be explained after we
    // finish writing this class. We bind it as `this.api` so that any
    // client will be able to call `this.server.api...` and have things work.
    this.api = this.lock(new APIRouter(api), (client) =>
      this.#authenticatedClients.includes(client)
    );

    connectServerToAPI(api, async () => {
      console.log(`Connected to MSFS.`);

      flightInformation = new FlightInformation(api);
      registerWithAPI(clients, api);
      clients.forEach((client) => client.onMSFS(true));

      (async function poll() {
        checkGameState(clients, flightInformation);
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
    // When clients connect, immediately send them the most up to date
    // flight information, if the flightInformation object has been
    // initialized, of course.
    if (flightInformation) {
      client.setFlightInformation(flightInformation);
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
