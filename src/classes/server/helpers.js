import { SystemEvents } from "msfs-simconnect-api-wrapper";
let inGame = false;

/**
 * ...docs go here...
 */
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

/**
 * ...docs go here...
 */
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
    clients.forEach((client) => client.crashed());
  });

  api.on(SystemEvents.CRASH_RESET, () => {
    clients.forEach((client) => client.crashReset());
  });
}

/**
 * ...docs go here...
 */
export async function checkGameState(autopilot, clients, flightInformation) {
  // If the autopilot is running, it will be updating the flight
  // information more frequently than the server would otherwise do,
  // so don't update it here if the AP code is running.
  if (!autopilot || !autopilot.autoPilotEnabled) {
    await flightInformation.update();
    sendFlightInformation(clients, flightInformation);
  }

  // Is there's a state change from "not in game" to "in game"?
  const wasInGame = inGame;
  inGame = flightInformation.general.inGame;

  if (wasInGame && !inGame) {
    console.log(`left the game, disabling autopilot`);
    autopilot.disable();
  }

  if (!wasInGame && inGame) {
    console.log(`new game started, resetting autopilot`);
    autopilot.reset(flightInformation, (data) =>
      sendFlightInformation(clients, data)
    );
  }
}

/**
 * ...docs go here...
 */
export function sendFlightInformation(clients, flightInformation) {
  clients.forEach(async (client) => {
    try {
      await client.setFlightInformation(flightInformation);
    } catch (e) {
      console.log(`error calling client.setFlightInformation:`, e);
    }
  });
}
