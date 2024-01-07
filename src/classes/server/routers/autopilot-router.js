import { AutoPilot } from "../../../autopilot/autopilot.js";

/**
 * "route" handler for autopilot API calls from clients
 */
export class AutopilotRouter {
  /**
   * @type {AutoPilot}
   */
  #autopilot;

  /**
   * ...docs go here...
   * @param {AutoPilot}} autopilot
   * @param {Function} broadcastUpdate
   */
  constructor(autopilot) {
    this.#autopilot = autopilot;
  }

  async test(client, ...args) {
    this.#autopilot.test(...args);
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
    if (!client.authenticated) return false;
    const updatedParameters = await this.#autopilot.setParameters(params);
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
  }

  /**
   * ...docs go here...
   * @param {ClientClass} client
   */
  async revalidateWaypoints(client) {
    this.#autopilot.revalidateFlight();
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
  }
}
