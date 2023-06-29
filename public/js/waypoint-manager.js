import { callAutopilot } from "./api.js";
import { Trail } from "./trail.js";
const noop = () => {};

export class WaypointOverlay {
  constructor(autopilot, map) {
    this.autopilot = autopilot;
    this.map = map;
    this.waypoints = [];
    this.setupMapHandling();
  }

  setupMapHandling() {
    this.map.on(`click`, (e) => this.add(e));

    document
      .querySelector(`button[name="clear"]`)
      .addEventListener(`click`, () => {
        callAutopilot(`waypoint`, { clear: true });
      });

    document
      .querySelector(`button[name="reset"]`)
      .addEventListener(`click`, () => {
        callAutopilot(`waypoint`, { reset: true });
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
        reader.onload = function () {
          var text = reader.result;
          try {
            const data = JSON.parse(text);
            data.forEach(({ lat, long, alt }) =>
              callAutopilot(`waypoint`, { lat, long, alt })
            );
            callAutopilot(`waypoint`, { revalidate: true });
            console.log(`Loaded flight path from file.`);
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
    if (!known) return this.addNewWaypoint(waypoint);
    this.updateKnownWaypoint(known, waypoint);
  }

  addNewWaypoint(waypoint) {
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

  updateKnownWaypoint(
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
    console.log(landing);
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

  add({ latlng }) {
    const { lat, lng: long } = latlng;
    callAutopilot(`waypoint`, { lat, long });
    // This will trigger an AP update notification, in
    // response-to-which we'll add the marker to the map.
  }

  move({ id, marker }) {
    const { lat, lng: long } = marker.__drag__latlng;
    marker.__drag__latlng = undefined;
    callAutopilot(`waypoint`, { move: true, id, lat, long });
  }

  elevate({ id }, alt) {
    callAutopilot(`waypoint`, { elevate: true, id, alt });
  }

  remove(waypoint, noAPIcall = false) {
    if (!waypoint.id) {
      waypoint = this.waypoints.find((e) => e.id === waypoint);
    }

    const { id } = waypoint;

    // negative ids are for testing purposes
    if (id < 0) return;

    // send a remove call to the autopilot if this was a client-initiated removal
    if (!noAPIcall) callAutopilot(`waypoint`, { id, remove: true });

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
