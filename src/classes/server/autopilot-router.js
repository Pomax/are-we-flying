import { AutoPilot } from "../../api/autopilot/autopilot.js";
import { ClientClass } from "../client/client.js";

/**
 * "route" handler for autopilot API calls from clients
 */
export class AutopilotRouter {
  /**
   * @type {AutoPilot}
   */
  #autopilot;

  #broadcastUpdate;

  /**
   * ...docs go here...
   * @param {AutoPilot}} autopilot
   * @param {Function} broadcastUpdate
   */
  constructor(autopilot, broadcastUpdate) {
    this.#autopilot = autopilot;
    this.#broadcastUpdate = broadcastUpdate;
  }

  /**
   * ...docs go here...
   * @param {ClientClass} client
   * @returns
   */
  async getParameters(client) {
    return this.#autopilot.getParameters();
  }

  /**
   * ...docs go here...
   * @param {ClientClass} client
   * @param {*} params
   */
  async update(client, params) {
    if (!client.authenticated) {
      return false;
    }
    await this.#autopilot.setParameters(params);
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  /**
   * ...docs go here...
   * @param {ClientClass} client
   */
  async clearWaypoints(client) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.clearWaypoints();
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  /**
   * ...docs go here...
   * @param {ClientClass} client
   */
  async revalidateWaypoints(client) {
    this.#autopilot.revalidateFlight();
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  /**
   * ...docs go here...
   * @param {ClientClass} client
   */
  async resetWaypoints(client) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.resetFlight();
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  /**
   * ...docs go here...
   * @param {ClientClass} client
   * @param {Number} id
   * @param {Number} lat
   * @param {Number} long
   */
  async moveWaypoint(client, id, lat, long) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.moveWaypoint(id, lat, long);
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  /**
   * ...docs go here...
   * @param {ClientClass} client
   * @param {Number} id
   * @param {Number} alt
   */
  async setWaypointElevation(client, id, alt) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.elevateWaypoint(id, alt);
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  /**
   * ...docs go here...
   * @param {ClientClass} client
   * @param {Number} id
   */
  async removeWaypoint(client, id) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.removeWaypoint(id);
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  /**
   * ...docs go here...
   * @param {ClientClass} client
   * @param {Number} lat
   * @param {Number} long
   * @param {Number} alt
   * @param {Number} landing
   */
  async addWaypoint(client, lat, long, alt, landing) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.addWaypoint(lat, long, alt, landing);
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }
}
