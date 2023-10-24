import url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../../.env` });

import { SystemEvents, MSFS_API } from "msfs-simconnect-api-wrapper";
import { APIWrapper } from "./api-wrapper.js";
import { AutoPilot } from "../../api/autopilot/autopilot.js";
import { AutopilotRouter } from "./autopilot-router.js";

const { FLIGHT_OWNER_KEY } = process.env;
const api = new MSFS_API();
let flying = false;
let MSFS = false;

/**
 * Our server-side API
 */
export class ServerClass {
  #autopilot;

  constructor() {
    // set up call handling for API calls
    this.api = new APIWrapper(api, () => MSFS);

    // set up call handling for autopilot functionality
    const autopilot = (this.#autopilot = new AutoPilot(api, async (params) =>
      this.clients?.forEach((client) => client.onAutoPilot(params))
    ));
    this.autopilot = new AutopilotRouter(this.#autopilot, (params) =>
      this.clients?.forEach((c) => c.onAutoPilot(params))
    );

    // Wait for MSFS to come online
    const server = this;
    api.connect({
      retries: Infinity,
      retryInterval: 5,
      onConnect: () => {
        console.log(`Connected to MSFS, binding.`);

        console.log(`Registering API server to the general sim events.`);
        api.on(SystemEvents.PAUSED, async () => {
          autopilot.setPaused(true);
          server.clients.forEach((client) => client.pause());
        });
        api.on(SystemEvents.UNPAUSED, async () => {
          autopilot.setPaused(false);
          server.clients.forEach((client) => client.unpause());
        });
        api.on(SystemEvents.CRASHED, async () => {
          server.clients.forEach((client) => client.crashed());
        });
        api.on(SystemEvents.CRASH_RESET, async () => {
          server.clients.forEach((client) => client.crashReset());
        });

        // whenever the sim or view values change, check the camera
        // to determine whether we're actually in-game or not.
        api.on(SystemEvents.SIM, () => server.#checkCamera());
        api.on(SystemEvents.VIEW, () => server.#checkCamera());

        // finally, signal any already connect client that we're good to go now.
        MSFS = true;
        server.clients.forEach((client) => client.onMSFS(true));
      },
      onRetry: (_, s) =>
        console.log(`Can't connect to MSFS, retrying in ${s} seconds`),
    });
  }

  // When a client connects and MSFS is already connected,
  // tell the client to start a new flight
  async onConnect(client) {
    if (MSFS) {
      client.onMSFS(true);
      await this.#checkCamera(client);
      client.setFlying(flying);
    }
  }

  // If the camera enum is 10 or higher, we are not actually in-game,
  // even if the SIM variable is 1, so we use this to determine whether
  // we're in-flight (because there is no true "are we flyin?" var that
  // can be checked on connect)
  async #checkCamera(client) {
    const data = await this.api.get(client, `CAMERA_STATE`, `CAMERA_SUBSTATE`);
    if (!data) {
      return console.warn(`there was no camera information? O_o`);
    }
    const { CAMERA_STATE: state, CAMERA_SUBSTATE: subState } = data;
    if (client) {
      client.setCamera(state, subState);
    } else {
      this.clients.forEach((client) => client.setCamera(state, subState));
    }
    const wasFlying = flying;
    flying = state <= 10;
    if (flying !== wasFlying) {
      if (flying) this.#autopilot.reset();
      if (client) {
        client.setFlying(flying);
      } else {
        this.clients.forEach((client) => client.setFlying(flying));
      }
    }
  }

  // Authentication handle for when a client was started with --owner
  // and it had access to a FLIGHT_OWNER_KEY environment variable.
  async authenticate(client, flightOwnerKey) {
    if (flightOwnerKey !== FLIGHT_OWNER_KEY) return false;
    console.log(`authenticating client`);
    client.authenticated = true;
  }
}
