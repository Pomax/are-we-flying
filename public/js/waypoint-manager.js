import { Trail } from "./trail.js";
const noop = () => {};

// This is a wrapper class that lets us work with waypoints in a way that we can modify,
// without actually touching the waypoint data in the synchronized state object.
class Waypoint {
  constructor(waypoint) {
    Object.entries(waypoint).forEach(([key, value]) => {
      this[key] = value;
    });
  }
}

export class WaypointOverlay {
  constructor(owner, map) {
    this.owner = owner;
    this.map = map;
    this.waypoints = [];
    this.setupMapHandling();
  }

  setupMapHandling() {
    this.map.on(`click`, (e) => this.add(e));

    document
      .querySelector(`button[name="clear"]`)
      .addEventListener(`click`, () => {
        this.owner.server.autopilot.clearWaypoints();
      });

    document
      .querySelector(`button[name="reset"]`)
      .addEventListener(`click`, () => {
        this.owner.server.autopilot.resetWaypoints();
      });

    document
      .querySelector(`button[name="save"]`)
      .addEventListener(`click`, () => {
        const points = this.waypoints.map(({ lat, long, alt }) => ({
          lat,
          long,
          alt,
        }));
        const data = JSON.stringify(points, null, 2);
        const downloadLink = document.createElement(`a`);
        downloadLink.textContent = `download this flightplan`;
        downloadLink.href = `data:text/plain;base64,${btoa(data)}`;
        downloadLink.download = `flightpath.txt`;
        console.log(`Saving current flight path.`);
        downloadLink.click();
      });

    document
      .querySelector(`input[name="load"]`)
      .addEventListener(`change`, (evt) => {
        const file = evt.target.files[0];
        var reader = new FileReader();
        reader.onload = () => {
          var text = reader.result;
          try {
            const data = JSON.parse(text);
            console.log(`data parsed`);
            try {
              data.forEach(({ lat, long, alt }) =>
                this.owner.server.autopilot.addWaypoint(lat, long, alt)
              );
              console.log(`waypoints added`);
              try {
                this.owner.server.autopilot.revalidateWaypoints();
                console.log(`Loaded flight path from file.`);
              } catch (e) {
                console.error(`Problem revalidating`);
              }
            } catch (e) {
              console.error(`Errors adding waypoints`);
            }
          } catch (e) {
            console.error(`Could not parse flight path.`);
          }
        };
        reader.readAsText(file);
      });
  }

  hasWaypointLeft() {
    const { waypoints } = this;
    return waypoints.length > 0 && waypoints.some((p) => !p.completed);
  }

  get first() {
    return this.waypoints.at(0);
  }

  get last() {
    return this.waypoints.at(-1);
  }

  manage(waypoints) {
    // do we need to add/update any waypoints?
    waypoints.forEach((waypoint) => this.manageWaypoint(waypoint));
    // do we need to remove any waypoints?
    if (waypoints.length < this.waypoints.length) {
      const toRemove = this.waypoints.filter(
        (w) => !waypoints.find((e) => e.id === w.id)
      );
      const noAPcall = true;
      toRemove.forEach((waypoint) => this.remove(waypoint, noAPcall));
    }
  }

  // This function gets called for all waypoints that the autopilot says exist.
  manageWaypoint(waypoint) {
    const { waypoints } = this;
    const { id } = waypoint;
    // That means that they're either new points, or updates to points we already know about.
    const known = waypoints.find((e) => e.id === id);
    if (!known) return this.addNewWaypointToMap(waypoint);
    this.updateKnownWaypointOnMap(known, waypoint);
  }

  /**
   *
   * @param {*} waypoint
   */
  addNewWaypointToMap(waypoint) {
    waypoint = new Waypoint(waypoint);
    const { lat, long, completed } = waypoint;

    const icon = L.divIcon({
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      className: `waypoint-div`,
      html: `<img class="${`waypoint-marker${
        completed ? ` completed` : ``
      }`}" src="css/images/marker-icon.png">`,
    });

    const marker = (waypoint.marker = L.marker(
      { lat, lng: long },
      { icon, draggable: true }
    ).addTo(this.map));

    // Add event listeners for (re)moving this waypoint
    marker.on(`drag`, (event) => (marker.__drag__latlng = event.latlng));
    marker.on(`dragend`, () => this.move(waypoint));

    // Leaflet has click and double click handle, but doesn't actually
    // debounce clicks to see if something was a double click. It just
    // fires off spurious clicks *as well*, which isn't great. So we
    // need to run our own debounce code.
    let dblClickTimer = false;
    marker.on(`dblclick`, () => {
      clearTimeout(dblClickTimer);
      dblClickTimer = false;
      this.remove(waypoint);
    });
    marker.on(`click`, () => {
      if (dblClickTimer) return;
      dblClickTimer = setTimeout(() => {
        dblClickTimer = false;
        let val = prompt("Set waypoint altitude:", waypoint.alt);
        this.elevate(waypoint, val);
      }, 500);
    });

    // Add our waypoint and build a connector trail if there's a previous point.
    const prev = this.waypoints.slice(-1)[0];
    this.waypoints.push(waypoint);
    if (prev) {
      waypoint.prev = prev;
      prev.next = waypoint;
      waypoint.trail = new Trail(
        this.map,
        [prev.lat, prev.long],
        `var(--flight-path-colour)`
      );
      waypoint.trail.add(lat, long);
    }
  }

  // A helper function for building waypoint-connecting trails
  addNewTrail(lat, long) {
    return new Trail(this.map, [lat, long], `var(--flight-path-colour)`);
  }

  /**
   *
   * @param {*} known
   * @param {*} param1
   * @returns
   */
  updateKnownWaypointOnMap(
    known,
    { id, lat, long, alt, landing, active, completed }
  ) {
    // are we currently dragging this point around?
    if (known.marker?.__drag__latlng) return;

    // we're not: update it.
    if (known.lat !== lat || known.long !== long) {
      known.lat = lat;
      known.long = long;
      known.marker.setLatLng([lat, long]);

      // update connector trail
      const prev = known.prev;
      if (prev) {
        known.trail?.remove();
        known.trail = this.addNewTrail(prev.lat, prev.long);
        known.trail.add(lat, long);
      }
      const next = known.next;
      if (next) {
        next.trail.remove();
        next.trail = this.addNewTrail(lat, long);
        next.trail.add(next.lat, next.long);
      }
    }

    {
      const dataset = known.marker.getElement()?.dataset;
      known.alt = alt;
      if (alt) {
        if (dataset) dataset.alt = `${alt}'`;
      } else {
        if (dataset) delete dataset.alt;
      }
    }

    const classes = known.marker?._icon?.classList ?? {
      add: noop,
      remove: noop,
    };

    // Regular waypoint or landing point?
    known.landing = landing;
    if (landing) {
      classes.add(`landing`);
    } else {
      classes.remove(`landing`);
    }

    // Are we in the transition radius?
    known.active = active;
    if (active) {
      classes.add(`active`);
    } else {
      classes.remove(`active`);
    }

    // did we complete this waypoint?
    known.completed = completed;
    if (completed) {
      classes.add(`completed`);
    } else {
      classes.remove(`completed`);
    }
  }

  /**
   *
   * @param {*} param0
   */
  add({ latlng }) {
    const { lat, lng: long } = latlng;
    this.owner.server.autopilot.addWaypoint(lat, long);
  }

  /**
   *
   * @param {*} param0
   */
  move({ id, marker }) {
    const { lat, lng: long } = marker.__drag__latlng;
    marker.__drag__latlng = undefined;
    this.owner.server.autopilot.moveWaypoint(id, lat, long);
  }

  /**
   *
   * @param {*} param0
   * @param {*} alt
   */
  elevate({ id }, alt) {
    this.owner.server.autopilot.setWaypointElevation(id, alt);
  }

  /**
   *
   * @param {*} waypoint
   * @param {*} noAPIcall
   * @returns
   */
  remove(waypoint, noAPIcall = false) {
    if (!waypoint.id) {
      waypoint = this.waypoints.find((e) => e.id === waypoint);
    }

    const { id } = waypoint;

    // negative ids are for testing purposes
    if (id < 0) return;

    // send a remove call to the autopilot if this was a client-initiated removal
    if (!noAPIcall) {
      this.owner.server.autopilot.removeWaypoint(id);
    }

    // remove waypoint from our map trail
    waypoint.marker.remove();
    waypoint.trail?.remove();

    // Link up prev/next trail if they exist
    const prev = waypoint.prev;
    const next = waypoint.next;
    if (next) {
      next.trail.remove();
      if (prev) {
        next.trail = new Trail(
          this.map,
          [prev.lat, prev.long],
          `var(--flight-path-colour)`
        );
        next.trail.add(next.lat, next.long);
        prev.next = next;
      }
      next.prev = prev;
    } else if (prev) {
      prev.next = undefined;
    }

    // And of course, remove the waypoint from the array
    const pos = this.waypoints.findIndex((e) => e.id === id);
    this.waypoints.splice(pos, 1);
  }
}
