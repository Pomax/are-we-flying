import { deg, dist, Sequence, waitFor } from "./utils.js";
import { getAPI, addEventListenerAPI, clearEventListenersAPI } from "./api.js";
import { Duncan } from "./locations.js";
import { Autopilot } from "./autopilot.js";
import { Attitude } from "./attitude.js";
import { Trail } from "./trail.js";
import { Questions } from "./questions.js";
import { getAirplaneSrc } from "./airplane-src.js";
import { centerBtn } from "./maps.js";
import { MapMarker } from "./map-marker.js";
import { initCharts } from "./dashboard/charts.js";
import { FlightModel } from "./flight-model.js";
import { WaypointOverlay } from "./waypoint-manager.js";

const L = await waitFor(async () => window.L);
const { abs, max, PI: π, sqrt } = Math;

let paused = false;

// our "startup DFA" states that we have to run through in-sequence.

const WAIT_FOR_GAME = Symbol(`wait for game`);
const WAIT_FOR_MODEL = Symbol(`wait for model`);
const WAIT_FOR_ENGINES = Symbol(`wait for engines`);
const POLLING_GAME = Symbol(`polling game`);

const POLLING_PROPS = [
  "AILERON_TRIM_PCT",
  "AIRSPEED_TRUE",
  "AUTOPILOT_MASTER",
  "AUTOPILOT_HEADING_LOCK_DIR",
  "CRASH_FLAG",
  "CRASH_SEQUENCE",
  "ELEVATOR_TRIM_POSITION",
  "GPS_GROUND_TRUE_TRACK",
  "GROUND_ALTITUDE",
  "INDICATED_ALTITUDE",
  "PLANE_ALT_ABOVE_GROUND",
  "PLANE_BANK_DEGREES",
  "PLANE_HEADING_DEGREES_MAGNETIC",
  "PLANE_HEADING_DEGREES_TRUE",
  "PLANE_LATITUDE",
  "PLANE_LONGITUDE",
  "PLANE_PITCH_DEGREES",
  "SIM_ON_GROUND",
  "STATIC_CG_TO_GROUND",
  "TITLE",
  "TURN_INDICATOR_RATE",
  "VERTICAL_SPEED",
];

export class Plane {
  constructor(map, location, heading) {
    console.log(`building plane`);
    this.autopilot = new Autopilot(this);
    this.waypoints = new WaypointOverlay(this, map);

    // initial bootstrap
    const [lat, long] = (this.lastPos = Duncan);
    this.lastUpdate = { lat, long, crashe: false };
    this.state = {};
    this.addPlaneIconToMap(map, location, heading);

    // and then get ready for flying
    this.sequencer = new Sequence(
      WAIT_FOR_GAME,
      WAIT_FOR_MODEL,
      WAIT_FOR_ENGINES,
      POLLING_GAME
    );
    this.eventsRegistered = false;
    this.charts = initCharts();
    this.waitForInGame();
  }

  reset() {
    this.sequencer.reset();
    this.eventsRegistered = false;
    clearEventListenersAPI();
  }

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

  async setElevationProbe(value) {
    // remove the old probe line
    if (this.elevationProbe) this.elevationProbe.remove();

    // then draw a new one, but only if there is one.
    if (!value) return;
    this.elevationProbe = new Trail(
      this.map,
      [this.state.lat, this.state.long],
      `#4F87`, // lime
      undefined,
      { weight: 30, lineCap: `butt` }
    );
    this.elevationProbe.add(value.lat2, value.long2);
  }

  async manageWaypoints(data) {
    this.waypoints.manage(data);
  }

  startNewTrail(location) {
    this.trail = new Trail(this.map, location);
  }

  async waitForInGame() {
    this.sequencer.start();
    console.log(`wait for in-game`);

    // If we already registered for events, we don't need to re-register.
    if (this.eventsRegistered) return;
    this.eventsRegistered = true;

    addEventListenerAPI(`SIM`, async ([state]) => {
      if (state === 1) {
        Questions.resetPlayer();
        Questions.inGame(true);
        this.waitForModel();
      }
    });

    this.pause = async () => {
      this.paused = true;
      this.planeIcon?.classList.add(`paused`);
    };

    addEventListenerAPI(`PAUSED`, this.pause);

    this.unpause = async () => {
      this.paused = false;
      this.planeIcon?.classList.remove(`paused`);
      if (!this.sequencer.state) {
        this.sequencer.start();
        this.waitForModel();
      }
    };

    addEventListenerAPI(`UNPAUSED`, this.unpause);

    addEventListenerAPI(`VIEW`, async () => {
      // the view event data is useless, but we use it as signal for checking what the camera state is:
      const { CAMERA_STATE: camera } = await getAPI(`CAMERA_STATE`);

      // If the camera enum is 10 or higher, we are not actually in-game, even if the SIM variable is 1.
      if (camera > 10) {
        console.log(`out-of-game camera, resetting sequence`);
        this.sequencer.reset();
      }

      // So of course, if the camera is an in-game value and we hadn't started, start our sequence.
      else if (!this.sequencer.state) {
        console.log(`in-game camera while out of sequence: starting sequence`);
        this.unpause();
        this.sequencer.start();
        this.waitForModel();
      }
    });
  }

  async waitForModel() {
    const { sequencer } = this;
    if (sequencer.state !== WAIT_FOR_GAME) return;
    sequencer.next();

    console.log(`loading model`);
    const model = (this.flightModel = new FlightModel());
    const { title, lat, long, engineCount } = await model.bootstrap();
    this.lastUpdate.lat = lat;
    this.lastUpdate.long = long;
    console.log(model.values);

    Questions.modelLoaded(title);
    this.startNewTrail([lat, long]);
    const once = true;
    this.update(once);
    this.waitForEngines(engineCount);
  }

  async waitForEngines(engineCount) {
    const { sequencer } = this;
    if (sequencer.state !== WAIT_FOR_MODEL) return;
    sequencer.next();
    console.log(`waiting for engines`);

    const engines = [
      `ENG_COMBUSTION:1`,
      `ENG_COMBUSTION:2`,
      `ENG_COMBUSTION:3`,
      `ENG_COMBUSTION:4`,
    ];

    const checkEngines = async () => {
      console.log(`check...`);
      const results = await getAPI(...engines);
      for (let i = 1; i <= engineCount; i++) {
        if (results[`ENG_COMBUSTION:${i}`]) {
          console.log(`engines are running`);
          Questions.enginesRunning(true);
          return this.startPolling();
        }
      }
      setTimeout(checkEngines, 1000);
    };

    checkEngines();
  }

  async startPolling() {
    const { sequencer } = this;
    if (sequencer.state !== WAIT_FOR_ENGINES) return;
    sequencer.next();
    console.log(`starting the update poll`);
    this.update();

    // this.setupAirportHandling(this.map);
  }

  async update(once = false) {
    if (!once && this.sequencer.state !== POLLING_GAME) return;
    if (!once && this.locked_for_updates) return;
    const data = await getAPI(...POLLING_PROPS);
    if (data === null) return;
    this.setState(data);
    this.updatePage(data);
    if (!once) {
      this.locked_for_updates = true;
      setTimeout(() => {
        this.locked_for_updates = false;
        this.update();
      }, 1000);
    }
  }

  // our "set state" function basically transforms all the game data into values and units we can use.
  async setState(data) {
    if (data.TITLE === undefined) return;

    if (this.state.title !== data.TITLE) {
      // Update our plane, because thanks to dev tools and add-ons, people can just switch planes mid-flight:
      Questions.modelLoaded(data.TITLE);
      // update our map icon
      const pic = getAirplaneSrc(data.TITLE);
      [...this.planeIcon.querySelectorAll(`img`)].forEach(
        (img) => (img.src = `planes/${pic}`)
      );
    }

    // start our current state object:
    this.state = {
      title: data.TITLE,
      cg: data.STATIC_CG_TO_GROUND,
    };

    Object.assign(this.state, {
      lat: deg(data.PLANE_LATITUDE),
      long: deg(data.PLANE_LONGITUDE),
      airBorn:
        data.SIM_ON_GROUND === 0 || this.state.alt > this.state.galt + 30,
      alt: data.INDICATED_ALTITUDE,
      aTrim: data.AILERON_TRIM_PCT,
      crashed: !(data.CRASH_FLAG === 0 && data.CRASH_SEQUENCE === 0),
      bank: deg(data.PLANE_BANK_DEGREES),
      bug: data.AUTOPILOT_HEADING_LOCK_DIR,
      galt: data.GROUND_ALTITUDE,
      heading: deg(data.PLANE_HEADING_DEGREES_MAGNETIC),
      palt: data.PLANE_ALT_ABOVE_GROUND - this.state.cg,
      pitch: deg(data.PLANE_PITCH_DEGREES),
      speed: data.AIRSPEED_TRUE,
      trim: data.ELEVATOR_TRIM_POSITION,
      trueHeading: deg(data.PLANE_HEADING_DEGREES_TRUE),
      turnRate: deg(data.TURN_INDICATOR_RATE),
      vspeed: data.VERTICAL_SPEED,
      yaw: deg(
        data.PLANE_HEADING_DEGREES_MAGNETIC - data.GPS_GROUND_TRUE_TRACK
      ),
    });

    // check to see if we need to mark the plane as crashed or not
    const crashed = this.state.crashed;
    if (this.lastUpdate.crashed !== crashed) {
      const fn = crashed ? `add` : `remove`;
      this.planeIcon.classList[fn](`crashed`);
      Questions.planeCrashed(crashed);
    }
  }

  async updatePage(data) {
    if (paused) return;

    const now = Date.now();
    const { airBorn, speed, alt, galt, palt, vspeed, lat, long } = this.state;
    const latLong = [lat, long];

    if (airBorn && speed > 0) {
      Questions.inTheAir(true);
      Questions.usingAutoPilot(data.AUTOPILOT_MASTER);
    }

    this.autopilot.setCurrentAltitude(alt);

    // Do we have a GPS coordinate? (And not the 0/0 you get while you're not in game?)
    if (lat === undefined || long === undefined) return;
    if (abs(lat) < 0.1 && abs(long) < 0.1) return;
    document.getElementById(`lat`).textContent = lat.toFixed(5);
    document.getElementById(`long`).textContent = long.toFixed(5);

    // location change (or slew mode)
    // 1 knot is 1.852 km/h, or 0.0005 km/s, which is 0.000005 degrees of arc per second.
    // the "speed" is in (true) knots, so if we move more than speed * 0.000005 degrees,
    // we know we teleported. Or the game's glitching. So to humour glitches, we'll
    // double that to speed * 0.00001 and use that as cutoff value:
    const moved = dist(this.lastUpdate.lat, this.lastUpdate.long, lat, long);
    if (moved > speed * 0.0001) this.startNewTrail(latLong);

    // Update our map and plane icon
    if (centerBtn.checked) this.map.setView(latLong);
    this.marker.setLatLng(latLong);

    try {
      this.trail.add(lat, long);
    } catch (e) {
      console.error(e);
    }

    this.lastUpdate.lat;
    this.lastUpdate.long = long;

    const { bank, pitch, trim, aTrim, heading, trueHeading, turnRate, bug } =
      this.state;
    const { planeIcon } = this;
    const st = planeIcon.style;
    st.setProperty(`--altitude`, max(palt, 0));
    st.setProperty(`--sqrt-alt`, sqrt(max(palt, 0)));
    st.setProperty(`--speed`, speed | 0);
    st.setProperty(`--north`, trueHeading - heading);
    st.setProperty(`--heading`, heading);
    st.setProperty(`--heading-bug`, bug);

    let altitude =
      (galt | 0) === 0 ? `${alt | 0}'` : `${palt | 0}' (${alt | 0}')`;
    planeIcon.querySelector(`.alt`).textContent = altitude;
    planeIcon.querySelector(`.speed`).textContent = `${speed | 0}kts`;

    Attitude.setPitchBank(pitch, bank);

    const trimToDegree = (v) => (v / (Math.PI / 10)) * 90;

    this.charts.update({
      ground: galt,
      altitude: alt,
      vspeed: vspeed * 60,
      dvs:
        ((vspeed - this.lastUpdate.vspeed) * 60) / (now - this.lastUpdate.time),
      speed: speed,
      pitch: pitch,
      trim: trimToDegree(trim),
      heading: heading - 180,
      bank: bank,
      dbank: (bank - this.lastUpdate.bank) / (now - this.lastUpdate.time),
      "turn rate": turnRate,
      "aileron trim": aTrim * 100,
    });

    this.lastUpdate = { time: now, ...this.state };
  }

  // TEST

  async setupAirportHandling(map) {
    this.airports = [];
    addEventListenerAPI(`AIRPORTS_IN_RANGE`, ([airports]) =>
      this.addAirports(map, airports)
    );
    addEventListenerAPI(`AIRPORTS_OUT_OF_RANGE`, ([airports]) =>
      this.removeAirports(airports)
    );
    const { NEARBY_AIRPORTS } = await getAPI(`NEARBY_AIRPORTS`);
    console.log(NEARBY_AIRPORTS);
    this.addAirports(map, NEARBY_AIRPORTS);
  }

  addAirports(map, added) {
    const { airports } = this;
    added.forEach((airport) => {
      const { icao, latitude, longitude } = airport;
      const marker = L.circle([latitude, longitude], 1);
      marker.bindTooltip(icao, {
        permanent: true,
        direction: "bottom",
      });
      marker.addTo(map);
      airports.push({ icao, marker });
    });
  }

  removeAirports(removed) {
    const { airports } = this;
    removed.forEach((airport) => {
      const pos = airports.findIndex((e) => e.icao === airport.icao);
      if (pos > -1) {
        const { marker } = airports[pos];
        marker.remove();
        airports.splice(pos, 1);
      }
    });
  }
}
