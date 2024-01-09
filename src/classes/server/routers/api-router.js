import { createHash } from "node:crypto";
import { SystemEvents } from "msfs-simconnect-api-wrapper";
import { loadAirportDB } from "msfs-simconnect-api-wrapper";
import { degrees } from "../../../utils/utils.js";

const resultCache = {};
const eventTracker = {};
// load airports, but only airports (not VOR etc.)
const airports = loadAirportDB().filter((a) => a.runways.length > 0);

let api;

export class APIRouter {
  constructor(_api) {
    api ??= _api;
  }

  /**
   * register for MSFS events
   */
  async register(client, ...eventNames) {
    if (!api.connected) return;
    eventNames.forEach((eventName) => this.#registerEvent(client, eventName));
  }

  /**
   * unregister from an MSFS event
   */
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

  /**
   * get simvar values
   */
  async get(client, ...simVarNames) {
    if (!api.connected) return {};
    const now = Date.now();
    const key = createHash("sha1").update(simVarNames.join(`,`)).digest("hex");
    // Check cache, and fill if nonexistent/expired necessary.
    resultCache[key] ??= { expires: now };
    if (resultCache[key]?.expires <= now === true) {
      resultCache[key].expires = now + 100;
      resultCache[key].data = new Promise(async (resolve) => {
        try {
          resolve(await api.get(...simVarNames));
        } catch (e) {
          console.warn(e);
          resolve({});
        }
      });
    }
    // Then await the cache entry's data before responding.
    return await resultCache[key].data;
  }

  /**
   * set simvars
   */
  async set(client, simVars) {
    if (!api.connected) return false;
    if (typeof simVars !== `object`)
      throw new Error(`api.set input must be an object.`);

    const errors = [];
    const entries = Object.entries(simVars);
    console.log(
      `Setting ${entries.length} simvars:`,
      Object.keys(simVars).join(`,`)
    );
    entries.forEach(([key, value]) => {
      try {
        api.set(key, value);
      } catch (e) {
        errors.push(e.message);
      }
    });
    return errors.length ? errors : true;
  }

  /**
   * trigger an MSFS event
   */
  async trigger(client, eventName, value) {
    if (!api.connected) return false;
    api.trigger(eventName, value);
  }

  /**
   * private function (cannot be called remotely)
   */
  #registerEvent(client, eventName) {
    const tracker = (eventTracker[eventName] ??= { listeners: [] });

    // custom "api server only" event
    if (eventName === `MSFS`) {
      return client.onMSFS(api.connected);
    }

    // is this client already registered for this event?
    if (tracker.listeners.includes(client)) {
      console.log(
        `Ignoring ${eventName} registration: client already registered. Current value: ${tracker.value}`
      );
      return false;
    }

    // turn SIM into onSim, and FLIGHT_LOADED into onFlightLoaded
    const eventHandlerName =
      `on` +
      eventName
        .split(`_`)
        .map((v) => v[0].toUpperCase() + v.substring(1).toLowerCase())
        .join(``);

    tracker.listeners.push(client);

    if (!tracker.off) {
      tracker.off = api.on(SystemEvents[eventName], (...result) => {
        tracker.value = result;
        tracker.listeners.forEach((client) =>
          client[eventHandlerName](tracker.value)
        );
      });
    }
  }

  /**
   *
   * @param {*} lat
   * @param {*} long
   * @param {*} d
   * @returns
   */
  async getNearbyAirports(client, lat, long, d = 1) {
    if (!lat && !long) {
      lat = degrees((await api.get(`PLANE_LATITUDE`)).PLANE_LATITUDE);
      long = degrees((await api.get(`PLANE_LONGITUDE`)).PLANE_LONGITUDE);
    }
    // We're just doing a grid-centered-on, rather than radial
    // distance, so that we don't need to do any "real" maths,
    // given that we're filtering 44,000+ airports each call.
    const nearby = (airport) => {
      const x = airport.longitude;
      const y = airport.latitude;
      const g = d / 2;
      return lat - g < y && y < lat + g && long - g < x && x < long + g;
    };
    return airports.filter(nearby);
  }
}
