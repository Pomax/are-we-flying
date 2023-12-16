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
  constructor(owner, layer) {
    this.owner = owner;
    this.layer = layer;
    this.waypoints = [];
    this.setupMapHandling();
  }

  setupMapHandling() {
    this.layer.on(`click`, (e) => this.add(e));

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
        const points = this.waypoints.map(({ lat, long, alt, landing }) => ({
          lat,
          long,
          alt,
          landing,
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
        reader.onload = async () => {
          var text = reader.result;
          try {
            const data = JSON.parse(text);
            console.log(`data parsed`);
            try {
              data.forEach(({ lat, long, alt, landing }) => {
                this.owner.server.autopilot.addWaypoint(
                  lat,
                  long,
                  alt,
                  landing
                );
              });
              console.log(`waypoints added`);
              try {
                await this.owner.server.autopilot.resetWaypoints();
                // TODO: FIXME: only revalidate if we're in the air.
                // await this.owner.server.autopilot.revalidateWaypoints();
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
    const { active, completed, landing, lat, long } = waypoint;

    const wpClass = `waypoint-marker${completed ? ` completed` : ``}`;
    const icon = L.divIcon({
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      className: `waypoint-div`,
      html: `
        <div class="${wpClass}">
          <div class="pre"></div>
          <img src="css/images/marker-icon.png">
          <div class="post"></div>
        </div>`,
    });

    const marker = (waypoint.marker = L.marker(
      { lat, lng: long },
      { icon, draggable: true }
    ).addTo(this.layer));

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
        this.layer,
        [prev.lat, prev.long],
        `var(--flight-path-colour)`
      );
      waypoint.trail.add(lat, long);
    }

    // And make sure things are coloured correctly
    this.setClasses(waypoint, { landing, active, completed });
  }

  // A helper function for building waypoint-connecting trails
  addNewTrail(lat, long) {
    return new Trail(this.layer, [lat, long], `var(--flight-path-colour)`);
  }

  /**
   *
   * @param {*} known
   * @param {*} param1
   * @returns
   */
  updateKnownWaypointOnMap(
    known,
    { id, number, lat, long, alt, NM, landing, active, completed }
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
        next.trail?.remove();
        next.trail = this.addNewTrail(lat, long);
        next.trail.add(next.lat, next.long);
      }
    }

    if (NM) {
      const div = known.marker.getElement()?.querySelector(`.post`);
      div.textContent = `waypoint ${number}: ${NM} NM`;
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

    // And make sure things are coloured correctly
    this.setClasses(known, { landing, active, completed });
  }

  /**
   * Set the appropriate CSS classes
   * @param {*} waypoint
   * @param {*} param1
   */
  setClasses(waypoint, { landing, active, completed }) {
    const classes = waypoint.marker?._icon?.classList ?? {
      add: noop,
      remove: noop,
    };

    // Regular waypoint or landing point?
    waypoint.landing = landing;
    classes.toggle(`landing`, !!landing);

    // Are we in the transition radius?
    waypoint.active = active;
    classes.toggle(`active`, !!active);

    // did we complete this waypoint?
    waypoint.completed = completed;
    classes.toggle(`completed`, !!completed);
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
      next.trail?.remove();
      if (prev) {
        try {
          next.trail = new Trail(
            this.layer,
            [prev.lat, prev.long],
            `var(--flight-path-colour)`
          );
          next.trail.add(next.lat, next.long);
          prev.next = next;
        } catch (e) {
          console.error(e);
          console.log(next);
        }
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
