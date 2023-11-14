import { createHash } from "crypto";
import { SystemEvents } from "msfs-simconnect-api-wrapper";
import { AutoPilot } from "../../../autopilot/autopilot.js";

const resultCache = {};
const eventTracker = {};

export class APIRouter {
  #api;

  /**
   *
   * @param {AutoPilot} api
   */
  constructor(api) {
    this.#api = api;
  }

  /**
   * register for MSFS events
   */
  async register(client, ...eventNames) {
    if (!this.#api.connected) return;
    eventNames.forEach((eventName) => this.#registerEvent(client, eventName));
  }

  /**
   * unregister from an MSFS event
   */
  async forget(client, eventName) {
    if (!this.#api.connected) return;
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
    if (!this.#api.connected) return {};
    const now = Date.now();
    const key = createHash("sha1").update(simVarNames.join(`,`)).digest("hex");
    // Check cache, and fill if nonexistent/expired necessary.
    resultCache[key] ??= { expires: now };
    if (resultCache[key]?.expires <= now === true) {
      resultCache[key].expires = now + 100;
      resultCache[key].data = new Promise(async (resolve) => {
        try {
          resolve(await this.#api.get(...simVarNames));
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
    if (!this.#api.connected) return false;
    if (!client.authenticated) return false;

    const errors = [];
    const entries = Object.entries(simVars);
    console.log(
      `Setting ${entries.length} simvars:`,
      Object.keys(simVars).join(`,`)
    );
    entries.forEach(([key, value]) => {
      try {
        this.#api.set(key, value);
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
    if (!this.#api.connected) return false;
    if (!client.authenticated) return false;
    this.#api.trigger(eventName, value);
  }

  /**
   * private function (cannot be called remotely)
   */
  #registerEvent(client, eventName) {
    const tracker = (eventTracker[eventName] ??= { listeners: [] });

    // custom "api server only" event
    if (eventName === `MSFS`) {
      return client.onMSFS(this.#api.connected);
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
      tracker.off = this.#api.on(SystemEvents[eventName], (...result) => {
        tracker.value = result;
        tracker.listeners.forEach((client) =>
          client[eventHandlerName](tracker.value)
        );
      });
    }
  }
}
