// Obviously we'll need to load the list of events if we're going to let clients register for events:
import { SystemEvents } from "msfs-simconnect-api-wrapper";

const eventTracker = {};

// And in order to cache GET requests, we're going to hash requests based on
// the varname collection we get passed, which we'll do by hashing.
import { createHash } from "node:crypto";

const resultCache = {};

// Since there is only one API instance, we can cache that 
// at the module level, just like in the server class.
let api;

export class APIRouter {
  // And then we bind that variable using the constructor:
  constructor(_api) {
    api = _api;
  }

  // Then, when clients call this.server.register(...), we:
  async register(client, ...eventNames) {
    if (!api.connected) return;
    eventNames.forEach((eventName) => this.#registerEvent(client, eventName));
  }

  // With a private function for registering events on the API:
  #registerEvent(client, eventName) {
    const tracker = (eventTracker[eventName] ??= { listeners: [] });

    // One that can response to custom "api server only" event requests:
    if (eventName === `MSFS`) {
      return client.onMSFS(api.connected);
    }

    // And has additional logic for making sure a client doesn't "double-register":
    if (tracker.listeners.includes(client)) {
      console.log(
        `Ignoring ${eventName} registration: client already registered. Current value: ${tracker.value}`
      );
      return false;
    }

    // When a client registers for a sim event like "SIM" or "FLIGHT_LOADED",
    // we assume we can call them back with event information on function
    // names like onSim and onFlightLoaded:
    const eventHandlerName =
      `on` +
      eventName
        .split(`_`)
        .map((v) => v[0].toUpperCase() + v.substring(1).toLowerCase())
        .join(``);
  
    // So: ask the API to register for this event, with an appropriate
    // bit of code to handle "what to do when SimConnect flags this event".
    if (!tracker.off) {
      tracker.off = api.on(SystemEvents[eventName], (...result) => {
        tracker.value = result;
        tracker.listeners.forEach((client) =>
          client[eventHandlerName](tracker.value)
        );
      });
    }
  }

  // And when clients call this.server.forget(...), we do the opposite:
  async forget(client, eventName) {
    if (!api.connected) return;
    const pos = eventTracker[eventName].listeners.findIndex(
      (c) => c === client
    );
    if (pos === -1) return;
    eventTracker[eventName].listeners.splice(pos, 1);
    if (eventTracker[eventName].listeners.length === 0) {
      eventTracker[eventName].off();
    }
  }

  // And when clients call this.server.get(...), we cache the set of simvars
  // that are being requested, so we don't ask SimConnect for the same data
  // several times, if several clients want the same information at the same time.
  async get(client, ...simVarNames) {
    if (!api.connected) return {};
    const now = Date.now();
    const key = createHash("sha1").update(simVarNames.join(`,`)).digest("hex");
    // assign a new expiry, if there is no cached entry already:
    resultCache[key] ??= { expires: now };
    // did our cached entry "expire"? (which, if we just made it, won't be the case of course)
    if (resultCache[key]?.expires <= now === true) {
      resultCache[key].expires = now + 100; // ms
      // we cache a promise, rather than data, so we can "await"
      resultCache[key].data = new Promise(async (resolve) => {
        try {
          resolve(await api.get(...simVarNames));
        } catch (e) {
          // Also make sure to never crash the server if there's a problem with a simvar:
          console.warn(e);
          resolve({});
        }
      });
    }
    // And then we await the cache entry's data before responding. If this is a 
    // request for data that was previously cached already, then this will pretty
    // much resolve instantly. Otherwise, it'll resolve once we get data from the API.
    return await resultCache[key].data;
  }

  // when clients call this.server.set(...), we forward that to the API:
  async set(client, simVars) {
    if (!api.connected) return false;

    if (typeof simVars !== `object`)
      throw new Error(`api.set input must be an object.`);

    // But we make sure to handle each setter separately, so we can
    // report any and all errors, without breaking the entire call.
    const errors = [];
    const entries = Object.entries(simVars);
    entries.forEach(([key, value]) => {
      try {
        api.set(key, value);
      } catch (e) {
        errors.push(e.message);
      }
    });
    return errors.length ? errors : true;
  }

  // And for triggers, we forward those too, but we only allow single triggers per call.Ï
  async trigger(client, eventName, value) {
    if (!api.connected) return false;
    api.trigger(eventName, value);
  }
}
