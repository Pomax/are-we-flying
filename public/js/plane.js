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
    this.elevationProbe = new Trail(
      this.map,
      [
        this.state.flightData.PLANE_LATITUDE,
        this.state.flightData.PLANE_LONGITUDE,
      ],
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

    // update questions
    Questions.update(state);

    // update plane visualisation
    const { flightData } = state;
    if (flightData) this.updateMap(flightData, now);

    // update the autopilot
    if (state.autopilot) {
      const { waypoints, elevation, ...params } = state.autopilot;
      this.autopilot.update(params);
      this.manageWaypoints(waypoints);
      this.setElevationProbe(elevation);
    }

    // cache and wait for the next state
    this.lastUpdate = { time: now, ...state };
  }

  /**
   * ...docs go here...
   * @param {*} flightData
   * @returns
   */
  async updateMap(flightData, now) {
    const {
      PLANE_LATITUDE: lat,
      PLANE_LONGITUDE: long,
      INDICATED_ALTITUDE: alt,
      AIRSPEED_INDICATED: speed,
      GROUND_ALTITUDE: galt,
      STATIC_CG_TO_GROUND: cg,
      PLANE_ALT_ABOVE_GROUND: paag,
      PLANE_HEADING_DEGREES_TRUE: trueHeading,
      PLANE_HEADING_DEGREES_MAGNETIC: heading,
      AUTOPILOT_HEADING_LOCK_DIR: bug,
      VERTICAL_SPEED: vspeed,
      PLANE_PITCH_DEGREES: pitch,
      ELEVATOR_TRIM_POSITION: trim,
      PLANE_BANK_DEGREES: bank,
      TURN_INDICATOR_RATE: turnRate,
      AILERON_TRIM_PCT: aTrim,
    } = flightData;

    // Do we have a GPS coordinate? (And not the 0/0 you get
    // while you're not in game?)
    if (lat === undefined || long === undefined) return;
    if (abs(lat) < 0.1 && abs(long) < 0.1) return;
    setText(`#lat`, lat.toFixed(5));
    setText(`#long`, long.toFixed(5));

    // Did we start a new flight?
    const latLong = [lat, long];
    const startedFlying = !this.lastUpdate.flying && this.state.flying;
    const d = getDistanceBetweenPoints(
      this.lastUpdate.flightData.PLANE_LATITUDE,
      this.lastUpdate.flightData.PLANE_LONGITUDE,
      this.state.flightData.PLANE_LATITUDE,
      this.state.flightData.PLANE_LONGITUDE
    );

    // Determine teleport distance based on the current airspeed
    const kmps = (this.state.flightData.AIRSPEED_INDICATED ?? 0) / 0.00195;
    const teleported = this.lastUpdate.flightData && d > 2 * kmps;
    if (startedFlying || teleported) {
      this.startNewTrail(latLong);
      this.autopilot.update(await this.server.autopilot.getParameters());
    }

    // for some reason this can fail? O_o
    // TODO: do we still need this try/catch?
    try {
      this.trail.add(lat, long);
    } catch (e) {
      console.error(e);
    }

    // Update our map position
    const { planeIcon, marker } = this;
    if (centerBtn.checked) this.map.setView(latLong);
    marker.setLatLng(latLong);

    // update our plane "icon"
    this.planeIcon?.classList.toggle(`paused`, this.state.paused);
    const pic = getAirplaneSrc(this.state.flightModel.TITLE);
    [...planeIcon.querySelectorAll(`img`)].forEach(
      (img) => (img.src = `planes/${pic}`)
    );
    this.planeIcon.classList.toggle(`crashed`, this.state.crashed);

    // and all the flight aspects
    const st = planeIcon.style;
    const palt = paag - cg;
    this.autopilot.setCurrentAltitude(palt);
    st.setProperty(`--altitude`, max(palt, 0));
    st.setProperty(`--sqrt-alt`, sqrt(max(palt, 0)));
    st.setProperty(`--speed`, speed | 0);
    st.setProperty(`--north`, trueHeading - heading);
    st.setProperty(`--heading`, heading);
    st.setProperty(`--heading-bug`, bug);
    const altitudeText =
      (galt | 0) === 0 ? `${alt | 0}'` : `${palt | 0}' (${alt | 0}')`;
    planeIcon.querySelector(`.alt`).textContent = altitudeText;
    planeIcon.querySelector(`.speed`).textContent = `${speed | 0}kts`;
    Attitude.setPitchBank(pitch, bank);

    // finally, update our chart
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
