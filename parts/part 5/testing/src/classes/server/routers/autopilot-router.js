// clients will be able to access functions in this router, so we
// want to make sure the autopilot is not directly accessible:
let autopilot;

export class AutopilotRouter {
  constructor(_autopilot) {
    autopilot = _autopilot;
  }

  // This is the only thing we want to expose to clients:
  // a way for them to change AP settings.
  async update(client, params) {
    autopilot.setParameters(params);
  }

  async resetTrim() {
    autopilot.resetTrim();
  }

  getWaypoints(client) {
    return autopilot.waypoints.getWaypoints();
  }

  addWaypoint(client, lat, long, alt) {
    autopilot.waypoints.add(lat, long, alt);
  }

  setWaypointPosition(client, id, lat, long) {
    autopilot.waypoints.setWaypointPosition(id, lat, long);
  }

  setWaypointElevation(client, id, alt) {
    autopilot.waypoints.setWaypointElevation(id, alt);
  }

  removeWaypoint(client, id) {
    autopilot.waypoints.remove(id);
  }

  splitWaypoint(client, id) {
    autopilot.waypoints.split(id);
  }

  resetWaypoints(client) {
    autopilot.waypoints.resetWaypoints();
  }

  clearWaypoints(client) {
    autopilot.waypoints.reset();
  }

  toggleRepeating(client, value) {
    autopilot.waypoints.toggleRepeating(value);
  }

  revalidate(client, lat, long) {
    autopilot.waypoints.revalidate(lat, long);
  }
}
