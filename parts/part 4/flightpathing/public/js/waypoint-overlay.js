import { Trail } from "./trail.js";
import { showWaypointModal } from "./waypoint-modal.js";

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

  addNewTrail(lat, long, lat2, long2) {
    const trail = new Trail(this.map, [lat, long], `var(--flight-path-colour)`);
    trail.add(lat2, long2);
    return trail;
  }

  manage(waypoints = [], repeating) {
    // Show whether this is a closed path or not by marking our button active or not:
    document
      .querySelector(`#map-controls .patrol`)
      .classList.toggle(`active`, repeating);

    // And make sure to add the trail that "closes" the flight path, or removes it,
    // based on the repeating state and whether we already have it or not.
    this.updateClosingTrail(repeating);

    // Look at each waypoint and determine whether it's
    // a new point, or one we already know about.
    waypoints.forEach((waypoint, pos) =>
      this.manageWaypoint(waypoint, pos + 1)
    );

    // Then, do we need to remove any waypoints from our map?
    if (waypoints.length < this.waypoints.length) {
      console.log(`points were removed`);
      this.waypoints
        .filter((w) => !waypoints.find((e) => e.id === w.id))
        .forEach(({ id }) => this.removeWaypoint(id));
      this.resequence(repeating);
    }
  }

  /**
   * remove a point locally (because it no longer exists at the server)
   */
  removeWaypoint(id) {
    const pos = this.waypoints.findIndex((e) => e.id === id);
    if (pos === -1) return;
    const waypoint = this.waypoints.splice(pos, 1)[0];
    waypoint.marker.remove();
    waypoint.trail?.remove();
    waypoint.next?.trail?.remove();
  }

  /**
   * Make sure that cosmetically, the first waypoint is labeled
   * as waypoint 1, the next is waypoint 2, etc, irrespective of
   * the waypoint's internal id number.
   */
  resequence(repeating) {
    this.waypoints.forEach((waypoint, pos) => {
      if (pos > 0) {
        const { lat, long } = waypoint;
        const prev = (waypoint.prev = this.waypoints[pos - 1]);
        waypoint.trail?.remove();
        waypoint.trail = this.addNewTrail(prev.lat, prev.long, lat, long);
      }
      this.setWaypointLabel(waypoint, pos + 1);
    });
    this.updateClosingTrail(repeating);
  }

  /**
   * make sure we have a trail connecting the first and last
   * waypoint, if we need to repeat the flightpath. Note that
   * we also call this when we *move* the first or last point,
   * so we indiscriminantly remove the trail first, then
   * selectively add it back in.
   */
  updateClosingTrail(repeating) {
    const { waypoints } = this;
    if (waypoints.length < 2) return;

    if (this.closingTrail) {
      this.closingTrail.remove();
      this.closingTrail = undefined;
    }

    if (repeating && !this.closingTrail) {
      const first = waypoints[0];
      const last = waypoints.at(-1);
      this.closingTrail = this.addNewTrail(
        first.lat,
        first.long,
        last.lat,
        last.long
      );
    }
  }

  /**
   * Set a human-friendly label on a waypoint
   */
  setWaypointLabel(waypoint, number) {
    waypoint.marker
      .getElement()
      .querySelector(
        `.pre`
      ).textContent = `waypoint ${number} (${waypoint.distance.toFixed(1)} NM)`;
  }

  /**
   * Is this a new waypoint that we need to put on the map, or
   * is this a previously known waypoint that we need to update?I lik
   */
  manageWaypoint(waypoint, number) {
    const { waypoints } = this;
    const { id } = waypoint;
    const known = waypoints.find((e) => e.id === id);
    if (!known) return this.addWaypoint(waypoint, number);
    this.updateWaypoint(known, waypoint, number);
  }

  /**
   * Create a local waypoint based on a remote waypoint at the server
   */
  addWaypoint(waypoint, number) {
    // unpack and reassemble, because state content is immutable.
    const { id, lat, long, active, completed, distance } = waypoint;
    waypoint = { id, lat, long, active, completed, distance };

    const waypointClass = `waypoint-marker${completed ? ` completed` : ``}${
      active ? ` active` : ``
    }`;

    // First we create a Leaflet icon, which is a div with custom size and CSS classes:
    const icon = L.divIcon({
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      className: `waypoint-div`,
      html: `
        <div class="${waypointClass}">
          <div class="pre"></div>
          <img src="css/images/marker-icon.png">
          <div class="post"></div>
        </div>
      `,
    });

    // Then we create a Leaflet marker that uses that icon as its visualisation:
    const marker = (waypoint.marker = L.marker(
      { lat, lng: long },
      { icon, draggable: true }
    ).addTo(this.map));

    this.setWaypointLabel(waypoint, number);

    // Then we add a "show dialog on click" to our marker:
    marker.on(`click`, () => showWaypointModal(this.server, waypoint));

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
      waypoint.trail = this.addNewTrail(prev.lat, prev.long, lat, long);
    }
  }

  /**
   * Check if we need to update a local waypoint based on it
   * having changed at the server.
   */
  updateWaypoint(waypoint, fromServer) {
    const { id, lat, long, alt, active, completed } = fromServer;

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
        waypoint.trail?.remove();
        waypoint.trail = this.addNewTrail(prev.lat, prev.long, lat, long);
      }
      const next = waypoint.next;
      if (next) {
        next.trail?.remove();
        next.trail = this.addNewTrail(lat, long, next.lat, next.long);
      }

      // If this was the first or last point, update our closing trail
      const pos = this.waypoints.findIndex((e) => e.id === id);
      if (pos === 0 || pos === this.waypoints.length - 1) {
        this.updateClosingTrail();
      }
    }

    // Do we need to update its altitude information?
    const div = waypoint.marker.getElement();
    if (div && div.dataset) {
      if (alt) {
        div.dataset.alt = `${alt}'`;
      } else {
        delete div.dataset.alt;
      }
    }
    waypoint.alt = alt;

    // What about the waypoint "state" classes?
    const classes = div.classList;
    waypoint.active = active;
    classes.toggle(`active`, !!active);
    waypoint.completed = completed;
    classes.toggle(`completed`, !!completed);
  }
}
