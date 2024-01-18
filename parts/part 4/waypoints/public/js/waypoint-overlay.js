import { Trail } from "./trail.js";

export class WaypointOverlay {
  constructor(server, map) {
    this.server = server;
    this.map = map;
    this.waypoints = [];
    // Set up the event handling for the map:
    this.map.on(`click`, ({ latlng }) => {
      const { lat, lng } = latlng;
      server.autopilot.addWaypoint(lat, lng);
    });
  }

  addNewTrail(lat, long) {
    return new Trail(this.map, [lat, long], `var(--flight-path-colour)`);
  }

  manage(waypoints = []) {
    waypoints.forEach((waypoint) => this.manageWaypoint(waypoint));
    // Do we need to remove any waypoints from our map?
    if (waypoints.length < this.waypoints.length) {
      this.waypoints
        .filter((w) => !waypoints.find((e) => e.id === w.id))
        .forEach(({ id }) => this.server.autopilot.removeWaypoint(id));
    }
  }

  /**
   * Is this a new waypoint that we need to put on the map, or
   * is this a previously known waypoint that we need to update?I lik
   */
  manageWaypoint(waypoint) {
    const { waypoints } = this;
    const { id } = waypoint;
    const known = waypoints.find((e) => e.id === id);
    if (!known) return this.addWaypoint(waypoint);
    this.updateWaypoint(known, waypoint);
  }

  addWaypoint(waypoint) {
    // unpack and reassemble, because state content is immutable.
    const { id, lat, long, completed } = waypoint;
    waypoint = { id, lat, long, completed };
    console.log(waypoint);

    // First we create a Leaflet icon, which is a div with custom size and CSS classes:
    const icon = L.divIcon({
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      className: `waypoint-div`,
      html: `<img class="${`waypoint-marker${
        completed ? ` completed` : ``
      }`}" src="css/images/marker-icon.png">`,
    });

    // Then we create a Leaflet marker that uses that icon as its visualisation:
    const marker = (waypoint.marker = L.marker(
      { lat, lng: long },
      { icon, draggable: true }
    ).addTo(this.map));

    // Then we add a "show dialog on click" to our marker:
    marker.on(`click`, () => this.showWaypointModal(waypoint));

    // Next, if we click-drag a marker, we want to send the positional change to the server once we let go.
    marker.on(`drag`, (event) => (marker.__drag__latlng = event.latlng));
    marker.on(`dragend`, () => {
      const { lat, lng: long } = marker.__drag__latlng;
      marker.__drag__latlng = undefined;
      this.server.autopilot.setWaypointPosition(id, lat, long);
    });

    // Then, because we want to see the flight path, not just individual markers,
    // we also build trails between "the new marker" and the previous one.
    const prev = this.waypoints.at(-1);
    this.waypoints.push(waypoint);
    if (prev) {
      waypoint.prev = prev;
      prev.next = waypoint;
      waypoint.trail = this.addNewTrail(prev.lat, prev.long);
      waypoint.trail.add(lat, long);
    }
  }

  // Updating a known marker means checking if it moved, or changes active/completed states:
  updateWaypoint(waypoint, fromServer) {
    const { lat, long, alt, active, completed } = fromServer;

    // First, are we currently dragging this point around? If so, don't
    // do anything to this point yet, because we're not done with it.
    if (waypoint.marker?.__drag__latlng) return;

    // Did its location change?
    if (waypoint.lat !== lat || waypoint.long !== long) {
      waypoint.lat = lat;
      waypoint.long = long;
      waypoint.marker.setLatLng([lat, long]);

      // if it did, we also need to update the trail(s) that connect to it.
      const prev = waypoint.prev;
      if (prev) {
        waypoint.trail?.remove?.();
        waypoint.trail = this.addNewTrail(prev.lat, prev.long);
        waypoint.trail.add(lat, long);
      }

      const next = waypoint.next;
      if (next) {
        next.trail?.remove?.();
        next.trail = this.addNewTrail(lat, long);
        next.trail.add(next.lat, next.long);
      }
    }

    // Do we need to update its altitude information?
    const div = waypoint.marker.getElement();
    if (alt) {
      waypoint.alt = alt;
      if (div && div.dataset) div.dataset.alt = `${alt}'`;
    }

    // What about the waypoint "state" classes?
    const classes = div.classList;
    waypoint.active = active;
    classes.toggle(`active`, !!active);

    waypoint.completed = completed;
    classes.toggle(`completed`, !!completed);
  }
}
