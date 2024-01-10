// We'll grab the list of system events from the MSFS connector, so we can register for a few events:
import { SystemEvents } from "msfs-simconnect-api-wrapper";

// Then mostly for organizational purposes ("to keep the code clean")
// we house the actually MSFS API connection properties here.
export function connectServerToAPI(api, onConnect) {
  api.connect({
    autoReconnect: true,
    retries: Infinity,
    retryInterval: 5,
    onConnect,
    onRetry: (_, s) =>
      console.log(`Can't connect to MSFS, retrying in ${s} seconds`),
  });
}

// And since this is basically a "run once" thing we also house the code
// that registers for pause and crash events here.
export function registerWithAPI(clients, api) {
  console.log(`Registering API server to the general sim events.`);

  api.on(SystemEvents.PAUSED, () => {
    clients.forEach((client) => client.pause());
  });

  api.on(SystemEvents.UNPAUSED, () => {
    clients.forEach((client) => client.unpause());
  });

  api.on(SystemEvents.CRASHED, () => {
    clients.forEach((client) => client.crashed());
  });

  api.on(SystemEvents.CRASH_RESET, () => {
    clients.forEach((client) => client.crashReset());
  });
}
