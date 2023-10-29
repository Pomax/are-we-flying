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
const setText = (qs, text) => (document.querySelector(qs).textContent = text);

// Helper function: change sim var naming into something more manageable.
function getVarData(flightData) {
  const {
    AILERON_TRIM_PCT: aTrim,
    AIRSPEED_INDICATED: speed,
    AUTOPILOT_HEADING_LOCK_DIR: bug,
    ELEVATOR_TRIM_POSITION: trim,
    GROUND_ALTITUDE: galt,
    INDICATED_ALTITUDE: alt,
    PLANE_ALT_ABOVE_GROUND: paag,
    PLANE_BANK_DEGREES: bank,
    PLANE_HEADING_DEGREES_MAGNETIC: heading,
    PLANE_HEADING_DEGREES_TRUE: trueHeading,
    PLANE_LATITUDE: lat,
    PLANE_LONGITUDE: long,
    PLANE_PITCH_DEGREES: pitch,
    STATIC_CG_TO_GROUND: cg,
    TURN_INDICATOR_RATE: turnRate,
    VERTICAL_SPEED: vspeed,
  } = flightData;
  return {
    ...{ lat, long },
    ...{ alt, bank, bug, cg, galt, paag },
    ...{ heading, pitch, speed, trueHeading },
    ...{ vspeed, trim, aTrim, turnRate },
  };
}

/**
 * ...docs go here...
 */
export class Plane {
  constructor(server, map = defaultMap, location = Duncan, heading = 135) {
    console.log(`building plane`);
    this.server = server;
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
    this.charts = initCharts();
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
  async manageWaypoints(waypoints) {
    this.waypoints.manage(waypoints);
  }

  /**
   * ...docs go here...
   * @param {*} value
   * @returns
   */
  async setElevationProbe(value) {
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

    // Check if we started a new flight because that requires
    // immediately building a new flight trail.
    const startedFlying = !this.lastUpdate.flying && this.state.flying;
    if (startedFlying) {
      this.startNewTrail();
      this.lastUpdate.flying = true;
    }

    // And then debounce any real UI updates to once per secondish
    if (now - this.lastUpdate.time < 995) return;

    // Update questions
    Questions.update(state);

    // Update plane visualisation
    const { flightData } = state;
    if (flightData) this.updateMap(flightData, now);

    // Update the autopilot
    if (state.autopilot) {
      const { waypoints, elevation, ...params } = state.autopilot;
      this.autopilot.update(params);
      this.manageWaypoints(waypoints);
      this.setElevationProbe(elevation);
    }

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
    const varData = getVarData(flightData);
    const { lat, long, speed } = varData;

    // Do we have a GPS coordinate? (And not the 0/0 you get
    // while you're not in game?)
    if (lat === undefined || long === undefined) return;
    if (abs(lat) < 0.1 && abs(long) < 0.1) return;
    setText(`#lat`, lat.toFixed(5));
    setText(`#long`, long.toFixed(5));

    // Did we teleport?
    const latLong = [lat, long];
    const { PLANE_LATITUDE: lat2, PLANE_LONGITUDE: long2 } =
      this.lastUpdate.flightData;
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
    this.setCSSVariables(planeIcon, varData);

    // And update the graphs
    this.updateChart(varData, now);
  }

  /**
   *
   * @param {*} css
   * @param {*} varData
   */
  setCSSVariables(planeIcon, varData) {
    const css = planeIcon.style;
    const { alt, bank, bug, cg, galt, paag } = varData;
    const { heading, pitch, speed, trueHeading } = varData;
    const palt = paag - cg;

    this.autopilot.setCurrentAltitude(palt);
    css.setProperty(`--altitude`, max(palt, 0));
    css.setProperty(`--sqrt-alt`, sqrt(max(palt, 0)));
    css.setProperty(`--speed`, speed | 0);
    css.setProperty(`--north`, trueHeading - heading);
    css.setProperty(`--heading`, heading);
    css.setProperty(`--heading-bug`, bug);

    const altitudeText =
      (galt | 0) === 0 ? `${alt | 0}'` : `${palt | 0}' (${alt | 0}')`;
    planeIcon.querySelector(`.alt`).textContent = altitudeText;
    planeIcon.querySelector(`.speed`).textContent = `${speed | 0}kts`;
    Attitude.setPitchBank(pitch, bank);
  }

  /**
   * ...docs go here...
   */
  updateChart(varData, now) {
    const { alt, bank, galt, pitch, speed, heading } = varData;
    const { vspeed, trim, aTrim, turnRate } = varData;

    this.charts.update({
      ground: galt,
      altitude: alt,
      vspeed: vspeed,
      dvs: (vspeed - this.lastUpdate.vspeed) / (now - this.lastUpdate.time),
      speed: speed,
      pitch: pitch,
      trim: trim,
      heading: heading - 180,
      bank: bank,
      dbank: (bank - this.lastUpdate.bank) / (now - this.lastUpdate.time),
      "turn rate": turnRate,
      "aileron trim": aTrim,
    });
  }
}
