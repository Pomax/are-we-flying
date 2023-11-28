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
    this.map = map;
    this.autopilot = new Autopilot(this);
    this.waypoints = new WaypointOverlay(this, map);

    // initial bootstrap
    const [lat, long] = (this.lastPos = Duncan);
    this.lastUpdate = {
      lat,
      long,
      flying: false,
      crashed: false,
      flightData: {
        PLANE_LATITUDE: lat,
        PLANE_LONGITUDE: long,
      },
    };
    this.addPlaneIconToMap(map, location, heading);
    this.charts = initCharts(document.querySelector(`#science`));
  }

  /**
   * ...docs go here...
   * @param {*} location
   */
  startNewTrail(location) {
    this.trail = new Trail(this.map, location);
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
  async setElevationProbe(value = false) {
    // remove the old probe line
    if (this.elevationProbe) this.elevationProbe.remove();

    // then draw a new one, but only if there is a value to visualize
    if (!value) return;
    const { PLANE_LATITUDE: lat, PLANE_LONGITUDE: long } =
      this.state.flightData;
    this.elevationProbe = new Trail(
      this.map,
      [lat, long],
      `#4F87`, // lime
      undefined,
      { weight: 30, lineCap: `butt` }
    );
    this.elevationProbe.add(value.lat2, value.long2);
  }

  /**
   * ...docs go here...
   * @param {*} map
   * @param {*} location
   * @param {*} heading
   */
  async addPlaneIconToMap(map, location = Duncan, heading = 0) {
    const props = {
      icon: L.divIcon({
        iconSize: [73 / 2, 50 / 2],
        iconAnchor: [73 / 4, 50 / 4],
        popupAnchor: [10, 10],
        className: `map-pin`,
        html: MapMarker.getHTML(heading),
      }),
    };
    this.map = map;
    this.marker = L.marker(location, props).addTo(map);
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
    const { flightData } = state;
    if (flightData) this.updateMap(flightData, now);

    // Update the attitude indicator:
    Attitude.setPitchBank(flightData.pitch, flightData.bank);

    // Update the autopilot
    const { waypoints, elevation, ...params } = state.autopilot ?? {};
    this.autopilot.update(params);
    this.manageWaypoints(waypoints);
    this.setElevationProbe(elevation);

    // Update our science
    this.updateChart(flightData, now);

    // Cache and wait for the next state
    this.lastUpdate = { time: now, ...state };
  }

  /**
   * ...docs go here...
   * @param {*} flightData
   * @returns
   */
  async updateMap(flightData, now) {
    const { paused, crashed, flightModel } = this.state;
    const { lat, long, speed } = flightData;

    // Do we have a GPS coordinate? (And not the 0/0 you get
    // while you're not in game?)
    if (lat === undefined || long === undefined) return;
    if (abs(lat) < 0.1 && abs(long) < 0.1) return;

    // Did we teleport?
    const latLong = [lat, long];
    const { lat: lat2, long: long2 } = this.lastUpdate.flightData;
    const d = getDistanceBetweenPoints(lat2, long2, lat, long);
    const kmps = (speed ?? 0) / 1944;
    const teleported = this.lastUpdate.flightData && d > 5 * kmps;
    if (teleported) {
      this.startNewTrail(latLong);
      this.autopilot.update(await this.server.autopilot.getParameters());
    }

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
    const pic = getAirplaneSrc(flightModel.TITLE);
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
    const { alt, headingBug, cg, groundAlt, altAboveGround } = flightData;
    const { heading, speed, trueHeading } = flightData;

    const palt = altAboveGround - cg;

    css.setProperty(`--altitude`, max(palt, 0));
    css.setProperty(`--sqrt-alt`, sqrt(max(palt, 0)));
    css.setProperty(`--speed`, speed | 0);
    css.setProperty(`--north`, trueHeading - heading);
    css.setProperty(`--heading`, heading);
    css.setProperty(`--heading-bug`, headingBug);

    const altitudeText =
      (groundAlt | 0) === 0 ? `${alt | 0}'` : `${palt | 0}' (${alt | 0}')`;
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
    const { alt, bank, groundAlt, pitch, speed, heading } = flightData;
    const { VS, pitchTrim, aileronTrim, turnRate, rudderTrim } = flightData;
    const {
      VS: dVS,
      pitch: dPitch,
      bank: dBank,
    } = flightData.delta ?? { VS: 0, pitch: 0, bank: 0 };
    this.charts.update({
      // basics
      ground: groundAlt,
      altitude: alt,
      speed,
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
