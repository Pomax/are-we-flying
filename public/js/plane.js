import { Attitude } from "./attitude.js";
import { Autopilot } from "./autopilot.js";
import { getDistanceBetweenPoints, waitFor } from "./utils.js";
import { Duncan } from "./locations.js";
import { getAirplaneSrc } from "./airplane-src.js";
import { initCharts } from "./dashboard/charts.js";
import { map as defaultMap, centerBtn } from "./maps.js";
import { MapMarker } from "./map-marker.js";
import { Questions } from "./questions.js";
import { Trail } from "./trail.js";
import { WaypointOverlay } from "./waypoint-manager.js";

const L = await waitFor(async () => window.L);
const { abs, max, PI: π, sqrt } = Math;

/**
 * ...docs go here...
 */
export class Plane {
  constructor(server, map = defaultMap, location = Duncan, heading = 135) {
    console.log(`building plane`);
    this.server = server;
    this.autopilot = new Autopilot(this);
    this.charts = initCharts(document.querySelector(`#science`));

    // Set up our map
    this.map = map;

    // We always want our plane on top, so we organize our
    // visualization using three separate layers.
    this.trailLayer = this.flightPathLayer = this.flightLayer = map;
    this.waypoints = new WaypointOverlay(this, this.flightPathLayer);
    this.addPlaneIconToMap(this.flightLayer, location, heading);

    // initial bootstrap
    const [lat, long] = (this.lastPos = Duncan);
    this.lastUpdate = {
      lat,
      long,
      flying: false,
      crashed: false,
      flightInformation: {
        data: { lat, long },
      },
    };
  }

  async test() {
    if (!this.state.authenticated) return;
    this.testRan = true;
    const { map } = this;
    const gridSize = 5;
    const { flightInformation } = this.state;
    if (flightInformation) {
      const airports = await this.server.api.getNearbyAirports(
        flightInformation.data.lat ?? Duncan[0],
        flightInformation.data.long ?? Duncan[1],
        gridSize
      );
      airports?.forEach((airport) => {
        // draw the airport
        const { latitude: lat, longitude: long, runways } = airport;
        L.circle([lat, long], { radius: 30, color: "blue" }).addTo(map);
        // draw the runways
        runways.forEach((runway) => {
          const { start, end, bbox, width } = runway;
          const outline = L.polygon(bbox, {
            color: "red",
            bubblingMouseEvents: false,
          }).addTo(map);
          L.circle(start, { radius: width }).addTo(map);
          outline.on(`click`, (leafletEvt) => {
            L.DomEvent.preventDefault(leafletEvt);
            confirm(`land here?`);
          });
        });
      });
    }
  }

  /**
   * ...docs go here...
   * @param {*} location
   */
  startNewTrail(location) {
    this.trail = new Trail(this.trailLayer, location);
    return this.trail;
  }

  /**
   * ...docs go here...
   * @param {*} data
   */
  async manageWaypoints(waypoints = []) {
    this.waypoints.manage(waypoints);
  }

  /**
   * ...docs go here...
   * @param {*} value
   * @returns
   */
  async setElevationProbe(lat, long, value = false) {
    // remove the old probe line
    if (this.elevationProbe) this.elevationProbe.remove();

    // then draw a new one, but only if there is a value to visualize
    if (!value) return;

    const { lat2, long2 } = value;
    this.elevationProbe = new Trail(
      this.trailLayer,
      [lat, long],
      `#4F87`, // lime
      undefined,
      { weight: 30, lineCap: `butt` }
    );
    this.elevationProbe.add(lat2, long2);
  }

  /**
   * ...docs go here...
   * @param {*} map
   * @param {*} location
   * @param {*} heading
   */
  async addPlaneIconToMap(flightLayer, location = Duncan, heading = 0) {
    const props = {
      icon: L.divIcon({
        iconSize: [73 / 2, 50 / 2],
        iconAnchor: [73 / 4, 50 / 4],
        popupAnchor: [10, 10],
        className: `map-pin`,
        html: MapMarker.getHTML(heading),
      }),
    };
    this.marker = L.marker(location, props).addTo(flightLayer);
    this.planeIcon = document.querySelector(`#plane-icon`);
    this.planeIcon.offsetParent.offsetParent.style.zIndex = 99999;
  }

  /**
   * ...docs go here...
   * @param {*} state
   * @returns
   */
  async updateState(state) {
    this.state = state;
    const now = Date.now();

    if (!this.testRan) {
      this.test();
    }

    // Update questions
    Questions.update(state);

    // Check if we started a new flight because that requires
    // immediately building a new flight trail.
    const startedFlying = !this.lastUpdate.flying && this.state.flying;
    if (startedFlying) this.startNewTrail();

    // Make sure that even if we receive multiple updates per
    // second, we only process "the latest update" once per second:
    if (debounceState(this, state)) return;

    // Update plane visualisation
    const { data: flightData } = state.flightInformation;
    if (flightData) {
      this.updateMap(flightData);
      // Update the attitude indicator:
      Attitude.setPitchBank(flightData.pitch, flightData.bank);
    }

    // Update the autopilot
    const { landingTarget, waypoints, elevation, ...params } =
      state.autopilot ?? {};
    this.autopilot.update(params);
    this.manageWaypoints(waypoints);

    // If we're in auto-landing, show that airport on the map
    if (landingTarget && !this.landingTarget) {
      this.landingTarget = landingTarget;
      const runway = landingTarget.runways[0];
      const { coordinates, bbox } = runway;
      let runwayOutline = new Trail(this.trailLayer, bbox[0], `red`);
      runwayOutline.add(...bbox[1]);
      runwayOutline.add(...bbox[2]);
      runwayOutline.add(...bbox[3]);
      runwayOutline.add(...bbox[0]);

      let centerLine = new Trail(this.trailLayer, coordinates[0], `black`);
      centerLine.add(...coordinates[1]);

      // runway.approach.forEach((approach, idx) => {
      //   let from = runway.coordinates[1 - idx];
      //   let to = approach.anchor;
      //   let approachLine = new Trail(this.trailLayer, from, `gold`);
      //   approachLine.add(...to);

      //   const { offsets } = approach;
      //   let offsetline = new Trail(this.trailLayer, offsets[0], `gold`);
      //   offsetline.add(...offsets[1]);
      // });
    }

    if (flightData) {
      // show the elevation probe, if there is one.
      this.setElevationProbe(flightData.lat, flightData.long, elevation);
      // Update our science
      this.updateChart(flightData, now);
    }

    // Cache and wait for the next state
    this.lastUpdate = { time: now, ...state };
  }

  /**
   * ...docs go here...
   * @param {*} flightData
   * @returns
   */
  async updateMap(flightData) {
    const { paused, crashed, flightInformation } = this.state;
    const { model: flightModel } = flightInformation;
    const { lat, long, speed } = flightData;

    // Do we have a GPS coordinate? (And not the 0/0 you get
    // while you're not in game?)
    if (lat === undefined || long === undefined) return;
    if (abs(lat) < 0.1 && abs(long) < 0.1) return;

    // Did we teleport?
    const latLong = [lat, long];
    const { data: prevFlightData } = this.lastUpdate.flightInformation;
    if (!prevFlightData) return;

    const { lat: lat2, long: long2 } = prevFlightData;
    const d = getDistanceBetweenPoints(lat2, long2, lat, long);
    const kmps = (speed ?? 0) / 1944;
    const teleported = d > 5 * kmps;
    if (teleported) this.startNewTrail(latLong);

    // for some reason this can fail? O_o
    // TODO: do we still need this try/catch?
    this.trail ??= this.startNewTrail();
    this.trail.add(lat, long);

    // Update our map position
    const { planeIcon, marker } = this;
    if (centerBtn.checked) this.map.setView(latLong);
    marker.setLatLng(latLong);

    // update our plane "icon"
    this.planeIcon?.classList.toggle(`paused`, paused);
    const pic = getAirplaneSrc(flightModel.title);
    [...planeIcon.querySelectorAll(`img`)].forEach(
      (img) => (img.src = `planes/${pic}`)
    );
    this.planeIcon.classList.toggle(`crashed`, crashed);
    this.updateMarker(planeIcon, flightData);
  }

  /**
   *
   * @param {*} css
   * @param {*} varData
   */
  updateMarker(planeIcon, flightData) {
    const css = planeIcon.style;
    const { alt, headingBug, groundAlt, lift } = flightData;
    const { heading, speed, trueHeading } = flightData;

    css.setProperty(`--altitude`, lift | 0);
    css.setProperty(`--sqrt-alt`, sqrt(lift) | 0);
    css.setProperty(`--speed`, speed | 0);
    css.setProperty(`--north`, trueHeading - heading);
    css.setProperty(`--heading`, heading);
    css.setProperty(`--heading-bug`, headingBug);

    const altitudeText =
      (groundAlt | 0) === 0 ? `${alt | 0}'` : `${lift | 0}' (${alt | 0}')`;
    planeIcon.querySelector(`.alt`).textContent = altitudeText;
    planeIcon.querySelector(`.speed`).textContent = `${speed | 0}kts`;

    // Update the autopilot fields with the current live value,
    // if the autopilot is not currently engaged.
    this.autopilot.setCurrentAltitude(alt);
    this.autopilot.setCurrentHeading(heading);
  }

  /**
   * ...docs go here...
   */
  updateChart(flightData, now) {
    const { alt, bank, groundAlt, pitch, speed, heading, rudder } = flightData;
    const { VS, pitchTrim, aileronTrim, turnRate, rudderTrim } = flightData;
    const nullDelta = { VS: 0, pitch: 0, bank: 0 };
    const {
      VS: dVS,
      pitch: dPitch,
      bank: dBank,
      speed: dV,
    } = flightData.d ?? nullDelta;

    this.charts.update({
      // basics
      ground: groundAlt,
      altitude: alt,
      speed,
      dV,
      // elevator
      VS,
      dVS,
      pitch,
      dPitch,
      // ailleron
      heading,
      bank,
      dBank,
      turnRate,
      rudder,
      //trim
      pitchTrim,
      aileronTrim,
      rudderTrim,
    });
  }
}

// State update debounce functionality
const debounceState = (() => {
  const DEBOUNCE_INTERVAL = 900;

  let lastDebounceTime = Date.now();
  let lastDebounceState = undefined;
  let debounceTimeout = undefined;

  return function debounceState(receiver, state) {
    const now = Date.now();
    // If enough time has passed, allow this content to get processed:
    if (now - lastDebounceTime > DEBOUNCE_INTERVAL) {
      lastDebounceState = undefined;
      clearTimeout(debounceTimeout);
      return false;
    }
    // If not, store it, and schedule a future update.
    debounceTimeout = setTimeout(() => {
      if (lastDebounceState) {
        receiver.updateState(lastDebounceState);
        lastDebounceState = undefined;
      }
    });
    lastDebounceState = state;
  };
})();
