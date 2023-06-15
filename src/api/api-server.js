// env related things
import dotenv from "dotenv";
dotenv.config({ path: `../../.env` });
const { API_PORT: PORT, FLIGHT_OWNER_KEY } = process.env;

import { createHash } from "crypto";
import express from "express";
import expressWs from "express-ws";
import { SystemEvents, MSFS_API } from "msfs-simconnect-api-wrapper";
import { MOCK_API } from "./mock-api.js";
import { AutoPilot } from "./autopilot/autopilot.js";

// Useful for debugging maxlistener errors:
// process.on('warning', e => console.warn(e.stack));

// are we just faking an API?
const USE_MOCK_API = process.argv.includes(`--mock`);

// server related things
const clients = [];
const broadcast = (action, data) =>
  clients.forEach((socket) => socket.json(action, data));

const api = USE_MOCK_API ? new MOCK_API() : new MSFS_API();
const autopilot = new AutoPilot(api, async (params) => {
  broadcast(`autopilot`, params);
});
if (USE_MOCK_API) api.setAutopilot(autopilot);

const parseMessage = (json) => {
  try {
    return JSON.parse(json.toString("utf-8"));
  } catch (e) {}
  return {};
};

const app = express();
expressWs(app);

app.get(`/`, (_, res) => {
  res
    .status(200)
    .send(
      `<!doctype html><p>API server status: running, MSFS${
        api.connected ? `` : ` not`
      } connected${api.connected ? `` : ` (yet)`}.</p>`
    );
});

app.ws("/", function (socket) {
  clients.push(socket);
  socket.json = (action, data) => socket.send(JSON.stringify({ action, data }));

  socket.on("disconnect", async () => {
    let pos = clients.findIndex((e) => e === socket);
    if (pos > -1) clients.splice(pos, 1);
  });

  const resultCache = {};
  const eventTracker = {};

  socket.on("message", async (msg) => {
    const { connected } = api;
    if (!connected) return;

    const now = Date.now();
    const { action, data } = parseMessage(msg);
    const { requestID, simvars, eventName, value } = data;
    const { __has_write_access: hasWriteAccess } = socket;

    if (action === `authenticate`) {
      if (data.flight_owner_key !== FLIGHT_OWNER_KEY) return;
      socket.__has_write_access = true;
    }

    if (action === `register`) {
      const tracker = (eventTracker[eventName] ??= {
        listeners: [],
        value: undefined,
        off: undefined,
        send: (socket, noCheck = false) => {
          if (noCheck || tracker.value !== undefined) {
            socket.json(`event`, {
              eventName,
              result: tracker.value,
            });
          }
        },
      });

      // custom "api server only" event
      if (eventName === `MSFS`) {
        console.log(`sending MSFS event`);
        return socket.json(`event`, { eventName: `MSFS` });
      }

      // is this client already registered for this event?
      if (tracker.listeners.includes(socket)) {
        console.log(
          `Ignoring ${eventName} registration: client already registered. Current value: ${tracker.value}`
        );
        return tracker.send(socket);
      }

      // regular event
      console.log(`adding event listener for ${eventName}`);
      tracker.listeners.push(socket);
      if (!tracker.off) {
        console.log(`registering event listener with the simconnect wrapper`);
        tracker.off = api.on(SystemEvents[eventName], (...result) => {
          tracker.value = result;
          tracker.listeners.forEach((socket) => tracker.send(socket, true));
        });
      }
      tracker.send(socket);
    }

    if (action === `forget`) {
      const pos = eventTracker[eventName].listeners.findIndex(
        (e) => e === socket
      );
      if (pos !== -1) {
        console.log(`dropping event listener for ${eventName}`);
        eventTracker[eventName].listeners.splice(pos, 1);
        if (eventTracker[eventName].listeners.length === 0)
          eventTracker[eventName].off();
      }
    }

    if (action === `get`) {
      let key = createHash("sha1").update(simvars.join(`,`)).digest("hex");
      // First, create a cache entry
      if (!resultCache[key]) resultCache[key] = { expires: now };
      // Refill if it expired:
      if (resultCache[key]?.expires <= now === true) {
        resultCache[key].expires = now + 100;
        resultCache[key].data = new Promise(async (resolve) => {
          try {
            const result = await api.get(...simvars);
            resolve(result);
          } catch (e) {
            console.warn(e);
            resolve({});
          }
        });
      }
      // Then await the cache entry's data before responding.
      const result = await resultCache[key].data;
      socket.json(`update`, { requestID, simvars: result });
    }

    if (action === `getSpecial`) {
      socket.json(`update`, {
        requestID,
        simvars: await api.getSpecial(simvar),
      });
    }

    if (action === `set` && hasWriteAccess) {
      const entries = Object.entries(simvars);
      console.log(
        `Setting ${entries.length} simvars:`,
        entries.map(([key]) => key).join(`,`)
      );
      entries.forEach(([key, value]) => api.set(key, value));
    }

    if (action === `trigger` && hasWriteAccess) {
      console.log(`Triggering sim event ${eventName}`);
      api.trigger(eventName, value);
    }

    if (action === `autopilot`) {
      const { action, params } = data;
      if (action === `get`) {
        // Request for current AP state, which should normally not be necessary
        // as it's always sent in response to any autopilot message.
      }

      if (action === `update` && hasWriteAccess) {
        await autopilot.setParameters(params);
      }

      if (action === `waypoint` && hasWriteAccess) {
        const { lat, long, alt, move, elevate, id } = data.params;
        const { remove, revalidate, reset, clear } = data.params;
        if (clear) {
          autopilot.clearWaypoints();
        } else if (revalidate) {
          autopilot.revalidateFlight();
        } else if (reset) {
          autopilot.resetFlight();
        } else if (move) {
          autopilot.moveWaypoint(id, lat, long);
        } else if (elevate) {
          autopilot.elevateWaypoint(id, alt);
        } else if (remove) {
          autopilot.removeWaypoint(id);
        } else {
          autopilot.addWaypoint(lat, long, alt);
        }
      }

      broadcast(`autopilot`, autopilot.getAutoPilotParameters());
    }
  });

  console.log(`Server to server socket established`);
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  api.connect({
    retries: Infinity,
    retryInterval: 5,
    onConnect: () => {
      console.log(`Connected to MSFS`);
      console.log(
        `Registering API server to PAUSE, UNPAUSED, CRASH, and SIM events.`
      );
      api.on(SystemEvents.PAUSED, () => {
        autopilot.setPaused(true);
      });
      api.on(SystemEvents.UNPAUSED, () => {
        autopilot.setPaused(false);
      });
      api.on(SystemEvents.CRASHED, () =>
        broadcast(`event`, { eventName: `CRASHED`, result: true })
      );
      api.on(SystemEvents.SIM, (inGame) => {
        if (inGame === 1) {
          console.log(`new flight started, resetting autopilot`);
          autopilot.reset();
        }
      });
      broadcast(`event`, { eventName: `MSFS`, result: true });
      if (USE_MOCK_API) {
        autopilot.setParameters({
          MASTER: true,
          LVL: true,
          ALT: 1500,
          TER: true,
          ATT: true,
        });
      }
    },
    onRetry: (_, s) =>
      console.log(`Can't connect to MSFS, retrying in ${s} seconds`),
  });
});
