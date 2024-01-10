// We'll grab the list of system events from the MSFS connector, so we can register for a few events:
import { SystemEvents } from "msfs-simconnect-api-wrapper";

let inGame = false;

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
export function registerWithAPI(clients, api, autopilot) {
  console.log(`Registering API server to the general sim events.`);

  api.on(SystemEvents.PAUSED, () => {
    autopilot.setPaused(true);
    clients.forEach((client) => client.pause());
  });

  api.on(SystemEvents.UNPAUSED, () => {
    autopilot.setPaused(false);
    clients.forEach((client) => client.unpause());
  });

  api.on(SystemEvents.CRASHED, () => {
    autopilot.reset()
    clients.forEach((client) => client.crashed());
  });

  api.on(SystemEvents.CRASH_RESET, () => {
    clients.forEach((client) => client.crashReset());
  });
}

export async function checkGameState(autopilot, clients, flightInformation) {
  // If the autopilot is running, it will be updating the flight
  // information more frequently than the server would otherwise do,
  // so don't update it here if the AP code is running.
  if (!autopilot || !autopilot.autoPilotEnabled) {
    await flightInformation.update();
    clients.forEach((client) => client.setFlightInformation(flightInformation));
  }

  // Is there's a state change from "not in game" to "in game"?
  const wasInGame = inGame;
  inGame = flightInformation.general.inGame;

  if (wasInGame && !inGame) {
    console.log(`left the game, disabling autopilot`);
    autopilot.disable();
  } else if (!wasInGame && inGame) {
    console.log(`new game started, resetting autopilot`);
    autopilot.reset(flightInformation, (data) =>
      clients.forEach((client) => client.setFlightInformation(data))
    );
  }
}
