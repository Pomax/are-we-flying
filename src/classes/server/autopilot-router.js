/**
 * "route" handler for autopilot API calls from clients
 */
export class AutopilotRouter {
  #autopilot;
  #broadcastUpdate;

  constructor(autopilot, broadcastUpdate) {
    this.#autopilot = autopilot;
    this.#broadcastUpdate = broadcastUpdate;
  }

  async getParameters(client) {
    return this.#autopilot.getParameters();
  }

  async update(client, params) {
    if (!client.authenticated) {
      return false;
    }
    await this.#autopilot.setParameters(params);
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  async clearWaypoints(client) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.clearWaypoints();
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  async revalidateWaypoints(client) {
    this.#autopilot.revalidateFlight();
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  async resetWaypoints(client) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.resetFlight();
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  async moveWaypoint(client, id, lat, long) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.moveWaypoint(id, lat, long);
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  async setWaypointElevation(client, id, alt) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.elevateWaypoint(id, alt);
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  async removeWaypoint(client, id) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.removeWaypoint(id);
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }

  async addWaypoint(client, lat, long, alt, landing) {
    if (!client.authenticated) {
      return false;
    }
    this.#autopilot.addWaypoint(lat, long, alt, landing);
    this.#broadcastUpdate(this.#autopilot.getParameters());
  }
}
